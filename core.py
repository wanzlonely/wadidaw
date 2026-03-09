"""
core.py — session management, browser, scraper, injector, engine
"""
import os, re, math, time, glob, pickle, threading
from collections import Counter
from datetime import date, datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException, InvalidSessionIdException
import requests

from config import (
    ENV, BASE_DIR, URL_BASE, URL_LOGIN, URL_PORTAL, URL_LIVE, URL_NUMBERS, URL_HUB,
    RELOAD_INTERVAL, NOMOR_PER_REQUEST, INJECT_DELAY, MAX_FAIL,
    API_POLL_INTERVAL, AUTO_RANGE_INTERVAL, AUTO_RANGE_IDLE_TTL, AUTO_RANGE_QTY,
    POLL_INTERVAL, TOP_N, find_chrome, find_driver, log
)
from database import db_get, db_update, db_all

# ─────────────────────────────────────────────
# SESSION
# ─────────────────────────────────────────────
_sessions: dict          = {}
_sess_lock: threading.Lock = threading.Lock()


def sess_get(cid) -> dict | None:
    with _sess_lock: return _sessions.get(str(cid))

def sess_new(cid) -> dict:
    cid = str(cid)
    dl  = os.path.join(BASE_DIR, f"dl_{cid}")
    pf  = os.path.join(BASE_DIR, f"prof_{cid}")
    ck  = os.path.join(BASE_DIR, f"cookie_{cid}.pkl")
    os.makedirs(dl, exist_ok=True)
    os.makedirs(pf, exist_ok=True)
    s = {
        "driver":             None,
        "driver_lock":        threading.Lock(),
        "busy":               threading.Event(),
        "seen_ids":           set(),
        "wa_harian":          Counter(),
        "data_lock":          threading.Lock(),
        "tanggal":            date.today(),
        "start_time":         datetime.now(),
        "last_reload":        0.0,
        "is_logged_in":       False,
        "last_dash_id":       None,
        "hub":                {"ready": False, "email": None, "system": None, "chat_type": None},
        "thread":             None,
        "stop_flag":          threading.Event(),
        "download_dir":       dl,
        "profile_dir":        pf,
        "cookie_file":        ck,
        "fwd_group_id":       None,
        "fwd_enabled":        False,
        "otp_seen_ids":       set(),
        "auto_range_enabled": True,
        "auto_range_done":    set(),
        "auto_range_date":    None,
        "range_last_msg":     {},
        "active_ranges":      set(),
        "last_api_poll":      0.0,
        "last_auto_range":    0.0,
        "traffic_counter":    Counter(),
    }
    with _sess_lock: _sessions[cid] = s
    return s

def sess_del(cid):
    cid = str(cid)
    with _sess_lock: s = _sessions.pop(cid, None)
    if s:
        try: s["stop_flag"].set()
        except Exception: pass
        if s.get("driver"):
            try: s["driver"].quit()
            except Exception: pass

def sess_all() -> dict:
    with _sess_lock: return dict(_sessions)


# ─────────────────────────────────────────────
# BROWSER
# ─────────────────────────────────────────────
def make_driver(s: dict):
    chrome   = find_chrome()
    drv_path = find_driver()

    if not chrome:
        raise RuntimeError(
            "Chrome/Chromium tidak ditemukan.\n"
            "Termux: pkg install chromium\n"
            "VPS/Docker: apt install chromium chromium-driver"
        )

    log.info(f"Chrome: {chrome} | Driver: {drv_path or 'auto'}")
    opt = Options()
    opt.binary_location = chrome

    args = [
        "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--disable-setuid-sandbox", "--no-zygote",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800",
        f"--user-data-dir={s['profile_dir']}",
        "--disable-extensions", "--disable-notifications", "--mute-audio",
        "--disable-web-security", "--allow-running-insecure-content",
        "--ignore-certificate-errors", "--ignore-ssl-errors",
        "--disable-features=VizDisplayCompositor",
        "--disable-background-networking", "--disable-default-apps",
        "--disable-sync", "--disable-translate",
        "--metrics-recording-only", "--safebrowsing-disable-auto-update",
        "--password-store=basic", "--use-mock-keychain",
        "--disable-hang-monitor", "--disable-prompt-on-repost",
        "--disable-client-side-phishing-detection",
    ]
    if ENV == "termux":
        args.append("--js-flags=--max-old-space-size=256")

    for a in args:
        opt.add_argument(a)

    opt.add_experimental_option("prefs", {
        "download.default_directory":   s["download_dir"],
        "download.prompt_for_download": False,
        "download.directory_upgrade":   True,
        "safebrowsing.enabled":         True,
    })
    opt.add_experimental_option("excludeSwitches", ["enable-automation"])
    opt.add_experimental_option("useAutomationExtension", False)

    if drv_path:
        drv = webdriver.Chrome(service=Service(drv_path), options=opt)
    else:
        # Coba webdriver-manager sebagai fallback untuk Termux
        try:
            from webdriver_manager.chrome import ChromeDriverManager
            from webdriver_manager.core.os_manager import ChromeType
            drv = webdriver.Chrome(
                service=Service(ChromeDriverManager(chrome_type=ChromeType.CHROMIUM).install()),
                options=opt
            )
        except Exception:
            drv = webdriver.Chrome(options=opt)

    try:
        drv.execute_cdp_cmd("Page.setDownloadBehavior",
                            {"behavior": "allow", "downloadPath": s["download_dir"]})
        drv.execute_cdp_cmd("Network.setUserAgentOverride", {
            "userAgent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
        })
    except Exception as e:
        log.warning(f"CDP non-fatal: {e}")

    drv.set_page_load_timeout(30)
    drv.set_script_timeout(20)
    return drv


def do_login_driver(driver, email: str, password: str) -> bool:
    driver.get(URL_LOGIN); time.sleep(2.5)
    e_field = None
    for by, sel in [
        (By.ID,"card-email"), (By.ID,"email"), (By.NAME,"email"),
        (By.CSS_SELECTOR,"input[type='email']"),
        (By.CSS_SELECTOR,"input[placeholder*='email' i]"),
    ]:
        try:
            e_field = WebDriverWait(driver, 6).until(
                EC.presence_of_element_located((by, sel))); break
        except Exception: pass
    if not e_field: raise Exception("Email field tidak ditemukan")

    p_field = None
    for by, sel in [
        (By.ID,"card-password"), (By.ID,"password"),
        (By.NAME,"password"), (By.CSS_SELECTOR,"input[type='password']"),
    ]:
        try: p_field = driver.find_element(by, sel); break
        except Exception: pass
    if not p_field: raise Exception("Password field tidak ditemukan")

    e_field.clear(); e_field.send_keys(email)
    p_field.clear(); p_field.send_keys(password); time.sleep(0.8)

    clicked = False
    for by, sel in [
        (By.CSS_SELECTOR,"button[name='submit']"),
        (By.CSS_SELECTOR,"button[type='submit']"),
        (By.XPATH,"//button[contains(translate(text(),"
                  "'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'login')]"),
        (By.CSS_SELECTOR,"input[type='submit']"),
    ]:
        try:
            btn = WebDriverWait(driver, 4).until(EC.element_to_be_clickable((by, sel)))
            driver.execute_script("arguments[0].click();", btn)
            clicked = True; break
        except Exception: pass
    if not clicked: raise Exception("Submit button tidak ditemukan")
    time.sleep(4)
    return "login" not in driver.current_url


def try_cookie_login(driver, s: dict) -> bool:
    cf = s["cookie_file"]
    if not os.path.exists(cf): return False
    try:
        driver.get(URL_BASE); time.sleep(1.2)
        with open(cf, "rb") as f:
            cookies = pickle.load(f)
        for c in cookies:
            try: driver.add_cookie(c)
            except Exception: pass
        driver.get(URL_PORTAL); time.sleep(2)
        if "login" not in driver.current_url: return True
        os.remove(cf); return False
    except Exception:
        return False


def save_cookies(driver, s: dict):
    try:
        with open(s["cookie_file"], "wb") as f:
            pickle.dump(driver.get_cookies(), f)
    except Exception: pass


def init_hub(driver, s: dict, email: str, chat_name: str):
    hub_url = None
    try:
        driver.get(URL_PORTAL); time.sleep(1.5)
        for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
            src = iframe.get_attribute("src") or ""
            if "hub.orangecarrier.com" in src:
                hub_url = src; break
    except Exception: pass
    if not hub_url:
        hub_url = f"{URL_HUB}?system=ivas"
    driver.get(hub_url)
    for _ in range(30):
        time.sleep(0.25)
        try:
            if driver.execute_script(
                    "return typeof socket!=='undefined'&&socket.connected;"): break
        except Exception: pass
    try:
        ov = driver.find_element(By.ID, "chatEmailOverlay")
        if ov.is_displayed():
            inp = WebDriverWait(driver, 5).until(
                EC.visibility_of_element_located((By.ID, "chatEmailInput")))
            inp.clear(); inp.send_keys(email)
            driver.find_element(By.ID, "chatNameInput").send_keys(chat_name)
            driver.execute_script("arguments[0].click();",
                driver.find_element(By.CSS_SELECTOR,
                    "#chatEmailForm button[type='submit']"))
            time.sleep(2.5)
    except Exception: pass
    info = None
    for _ in range(8):
        time.sleep(0.4)
        try:
            info = driver.execute_script(
                "return(typeof currentUserInfo!=='undefined'&&currentUserInfo)"
                "?{email:currentUserInfo.email,system:currentSystem,"
                "type:(typeof chatAuth!=='undefined'"
                "?chatAuth.getChatType():'internal')}:null;")
            if info and info.get("email"): break
        except Exception: pass
    if not info or not info.get("email"):
        info = {"email": email, "system": "ivas", "type": "internal"}
    s["hub"].update({
        "ready":     True,
        "email":     info["email"],
        "system":    info.get("system", "ivas"),
        "chat_type": info.get("type", "internal"),
    })
    log.info(f"Hub ready — {info['email']} / {info.get('system')}")


# ─────────────────────────────────────────────
# SCRAPER
# ─────────────────────────────────────────────
_JS_SCRAPE = (
    "var o=[];"
    "document.querySelectorAll('table tbody tr').forEach(function(r){"
    "  var td=r.querySelectorAll('td');"
    "  if(td.length<2)return;"
    "  var row=[];"
    "  for(var i=0;i<td.length;i++)row.push(td[i].innerText.trim());"
    "  o.push(row);"
    "});"
    "return o;"
)

def parse_country(raw: str) -> str:
    first = raw.split("\n")[0].strip()
    return " ".join(w for w in first.split() if not w.isdigit()).upper()

def parse_range_full(raw: str) -> str:
    return raw.split("\n")[0].strip().upper()

def extract_otp(msg_text: str) -> str | None:
    patterns = [
        r"(?:^|\D)(\d{4,8})(?:\D|$)",
        r"code[:\s]+([\d\-]+)",
        r"OTP[:\s]+([\d\-]+)",
        r"kode[:\s]+([\d\-]+)",
    ]
    for p in patterns:
        m = re.search(p, msg_text, re.IGNORECASE)
        if m:
            code = m.group(1).replace("-", "").strip()
            if 4 <= len(code) <= 8: return code
    return None

def get_country_flag(country_name: str) -> str:
    flags = {
        "PERU":"🇵🇪","COLOMBIA":"🇨🇴","MEXICO":"🇲🇽","BRAZIL":"🇧🇷","CHILE":"🇨🇱",
        "ARGENTINA":"🇦🇷","ECUADOR":"🇪🇨","VENEZUELA":"🇻🇪","BOLIVIA":"🇧🇴",
        "USA":"🇺🇸","UNITED STATES":"🇺🇸","UK":"🇬🇧","UNITED KINGDOM":"🇬🇧",
        "INDONESIA":"🇮🇩","INDIA":"🇮🇳","PHILIPPINES":"🇵🇭","VIETNAM":"🇻🇳",
        "THAILAND":"🇹🇭","MALAYSIA":"🇲🇾","SINGAPORE":"🇸🇬","MYANMAR":"🇲🇲",
        "NIGERIA":"🇳🇬","GHANA":"🇬🇭","KENYA":"🇰🇪","ETHIOPIA":"🇪🇹",
        "TOGO":"🇹🇬","BENIN":"🇧🇯","CAMEROON":"🇨🇲","SENEGAL":"🇸🇳",
        "ZIMBABWE":"🇿🇼","ZAMBIA":"🇿🇲","MOZAMBIQUE":"🇲🇿","TANZANIA":"🇹🇿",
        "IVORY COAST":"🇨🇮","COTE D IVOIRE":"🇨🇮","RUSSIA":"🇷🇺","UKRAINE":"🇺🇦",
        "GERMANY":"🇩🇪","FRANCE":"🇫🇷","SPAIN":"🇪🇸","ITALY":"🇮🇹",
        "TURKEY":"🇹🇷","EGYPT":"🇪🇬","PAKISTAN":"🇵🇰","BANGLADESH":"🇧🇩",
        "SRI LANKA":"🇱🇰","CAMBODIA":"🇰🇭","LAOS":"🇱🇦","NEPAL":"🇳🇵",
        "IRELAND":"🇮🇪","ANGOLA":"🇦🇴",
    }
    cn = country_name.upper().strip()
    for k, v in flags.items():
        if k in cn: return v
    return "🌍"

def mask_number(num: str) -> str:
    num = str(num).strip()
    if len(num) <= 6: return num
    ks = max(4, len(num) // 3)
    ke = max(3, len(num) // 4)
    return num[:ks] + "✦✦✦✦" + num[-ke:]


def scrape(driver, s: dict) -> list[dict]:
    today = date.today()
    if today != s["tanggal"]:
        with s["data_lock"]:
            s["wa_harian"].clear(); s["seen_ids"].clear()
            s["traffic_counter"].clear(); s["auto_range_done"].clear()
            s["active_ranges"].clear(); s["range_last_msg"].clear()
            s["auto_range_date"] = today; s["tanggal"] = today

    now = time.time()
    if now - s["last_reload"] >= RELOAD_INTERVAL:
        driver.get(URL_LIVE)
        time.sleep(0.8)
        s["last_reload"] = time.time()

    rows  = driver.execute_script(_JS_SCRAPE) or []
    hasil = []
    time_bucket = int(now / 30)

    for cols in rows:
        if len(cols) < 2: continue
        cp  = cols[0]
        app = cols[2] if len(cols) > 2 else ""
        msg = cols[3] if len(cols) > 3 else ""

        is_wa   = "whatsapp" in app.lower()
        has_otp = bool(extract_otp(msg))
        if not is_wa and not has_otp: continue

        uid = f"{cp[:40]}|{msg[:30]}|{time_bucket}"
        if uid in s["seen_ids"]: continue

        nomor = None
        for v in cols:
            sv = str(v).strip().split(".")[0]
            if sv.isdigit() and len(sv) >= 8: nomor = sv; break

        country   = parse_country(cp)
        range_str = parse_range_full(cp)
        otp_code  = extract_otp(msg)
        hasil.append({
            "uid":     uid,
            "country": country,
            "range":   range_str,
            "nomor":   nomor or "",
            "msg":     msg,
            "otp":     otp_code,
            "app":     app,
        })
    return hasil


def fetch_sms_api(driver, s: dict) -> list[dict]:
    today_str = datetime.now().strftime("%d/%m/%Y")
    try:
        jar = {c["name"]: c["value"] for c in driver.get_cookies()}
        r = requests.get(
            f"{URL_BASE}/sms",
            params={"date": today_str, "limit": 100},
            cookies=jar, timeout=8,
            headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"})
        if r.status_code == 200:
            return r.json().get("otp_messages", [])
    except Exception as e:
        log.debug(f"fetch_sms_api: {e}")
    return []


# ─────────────────────────────────────────────
# INJECTOR
# ─────────────────────────────────────────────
def inject_once(driver, s: dict, range_name: str) -> tuple[bool, str]:
    h  = s["hub"]
    em, sys_, ct = h["email"], h["system"], h["chat_type"]
    try:
        mb = driver.execute_script(
            "return document.querySelectorAll('#messages .message').length;")
    except Exception:
        mb = 0

    r1 = driver.execute_script(
        f"try{{if(!socket||!socket.connected)return 'nc';"
        f"socket.emit('menu_selection',{{selection:'add_numbers',"
        f"email:'{em}',system:'{sys_}',type:'{ct}'}});"
        f"return 'ok';}}catch(e){{return 'e:'+e.message;}}")
    if r1 != "ok": return False, str(r1)
    time.sleep(0.8)

    r2 = driver.execute_script(
        f"try{{if(!socket||!socket.connected)return 'nc';"
        f"socket.emit('form_submission',{{"
        f"formType:'add_numbers',"
        f"formData:{{termination_string:'{range_name}'}},"
        f"email:'{em}',system:'{sys_}',type:'{ct}'}});"
        f"return 'ok';}}catch(e){{return 'e:'+e.message;}}")
    if r2 != "ok": return False, str(r2)

    deadline = time.time() + 12
    ma = mb
    while time.time() < deadline:
        time.sleep(0.25)
        try:
            ma = driver.execute_script(
                "return document.querySelectorAll('#messages .message').length;")
        except Exception: continue
        if ma > mb:
            last = driver.execute_script(
                "var m=document.querySelectorAll('#messages .message');"
                "return m.length?m[m.length-1].innerText:'';").lower()
            if "successfully" in last or "processed" in last: break
    else:
        if ma == mb: return False, "Timeout 12s"

    txt = driver.execute_script(
        f"var m=document.querySelectorAll('#messages .message'),o=[];"
        f"for(var i={mb};i<m.length;i++)o.push(m[i].innerText.trim());"
        f"return o.join(' | ');") or ""
    lo = txt.lower()
    if "successfully" in lo or "processed" in lo: return True, txt[:300]
    return False, txt[:200]


def _ensure_hub(driver, s: dict, cid: str):
    if not s["hub"]["ready"] or not driver.execute_script(
            "return typeof socket!=='undefined'&&socket.connected;"):
        s["hub"]["ready"] = False
        user = db_get(cid)
        init_hub(driver, s, user["email"], user.get("chat_name", "nexus"))


def do_inject(cid: str, s: dict, range_name: str, qty: int, mid: int):
    from bot import edit_msg, esc
    jumlah = math.ceil(qty / NOMOR_PER_REQUEST)
    s["busy"].set()
    driver = s["driver"]
    try:
        with s["driver_lock"]:
            _ensure_hub(driver, s, cid)

        edit_msg(cid, mid,
            f"<b>🚀 INJECT DIMULAI</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"🎯 Range   : <code>{esc(range_name)}</code>\n"
            f"📦 Target  : <code>{qty} Nomor</code>\n"
            f"🔄 Requests: <code>{jumlah}x</code>\n\n"
            "⏳ Menyiapkan koneksi...")

        ok = fail_streak = done_nums = 0
        for i in range(jumlah):
            if s["stop_flag"].is_set(): break
            with s["driver_lock"]:
                try:
                    _ensure_hub(driver, s, cid)
                    success, reply = inject_once(driver, s, range_name)
                except Exception as ex:
                    success, reply = False, str(ex)

            if success:
                ok += 1; fail_streak = 0; done_nums += NOMOR_PER_REQUEST
            else:
                fail_streak += 1
                if fail_streak >= MAX_FAIL:
                    edit_msg(cid, mid,
                        f"<b>❌ INJECT GAGAL</b>\n"
                        f"━━━━━━━━━━━━━━━━━━━━━\n\n"
                        f"💢 Gagal {MAX_FAIL}x berturut-turut\n\n"
                        f"<blockquote>{esc(reply[:200])}</blockquote>")
                    return

            if (i + 1) % 2 == 0 or (i + 1) == jumlah:
                pct = int((i + 1) / jumlah * 100)
                filled = pct // 10
                bar = "▓" * filled + "░" * (10 - filled)
                edit_msg(cid, mid,
                    f"<b>⚡ INJECT PROGRESS</b>\n"
                    f"━━━━━━━━━━━━━━━━━━━━━\n\n"
                    f"🎯 Range  : <code>{esc(range_name)}</code>\n"
                    f"📊 Progres: <code>{bar} {pct}%</code>\n\n"
                    f"✅ Sukses : <code>{ok} req (~{done_nums} nomor)</code>\n"
                    f"❌ Gagal  : <code>{i+1-ok} req</code>")
            time.sleep(INJECT_DELAY)

        with s["driver_lock"]:
            try: driver.get(URL_LIVE); s["last_reload"] = time.time()
            except Exception: pass

        icon = "✅" if ok == jumlah else ("⚠️" if ok > 0 else "❌")
        edit_msg(cid, mid,
            f"<b>{icon} INJECT SELESAI</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"🎯 Range  : <code>{esc(range_name)}</code>\n"
            f"📦 Target : <code>{qty} Nomor</code>\n"
            f"📈 Hasil  : <code>~{done_nums} Nomor Valid</code>\n\n"
            f"  🟢 Valid : <code>{ok}/{jumlah} req</code>\n"
            f"  🔴 Error : <code>{jumlah-ok}/{jumlah} req</code>\n\n"
            "Ketik /status untuk kembali.")
    except Exception as ex:
        log.error(f"do_inject [{cid}]: {ex}")
        edit_msg(cid, mid,
            f"<b>💥 CRITICAL ERROR</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"<blockquote>{esc(str(ex))}</blockquote>")
    finally:
        s["busy"].clear()


def _auto_inject_task(cid: str, s: dict, driver, range_name: str, qty: int):
    from bot import send_msg, esc
    jumlah = math.ceil(qty / NOMOR_PER_REQUEST)
    ok = done_nums = 0
    try:
        with s["driver_lock"]:
            _ensure_hub(driver, s, cid)
        for i in range(jumlah):
            if s["stop_flag"].is_set(): break
            with s["driver_lock"]:
                try: success, reply = inject_once(driver, s, range_name)
                except Exception as ex: success, reply = False, str(ex)
            if success: ok += 1; done_nums += NOMOR_PER_REQUEST
            time.sleep(INJECT_DELAY)

        icon = "✅" if ok == jumlah else ("⚠️" if ok > 0 else "❌")
        send_msg(cid,
            f"<b>{icon} AUTO INJECT DONE</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"🎯 Range  : <code>{esc(range_name)}</code>\n"
            f"📈 Hasil  : <code>~{done_nums} Nomor</code>\n"
            f"📊 Status : <code>{ok}/{jumlah} valid</code>")
    except Exception as e:
        log.error(f"_auto_inject_task [{cid}] {range_name}: {e}")
        send_msg(cid,
            f"<b>❌ AUTO INJECT ERROR</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"Gagal inject <code>{esc(range_name)}</code>:\n"
            f"<blockquote>{esc(str(e)[:200])}</blockquote>")


def check_auto_range(cid: str, s: dict, driver):
    if not s.get("auto_range_enabled", True) or not driver: return
    today = date.today()
    if s.get("auto_range_date") != today:
        s["auto_range_done"].clear(); s["active_ranges"].clear()
        s["range_last_msg"].clear(); s["auto_range_date"] = today

    from bot import send_msg, esc
    now = time.time()
    idle_removed = []
    for rng in list(s.get("active_ranges", set())):
        if now - s["range_last_msg"].get(rng, now) >= AUTO_RANGE_IDLE_TTL:
            s["active_ranges"].discard(rng); idle_removed.append(rng)
    if idle_removed:
        send_msg(cid,
            f"<b>⏸ AUTO RANGE DIOPTIMASI</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n\n"
            "Range traffic rendah dilepas:\n"
            + "\n".join(f"  ◈ <code>{r}</code>" for r in idle_removed))

    with s["data_lock"]: counter = s["traffic_counter"].copy()
    if not counter: return

    top3       = [rng for rng, _ in counter.most_common(3)]
    new_ranges = [r for r in top3 if r not in s["auto_range_done"]]
    if not new_ranges: return

    user = db_get(cid)
    if not user: return

    for range_name in new_ranges:
        if s["stop_flag"].is_set(): break
        s["auto_range_done"].add(range_name)
        s["active_ranges"].add(range_name)
        s["range_last_msg"][range_name] = now
        log.info(f"Auto-range [{cid}]: trigger {range_name}")
        send_msg(cid,
            f"<b>🤖 AUTO INJECT TRIGGERED</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"🎯 Range  : <code>{esc(range_name)}</code>\n"
            f"📦 Volume : <code>{AUTO_RANGE_QTY} Nomor</code>\n\n"
            "⏳ Sedang di-inject otomatis...")
        threading.Thread(
            target=_auto_inject_task,
            args=(cid, s, driver, range_name, AUTO_RANGE_QTY),
            daemon=True).start()
        time.sleep(1.5)


# ─────────────────────────────────────────────
# ENGINE
# ─────────────────────────────────────────────
def _forward_otp(cid: str, s: dict, item: dict):
    from bot import tg_post, esc
    gid = s.get("fwd_group_id")
    if not gid: return
    nomor   = item.get("nomor", "")
    country = item.get("country", "")
    otp     = item.get("otp", "")
    msg_txt = item.get("msg", "")
    range_s = item.get("range", "")
    flag    = get_country_flag(country)
    masked  = mask_number(nomor) if nomor else "?"
    if not otp:
        m = re.search(r"\d{4,8}", msg_txt)
        otp = m.group() if m else "?"
    ts   = datetime.now().strftime("%H:%M:%S")
    text = (
        f"<b>{flag} WHATSAPP OTP</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━\n\n"
        f"📱 Nomor  : <code>{masked}</code>\n"
        f"🌐 Region : {esc(country)}\n"
        f"📡 Range  : <code>{esc(range_s)}</code>\n\n"
        f"🔑 <b>KODE OTP</b>\n"
        f"<blockquote><b>{esc(otp)}</b></blockquote>\n"
        f"<i>🕐 {ts}</i>"
    )
    try:
        tg_post("sendMessage", {
            "chat_id": str(gid), "text": text, "parse_mode": "HTML",
            "disable_web_page_preview": True,
        })
    except Exception as e:
        log.warning(f"forward_otp [{cid}]: {e}")


def _process_api_otps(cid: str, s: dict):
    if not s.get("fwd_enabled") or not s.get("fwd_group_id"): return
    driver = s.get("driver")
    if not driver: return
    try:
        msgs = fetch_sms_api(driver, s)
        for m in msgs:
            phone = m.get("phone_number", "")
            msg_t = m.get("otp_message", "")
            rng   = m.get("range", "")
            uid   = f"api|{phone}|{msg_t[:30]}"
            if uid in s["otp_seen_ids"]: continue
            s["otp_seen_ids"].add(uid)
            if len(s["otp_seen_ids"]) > 2000:
                s["otp_seen_ids"] = set(list(s["otp_seen_ids"])[-1000:])
            _forward_otp(cid, s, {
                "nomor": phone, "country": rng.strip().lstrip("+").upper(),
                "range": rng, "msg": msg_t,
                "otp": extract_otp(msg_t) or "?", "app": "WhatsApp",
            })
    except Exception as e:
        log.debug(f"process_api_otps [{cid}]: {e}")


def _monitor_loop(cid: str, s: dict):
    s["last_reload"] = 0.0
    s["last_api_poll"] = 0.0
    s["last_auto_range"] = 0.0
    err_count = 0
    last_db_update = 0.0
    driver = s["driver"]

    with s["driver_lock"]:
        driver.get(URL_LIVE)
        time.sleep(0.8)
        s["last_reload"] = time.time()

    if s.get("auto_range_enabled", True):
        s["last_auto_range"] = time.time()
        threading.Thread(target=check_auto_range, args=(cid, s, driver), daemon=True).start()

    while not s["stop_flag"].is_set():
        if s["busy"].is_set():
            time.sleep(0.2); continue
        try:
            with s["driver_lock"]:
                baru = scrape(driver, s)

            with s["data_lock"]:
                for p in baru:
                    s["seen_ids"].add(p["uid"])
                    s["wa_harian"][p["country"]] += 1
                    s["traffic_counter"][p["range"]] += 1
                    s["range_last_msg"][p["range"]] = time.time()

            if s.get("fwd_enabled") and s.get("fwd_group_id"):
                for p in baru:
                    if p.get("otp") or p.get("msg"):
                        threading.Thread(target=_forward_otp, args=(cid, s, p), daemon=True).start()

            now = time.time()
            if now - s["last_api_poll"] >= API_POLL_INTERVAL:
                s["last_api_poll"] = now
                threading.Thread(target=_process_api_otps, args=(cid, s), daemon=True).start()

            if now - s["last_auto_range"] >= AUTO_RANGE_INTERVAL:
                s["last_auto_range"] = now
                threading.Thread(target=check_auto_range, args=(cid, s, driver), daemon=True).start()

            if now - last_db_update >= 30:
                db_update(cid, {"last_active": datetime.now().strftime("%Y-%m-%d %H:%M")})
                last_db_update = now

            err_count = 0
        except (WebDriverException, InvalidSessionIdException):
            log.error(f"Driver mati [{cid}]"); break
        except Exception as e:
            err_count += 1
            log.warning(f"monitor error [{cid}] #{err_count}: {e}")
            if err_count >= 10: break
            time.sleep(1); continue
        time.sleep(POLL_INTERVAL)


def run_user_engine(cid: str):
    from bot import send_msg, edit_msg, esc, fmt_status
    cid = str(cid)
    while True:
        s = sess_get(cid)
        if not s or s["stop_flag"].is_set(): break
        user = db_get(cid)
        if not user or user.get("banned"):
            log.info(f"Engine stop [{cid}]: banned/no user"); break

        driver = None
        engine_msg_id = None
        try:
            engine_msg_id = send_msg(cid,
                f"<b>⚙️ SYSTEM BOOTING</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"🖥 Env  : <code>{ENV.upper()}</code>\n\n"
                "⏳ Menginisialisasi browser node...")

            driver = make_driver(s)
            s["driver"] = driver
            s["is_logged_in"] = False

            logged = try_cookie_login(driver, s)
            if not logged:
                if engine_msg_id:
                    edit_msg(cid, engine_msg_id,
                        "<b>🔐 AUTHENTICATING</b>\n"
                        "━━━━━━━━━━━━━━━━━━━━━\n\n"
                        "⏳ Login ke portal iVAS...")
                login_ok = False
                while not login_ok and not s["stop_flag"].is_set():
                    try:
                        login_ok = do_login_driver(driver, user["email"], user["password"])
                    except Exception as e:
                        if engine_msg_id:
                            edit_msg(cid, engine_msg_id,
                                "<b>⚠️ AUTH RETRY</b>\n"
                                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                                f"<blockquote>{esc(str(e)[:200])}</blockquote>\n\n"
                                "Mencoba kembali dalam 15 detik...")
                        time.sleep(15)
                        fresh = db_get(cid)
                        if fresh: user = fresh
                        continue
                if not login_ok: continue

            save_cookies(driver, s)
            s["is_logged_in"] = True
            if engine_msg_id:
                edit_msg(cid, engine_msg_id,
                    "<b>🔧 MENGHUBUNGKAN HUB</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n\n"
                    "⏳ Connecting to OrangeCarrier Hub...")
            with s["driver_lock"]:
                init_hub(driver, s, user["email"], user.get("chat_name", "nexus"))

            if engine_msg_id:
                edit_msg(cid, engine_msg_id, fmt_status(cid))
                s["last_dash_id"] = engine_msg_id

            db_update(cid, {"status": "active", "last_active": datetime.now().strftime("%Y-%m-%d %H:%M")})
            _monitor_loop(cid, s)

        except Exception as e:
            log.error(f"Engine crash [{cid}]: {e}")
            send_msg(cid,
                f"<b>💥 ENGINE CRASH</b>\n"
                f"━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"<blockquote>{esc(str(e)[:300])}</blockquote>\n\n"
                "♻️ Restart otomatis dalam 20 detik...")
        finally:
            s["is_logged_in"] = False
            if driver:
                try: driver.quit()
                except Exception: pass
            s["driver"] = None

        if s["stop_flag"].is_set(): break
        time.sleep(20)
        log.info(f"Engine restart [{cid}]")


def start_engine(cid: str):
    cid = str(cid)
    if sess_get(cid): return
    s = sess_new(cid)
    t = threading.Thread(target=run_user_engine, args=(cid,), daemon=True)
    t.start()
    s["thread"] = t
    log.info(f"Engine started [{cid}]")


def stop_engine(cid: str) -> bool:
    cid = str(cid)
    s   = sess_get(cid)
    if not s: return False
    flag = s.get("stop_flag")
    if flag: flag.set()
    sess_del(cid)
    try: db_update(cid, {"status": "stopped"})
    except Exception: pass
    log.info(f"Engine stopped [{cid}]")
    return True
