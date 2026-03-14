import os, re, time, pickle, threading, json, requests, math, shutil
from datetime import datetime, timezone, timedelta
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import WebDriverException
import logging

BOT_TOKEN     = "7673309476:AAEAg4kBjtBvCAKLAN3tBjNcuhJLYr7TdDg"
OWNER_ID      = "8062935882"
BOT_NAME      = "◈ SCRIPT PREMIUM IVASMS"
TG_API        = f"https://api.telegram.org/bot{BOT_TOKEN}"

GROUP_LINK_1  = "https://t.me/+LINK_GRUP_1_KAMU"
GROUP_LINK_2  = "https://t.me/+LINK_GRUP_2_KAMU"
GROUP_TITLE_1 = "Channel"
GROUP_TITLE_2 = "Number"

BASE_DIR      = os.path.expanduser("~/ivas_data")
DATA_FILE     = os.path.join(BASE_DIR, "data.json")
DL_DIR        = os.path.join(BASE_DIR, "downloads")

URL_LOGIN     = "https://www.ivasms.com/login"
URL_PORTAL    = "https://www.ivasms.com/portal"
URL_LIVE      = "https://www.ivasms.com/portal/live/test_sms"
URL_NUMBERS   = "https://www.ivasms.com/portal/numbers"
URL_HUB       = "https://hub.orangecarrier.com"

INJECT_WAIT       = 8
MAX_FAIL          = 3
NOMOR_PER_REQUEST = 50
INJECT_DELAY      = 0.05
LIVE_POLL         = 0.5
SMS_POLL_INTERVAL = 60
MAX_GROUPS        = 5

os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(DL_DIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("ivas")

_tg        = requests.Session()
_tg.headers.update({"Content-Type": "application/json"})
_sess_lock = threading.Lock()
S          = {}

# ── util ─────────────────────────────────────────────────────────────────────

def server_today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def get_account():
    try:
        with open(DATA_FILE) as f: return json.load(f)
    except: return {}

def save_account(email, password):
    with _sess_lock:
        d = get_account()
        d["email"] = email; d["password"] = password
        with open(DATA_FILE, "w") as f: json.dump(d, f, indent=2)

def get_groups():
    try:
        with open(DATA_FILE) as f:
            groups = json.load(f).get("forward_groups", [])
    except: groups = []
    if not groups:
        defaults = []
        if GROUP_LINK_1 and not GROUP_LINK_1.endswith("_KAMU"):
            defaults.append({"id": "0", "title": GROUP_TITLE_1, "invite_link": GROUP_LINK_1})
        if GROUP_LINK_2 and not GROUP_LINK_2.endswith("_KAMU"):
            defaults.append({"id": "1", "title": GROUP_TITLE_2, "invite_link": GROUP_LINK_2})
        return defaults
    return groups

def add_group(chat_id, title="", invite_link=""):
    with _sess_lock:
        try:
            with open(DATA_FILE) as f: d = json.load(f)
        except: d = {}
        groups  = d.get("forward_groups", [])
        chat_id = str(chat_id)
        for g in groups:
            if str(g["id"]) == chat_id:
                if title: g["title"] = title
                if invite_link: g["invite_link"] = invite_link
                d["forward_groups"] = groups
                with open(DATA_FILE, "w") as f: json.dump(d, f, indent=2)
                return "exists"
        if len(groups) >= MAX_GROUPS: return "full"
        groups.append({"id": chat_id, "title": title or chat_id, "invite_link": invite_link})
        d["forward_groups"] = groups
        with open(DATA_FILE, "w") as f: json.dump(d, f, indent=2)
        return "ok"

def remove_group(chat_id):
    with _sess_lock:
        try:
            with open(DATA_FILE) as f: d = json.load(f)
        except: return False
        groups  = d.get("forward_groups", [])
        chat_id = str(chat_id)
        before  = len(groups)
        d["forward_groups"] = [g for g in groups if str(g["id"]) != chat_id]
        if len(d["forward_groups"]) == before: return False
        with open(DATA_FILE, "w") as f: json.dump(d, f, indent=2)
        return True

def tg(ep, data, timeout=10):
    for _ in range(3):
        try:
            r = _tg.post(f"{TG_API}/{ep}", json=data, timeout=timeout)
            if r.ok: return r.json()
        except: time.sleep(0.3)
    return None

def send(cid, text, markup=None):
    p = {"chat_id": str(cid), "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup: p["reply_markup"] = markup
    r = tg("sendMessage", p)
    return r["result"]["message_id"] if r and r.get("ok") else None

def edit(cid, mid, text, markup=None):
    p = {"chat_id": str(cid), "message_id": mid, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup is not None: p["reply_markup"] = markup
    r = tg("editMessageText", p)
    return bool(r and (r.get("ok") or "not modified" in str(r).lower()))

def delete_msg(cid, mid):
    threading.Thread(target=tg, args=("deleteMessage", {"chat_id": str(cid), "message_id": mid}), daemon=True).start()

def answer(cb_id, text="", alert=False):
    threading.Thread(target=tg, args=("answerCallbackQuery", {"callback_query_id": cb_id, "text": text, "show_alert": alert}), daemon=True).start()

def kb(rows):
    return {"inline_keyboard": [[{"text": l, "callback_data": d} for l, d in row] for row in rows]}

def div(label="", w=28):
    if not label: return "━" * w
    pad = w - len(label) - 2; l = pad // 2
    return "━" * l + f" {label} " + "━" * (pad - l)

def esc(t):
    return str(t).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def fmt(n):
    try: return f"{int(n):,}".replace(",", ".")
    except: return str(n)

FLAG = {
    "AFGHANISTAN":"🇦🇫","ALBANIA":"🇦🇱","ALGERIA":"🇩🇿","ANDORRA":"🇦🇩","ANGOLA":"🇦🇴",
    "ARGENTINA":"🇦🇷","ARMENIA":"🇦🇲","AUSTRALIA":"🇦🇺","AUSTRIA":"🇦🇹","AZERBAIJAN":"🇦🇿",
    "BAHRAIN":"🇧🇭","BANGLADESH":"🇧🇩","BELARUS":"🇧🇾","BELGIUM":"🇧🇪","BRAZIL":"🇧🇷",
    "CAMBODIA":"🇰🇭","CAMEROON":"🇨🇲","CANADA":"🇨🇦","CHILE":"🇨🇱","CHINA":"🇨🇳",
    "COLOMBIA":"🇨🇴","CROATIA":"🇭🇷","CZECHIA":"🇨🇿","DENMARK":"🇩🇰","EGYPT":"🇪🇬",
    "ETHIOPIA":"🇪🇹","FINLAND":"🇫🇮","FRANCE":"🇫🇷","GERMANY":"🇩🇪","GHANA":"🇬🇭",
    "GREECE":"🇬🇷","HONG KONG":"🇭🇰","HUNGARY":"🇭🇺","INDIA":"🇮🇳","INDONESIA":"🇮🇩",
    "IRAN":"🇮🇷","IRAQ":"🇮🇶","IRELAND":"🇮🇪","ISRAEL":"🇮🇱","ITALY":"🇮🇹",
    "JAPAN":"🇯🇵","JORDAN":"🇯🇴","KAZAKHSTAN":"🇰🇿","KENYA":"🇰🇪","KUWAIT":"🇰🇼",
    "MALAYSIA":"🇲🇾","MEXICO":"🇲🇽","MOROCCO":"🇲🇦","MYANMAR":"🇲🇲","NEPAL":"🇳🇵",
    "NETHERLANDS":"🇳🇱","NIGERIA":"🇳🇬","NORWAY":"🇳🇴","PAKISTAN":"🇵🇰","PERU":"🇵🇪",
    "PHILIPPINES":"🇵🇭","POLAND":"🇵🇱","PORTUGAL":"🇵🇹","QATAR":"🇶🇦","ROMANIA":"🇷🇴",
    "RUSSIA":"🇷🇺","SAUDI ARABIA":"🇸🇦","SENEGAL":"🇸🇳","SINGAPORE":"🇸🇬","SOMALIA":"🇸🇴",
    "SOUTH AFRICA":"🇿🇦","SOUTH KOREA":"🇰🇷","SPAIN":"🇪🇸","SRI LANKA":"🇱🇰","SWEDEN":"🇸🇪",
    "SWITZERLAND":"🇨🇭","TAIWAN":"🇹🇼","THAILAND":"🇹🇭","TURKEY":"🇹🇷","UAE":"🇦🇪",
    "UK":"🇬🇧","USA":"🇺🇸","UKRAINE":"🇺🇦","UZBEKISTAN":"🇺🇿","VIETNAM":"🇻🇳",
    "YEMEN":"🇾🇪","ZAMBIA":"🇿🇲","ZIMBABWE":"🇿🇼","IVORY COAST":"🇨🇮","TANZANIA":"🇹🇿",
    "CONGO":"🇨🇩","SUDAN":"🇸🇩","KENYA":"🇰🇪","UGANDA":"🇺🇬","MOZAMBIQUE":"🇲🇿",
}

def flag(name):
    n = name.upper().strip()
    for k, v in FLAG.items():
        if k in n: return v
    return "🌍"

# ── browser ───────────────────────────────────────────────────────────────────

def find_chrome():
    for p in [
        "/data/data/com.termux/files/usr/bin/chromium-browser",
        "/usr/bin/chromium-browser", "/usr/bin/google-chrome-stable", "/usr/local/bin/chromium"
    ]:
        if os.path.isfile(p) and os.access(p, os.X_OK): return p
    for n in ["chromium-browser","chromium","google-chrome-stable","google-chrome"]:
        p = shutil.which(n)
        if p: return p
    return None

def find_driver():
    for p in [
        "/data/data/com.termux/files/usr/bin/chromedriver",
        "/usr/bin/chromedriver", "/usr/local/bin/chromedriver", "/usr/lib/chromium/chromedriver"
    ]:
        if os.path.isfile(p) and os.access(p, os.X_OK): return p
    return shutil.which("chromedriver")

def make_driver():
    chrome = find_chrome()
    if not chrome: raise RuntimeError("Chromium tidak ditemukan.")
    prof = os.path.join(BASE_DIR, "chrome_profile")
    os.makedirs(prof, exist_ok=True)
    for lf in ["SingletonLock","SingletonSocket","SingletonCookie"]:
        try: os.remove(os.path.join(prof, lf))
        except: pass

    opt = Options()
    opt.binary_location = chrome
    for arg in [
        "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
        "--no-zygote", "--single-process", "--disable-setuid-sandbox",
        "--disable-seccomp-filter-sandbox", "--window-size=800,600",
        f"--user-data-dir={prof}", "--disable-extensions", "--disable-notifications",
        "--mute-audio", "--ignore-certificate-errors",
        "--disable-blink-features=AutomationControlled",
        "--disable-background-networking", "--disable-default-apps", "--disable-sync",
        "--disable-software-rasterizer", "--js-flags=--max-old-space-size=128",
        "--disable-features=VizDisplayCompositor,Translate,AudioServiceOutOfProcess,"
        "RendererCodeIntegrity,MediaRouter,DialMediaRouteProvider",
        "--blink-settings=imagesEnabled=false",
        "--disable-logging", "--log-level=3", "--disable-crash-reporter",
        "--no-first-run", "--disable-component-update",
        "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
        "--disable-ipc-flooding-protection",
    ]:
        opt.add_argument(arg)

    opt.add_experimental_option("prefs", {
        "download.default_directory":    DL_DIR,
        "download.prompt_for_download":  False,
        "download.directory_upgrade":    True,
        "safebrowsing.enabled":          False,
        "profile.managed_default_content_settings.images":      2,
        "profile.managed_default_content_settings.stylesheets": 2,
        "profile.managed_default_content_settings.fonts":       2,
    })
    opt.add_experimental_option("excludeSwitches", ["enable-automation","enable-logging"])
    opt.add_experimental_option("useAutomationExtension", False)

    drv_path = find_driver()
    kwargs   = {"service": Service(drv_path)} if drv_path else {}
    for attempt in range(3):
        try:
            drv = webdriver.Chrome(**kwargs, options=opt)
            drv.set_page_load_timeout(20)
            drv.set_script_timeout(10)
            return drv
        except Exception:
            if attempt < 2: time.sleep(2)
    raise RuntimeError("Browser gagal start.")

def do_login(drv, email, password):
    drv.get(URL_LOGIN)
    time.sleep(1.0)
    for _ in range(5):
        body = drv.page_source.lower()
        if "checking your browser" in body or "just a moment" in body or "cloudflare" in body:
            time.sleep(1.5)
        else: break

    e_field = None
    for sel in ["input[type='email']","input[name='email']","#email"]:
        try:
            f = drv.find_element(By.CSS_SELECTOR, sel)
            if f.is_displayed(): e_field = f; break
        except: pass
    if not e_field: raise RuntimeError("Form email tidak ditemukan")

    p_field = drv.find_element(By.CSS_SELECTOR, "input[type='password']")
    e_field.clear(); e_field.send_keys(email)
    p_field.clear(); p_field.send_keys(password)
    p_field.send_keys(Keys.RETURN)
    time.sleep(2.5)

    if "login" not in drv.current_url: return True
    body = drv.execute_script("return document.body.innerText;").lower()
    if "captcha" in body or "robot" in body:
        raise RuntimeError("Terblokir captcha — tunggu beberapa menit")
    raise RuntimeError("Email/Password salah")

def try_cookie_login(drv):
    cf = os.path.join(BASE_DIR, "cookies.pkl")
    if not os.path.exists(cf): return False
    try:
        drv.get("https://www.ivasms.com")
        time.sleep(0.5)
        with open(cf,"rb") as f: cookies = pickle.load(f)
        for c in cookies:
            try: drv.add_cookie(c)
            except: pass
        drv.get(URL_PORTAL)
        time.sleep(1.0)
        if "login" not in drv.current_url: return True
        os.remove(cf); return False
    except: return False

def save_cookies(drv):
    cf = os.path.join(BASE_DIR, "cookies.pkl")
    try:
        with open(cf,"wb") as f: pickle.dump(drv.get_cookies(), f)
    except: pass

def init_hub(drv, email):
    drv.get(URL_PORTAL)
    time.sleep(1)
    hub_url = None
    for iframe in drv.find_elements(By.TAG_NAME, "iframe"):
        src = iframe.get_attribute("src") or ""
        if "hub.orangecarrier" in src: hub_url = src; break
    drv.get(hub_url or f"{URL_HUB}?system=ivas")
    for _ in range(30):
        time.sleep(0.2)
        try:
            if drv.execute_script("return typeof socket!=='undefined'&&socket.connected;"): break
        except: pass

def hub_info(drv):
    try:
        return drv.execute_script(
            "return{email:(typeof currentUserInfo!=='undefined'&&currentUserInfo.email)||'',"
            "system:'ivas',type:'internal'};"
        )
    except: return {"email":"","system":"ivas","type":"internal"}

# ── inject ────────────────────────────────────────────────────────────────────

def do_inject_hub(drv, range_name, qty, callback, email=""):
    try: drv.execute_script("if(typeof socket==='undefined'||!socket.connected) location.reload();")
    except: pass
    info    = hub_info(drv)
    em, sy, ct = info["email"] or email, info["system"], info["type"]
    if not drv.execute_script("return typeof socket!=='undefined'&&socket.connected;"):
        raise RuntimeError("Hub socket tidak terhubung")
    total_r = max(1, math.ceil(qty / NOMOR_PER_REQUEST))
    ok = fail = done = fail_streak = 0

    for i in range(total_r):
        if S.get("stop") and S["stop"].is_set(): break
        mb = drv.execute_script("return document.querySelectorAll('#messages .message').length;") or 0
        r1 = drv.execute_script(
            f"try{{socket.emit('menu_selection',{{selection:'add_numbers',email:'{em}',system:'{sy}',type:'{ct}'}});return 'ok';}}catch(e){{return 'err:'+e.message;}}"
        )
        if r1 != "ok":
            fail += 1; fail_streak += 1
            if fail_streak >= MAX_FAIL: break
            time.sleep(0.8); continue

        time.sleep(0.3)
        r2 = drv.execute_script(
            f"try{{socket.emit('form_submission',{{formType:'add_numbers',formData:{{termination_string:'{range_name}'}},email:'{em}',system:'{sy}',type:'{ct}'}});return 'ok';}}catch(e){{return 'err:'+e.message;}}"
        )
        if r2 != "ok":
            fail += 1; fail_streak += 1
            if fail_streak >= MAX_FAIL: break
            time.sleep(0.8); continue

        deadline = time.time() + INJECT_WAIT
        ma = mb
        while time.time() < deadline:
            time.sleep(0.15)
            try:
                ma = drv.execute_script("return document.querySelectorAll('#messages .message').length;") or mb
                if ma > mb: break
            except: pass

        if ma > mb:
            ok += 1; done += NOMOR_PER_REQUEST; fail_streak = 0
        else:
            fail += 1; fail_streak += 1
            if fail_streak >= MAX_FAIL: break

        callback(int((i+1)/total_r*100), ok, fail, done)
        time.sleep(INJECT_DELAY)
    return ok, fail, done

# ── hapus nomor ───────────────────────────────────────────────────────────────

def do_bulk_return(drv):
    drv.get(URL_NUMBERS)
    time.sleep(2)
    try: WebDriverWait(drv,8).until(lambda d: d.execute_script("return document.readyState") == "complete")
    except: pass
    clicked = False
    for sel in [
        "//button[contains(normalize-space(.),'Bulk return all numbers')]",
        "//a[contains(normalize-space(.),'Bulk return all numbers')]",
        "//button[contains(translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'bulk return all')]",
    ]:
        try:
            btn = WebDriverWait(drv,5).until(EC.element_to_be_clickable((By.XPATH, sel)))
            drv.execute_script("arguments[0].scrollIntoView(true);", btn)
            time.sleep(0.2)
            drv.execute_script("arguments[0].click();", btn)
            clicked = True; time.sleep(1.2); break
        except: pass

    if not clicked:
        result = drv.execute_script(
            "var btns=Array.from(document.querySelectorAll('button,a.btn'));"
            "for(var i=0;i<btns.length;i++){"
            "  if(btns[i].innerText.trim().toLowerCase().includes('bulk return all')){"
            "    btns[i].click();return btns[i].innerText.trim();}}"
            "return null;"
        )
        if result: clicked = True; time.sleep(1.2)

    if not clicked: return False

    try:
        WebDriverWait(drv,3).until(EC.alert_is_present())
        drv.switch_to.alert.accept(); time.sleep(1)
    except: pass

    for sel in [
        "button.swal-button--confirm","button.swal2-confirm",
        ".swal2-popup button.swal2-confirm","button.confirm",
        ".modal-footer button.btn-danger",".modal-footer button.btn-primary",
        "//button[contains(normalize-space(.),'OK')]",
        "//button[contains(normalize-space(.),'Yes')]",
        "//button[contains(normalize-space(.),'Confirm')]",
    ]:
        try:
            el = WebDriverWait(drv,3).until(EC.element_to_be_clickable(
                (By.XPATH if sel.startswith("//") else By.CSS_SELECTOR, sel)
            ))
            if el.is_displayed():
                drv.execute_script("arguments[0].click();", el); time.sleep(1.5); break
        except: pass

    for _ in range(15):
        time.sleep(0.8)
        try:
            pt = drv.execute_script("return document.body.innerText.toLowerCase();")
            if any(x in pt for x in ["no data","no entries","showing 0","0 entries","success","returned"]):
                return True
        except: pass

    try:
        if drv.execute_script("return document.querySelectorAll('table tbody tr').length;") == 0: return True
    except: pass
    return False

# ── auto forward SMS ──────────────────────────────────────────────────────────

def _mask_phone(phone, with_cc=False):
    p = re.sub(r'[^0-9]','',str(phone))
    if len(p) <= 6: return ("+"+p) if with_cc else p
    if with_cc:
        cc = p[:2]; rest = p[2:]
        masked_rest = rest[:2]+"★★★★"+rest[-4:] if len(rest)>=6 else rest[:2]+"★★"+rest[-2:]
        return f"+{cc}{masked_rest}"
    return p[:4]+"★★★★"+p[-4:]

def _extract_otp(message):
    if not message: return None
    m = re.search(r'([0-9]{3,4}[-][0-9]{3,4})', message)
    if m: return m.group(1)
    for pat in [
        r'[Cc]odigo[^0-9]*([0-9]{4,8})',
        r'[Cc]ode[\s:]+([0-9]{4,8})',
        r'OTP[^0-9]*([0-9]{4,8})',
        r'kode[^0-9]*([0-9]{4,8})',
        r'verif[a-z]*[^0-9]*([0-9]{4,8})',
    ]:
        m = re.search(pat, message, re.I)
        if m:
            val = m.group(1)
            if not re.match(r'^20[12][0-9]', val): return val
    for m in re.finditer(r'(?<![0-9])([0-9]{6})(?![0-9])', message):
        val = m.group(1)
        if not re.match(r'^20[12][0-9]', val): return val
    for m in re.finditer(r'(?<![0-9])([0-9]{4,8})(?![0-9])', message):
        val = m.group(1)
        if not re.match(r'^20[12][0-9]$', val): return val
    return None

def _build_otp_keyboard(otp, phone, rng):
    btn_rows = []
    if otp:
        btn_rows.append([{"text": f"🔑  {otp}", "copy_text": {"text": otp}}])
    groups  = get_groups()
    ch_btns = []
    for g in groups:
        title = g.get("title","Channel")[:16]
        link  = g.get("invite_link","").strip()
        if link and not link.endswith("_KAMU"):
            ch_btns.append({"text": f"📢 {title}", "url": link})
        else:
            gid = str(g["id"])
            cb  = f"ch:{gid}|{phone}|{otp or ''}|{rng}"
            ch_btns.append({"text": f"📢 {title}", "callback_data": cb[:64]})
    if ch_btns: btn_rows.append(ch_btns)
    return {"inline_keyboard": btn_rows} if btn_rows else None

def _send_to_targets(text, markup):
    groups  = get_groups()
    targets = [str(OWNER_ID)]
    for g in groups:
        gid = str(g["id"])
        if gid not in targets: targets.append(gid)
    for target in targets:
        payload = {"chat_id": target, "text": text, "parse_mode": "HTML"}
        if markup: payload["reply_markup"] = markup
        try: _tg.post(f"{TG_API}/sendMessage", json=payload, timeout=10)
        except Exception as ef: log.warning(f"[forward] kirim ke {target}: {ef}")
        time.sleep(0.15)

def _forward_sms_to_telegram(sms):
    import html as _html
    phone   = sms.get("phone","")
    sender  = sms.get("sender","")
    message = sms.get("message","")
    rng     = sms.get("range","")
    fl      = flag(rng)
    masked  = _mask_phone(phone, with_cc=True)
    badge   = "WS" if "whatsapp" in sender.lower() else (sender[:2].upper() if sender else "WS")
    msg_clean = re.sub(r'<[^>]+>','',_html.unescape(message)).strip()
    otp     = _extract_otp(msg_clean)
    text    = f"<b>{badge}</b> | <code>{masked}</code> | {fl}"
    markup  = _build_otp_keyboard(otp, phone, rng)
    _send_to_targets(text, markup)
    log.info(f"[forward] {rng} | {masked} | otp={otp}")

# ── SMS polling via HTTP ──────────────────────────────────────────────────────

def _make_csrf_session(drv):
    try:
        if "ivasms.com" not in drv.current_url:
            drv.get("https://www.ivasms.com/portal/sms/received")
            time.sleep(1.0)
    except: pass
    raw_cookies = drv.get_cookies()
    cookies     = {c["name"]:c["value"] for c in raw_cookies}
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
    })
    for name, value in cookies.items():
        sess.cookies.set(name, value, domain="www.ivasms.com")
    csrf_token = ""
    try:
        r = sess.get("https://www.ivasms.com/portal/sms/received", timeout=12)
        if r.status_code == 200:
            m = re.search(r'<input[^>]+name=["\']_token["\'][^>]+value=["\']([^"\']+)["\']', r.text)
            if not m: m = re.search(r'<meta[^>]+name=["\']csrf-token["\'][^>]+content=["\']([^"\']+)["\']', r.text)
            if m: csrf_token = m.group(1).strip()
    except: pass
    if not csrf_token:
        try: csrf_token = drv.execute_script("var el=document.querySelector('input[name=\"_token\"]');return el?el.value:'';") or ""
        except: pass
    return sess, csrf_token

def _auto_sms_loop(drv):
    us      = S
    stop_ev = us.get("stop")
    time.sleep(5)
    while stop_ev and not stop_ev.is_set():
        try: _auto_sms_check(drv)
        except Exception as e: log.warning(f"[sms_poll] Error: {e}")
        stop_ev.wait(timeout=SMS_POLL_INTERVAL)

def _auto_sms_check(drv):
    us    = S
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if us.get("sms_date") != today:
        us["sms_seen"] = set(); us["sms_date"] = today; us["sms_first_run"] = True

    sms_seen     = us.setdefault("sms_seen", set())
    is_first_run = us.get("sms_first_run", True)

    try:
        sess, csrf = _make_csrf_session(drv)
        r = sess.post(
            "https://www.ivasms.com/portal/sms/received/getsms",
            data={"from": today, "to": today, "_token": csrf},
            headers={"Accept":"text/html, */*; q=0.01","X-Requested-With":"XMLHttpRequest",
                     "Origin":"https://www.ivasms.com","Referer":"https://www.ivasms.com/portal/sms/received"},
            timeout=20,
        )
        if r.status_code != 200:
            if is_first_run: us["sms_first_run"] = False
            return
        html = r.text
    except Exception as e:
        log.warning(f"[sms_poll] HTTP error: {e}")
        if is_first_run: us["sms_first_run"] = False
        return

    # parse range names dari HTML
    ranges = re.findall(r"toggleRange\s*\(\s*'([^']+)'", html)
    if not ranges:
        if is_first_run: us["sms_first_run"] = False
        return

    new_count = 0
    for rng_name in ranges:
        try:
            r2 = sess.post(
                "https://www.ivasms.com/portal/sms/received/getsms/number",
                data={"_token": csrf, "start": today, "end": today, "range": rng_name},
                headers={"Accept":"text/html, */*; q=0.01","X-Requested-With":"XMLHttpRequest",
                         "Origin":"https://www.ivasms.com","Referer":"https://www.ivasms.com/portal/sms/received",
                         "Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},
                timeout=15,
            )
            if r2.status_code != 200: continue
            phones = []
            for m in re.finditer(r"toggleNum\w*\s*\(\s*'([^']*)'\s*,\s*'([^']*)'", r2.text):
                clean = re.sub(r'[^0-9]','',m.group(1).strip())
                if 8 <= len(clean) <= 15 and clean not in phones: phones.append(clean)

            for phone in phones:
                r3 = sess.post(
                    "https://www.ivasms.com/portal/sms/received/getsms/number/sms",
                    data={"_token": csrf, "start": today, "end": today, "Number": phone, "Range": rng_name},
                    headers={"Accept":"text/html, */*; q=0.01","X-Requested-With":"XMLHttpRequest",
                             "Origin":"https://www.ivasms.com","Referer":"https://www.ivasms.com/portal/sms/received",
                             "Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"},
                    timeout=12,
                )
                if r3.status_code != 200: continue
                tbody = re.search(r'<tbody[^>]*>(.*?)</tbody>', r3.text, re.S)
                tr_html = tbody.group(1) if tbody else r3.text
                SKIP = {"sender","message","time","revenue","pesan","waktu","from","pengirim"}
                for tr in re.finditer(r'<tr[^>]*>(.*?)</tr>', tr_html, re.S):
                    tds = [re.sub(r'<[^>]+>','',td).strip() for td in re.findall(r'<td[^>]*>(.*?)</td>', tr.group(1), re.S)]
                    if len(tds) < 3: continue
                    sender, message, ts = tds[0], tds[1], tds[2]
                    if sender.lower() in SKIP or not message or not ts: continue
                    if not re.search(r'\d{1,2}:\d{2}', ts): continue
                    uid = f"{rng_name}|{phone}|{today}|{ts}|{message[:30]}"
                    if is_first_run:
                        sms_seen.add(uid)
                    else:
                        if uid in sms_seen: continue
                        sms_seen.add(uid)
                        new_count += 1
                        _forward_sms_to_telegram({"uid":uid,"range":rng_name,"phone":phone,
                                                   "sender":sender,"message":message,"time":ts})
                        time.sleep(0.2)
                time.sleep(0.15)
        except Exception as e:
            log.warning(f"[sms_poll] {rng_name}: {e}")

    if is_first_run: us["sms_first_run"] = False
    if new_count: log.info(f"[sms_poll] ✅ {new_count} SMS baru di-forward")

# ── engine lifecycle ──────────────────────────────────────────────────────────

def is_online(): return bool(S.get("is_logged_in"))
def get_drv():   return S.get("driver")
def _get_us():   return S

def start_engine(cid, msg_id=None):
    with _sess_lock:
        us = S
        if us.get("thread") and us["thread"].is_alive(): return
        us.clear()
        us.update({
            "stop":         threading.Event(),
            "busy":         threading.Event(),
            "is_logged_in": False,
            "driver":       None,
        })
    t = threading.Thread(target=_engine_loop, args=(cid, msg_id), daemon=True)
    t.start()
    with _sess_lock: S["thread"] = t

def stop_engine():
    us = S
    if us.get("stop"): us["stop"].set()
    if us.get("driver"):
        try: us["driver"].quit()
        except: pass
    us["is_logged_in"] = False
    us["driver"]       = None

def _engine_loop(cid, msg_id):
    acc    = get_account()
    em, pw = acc.get("email",""), acc.get("password","")
    us     = S
    drv    = None
    try:
        drv = make_driver()
        us["driver"] = drv
        if not try_cookie_login(drv): do_login(drv, em, pw)
        save_cookies(drv)
        us["is_logged_in"] = True
        init_hub(drv, em)
        from bot import page_home
        txt, markup = page_home()
        if msg_id: edit(cid, msg_id, txt, markup)
        _monitor(drv)
    except Exception as e:
        log.error(f"Engine crash: {e}")
        if msg_id:
            edit(cid, msg_id, f"❌ <b>Error:</b>\n<code>{esc(str(e)[:150])}</code>",
                 kb([["🔄 Coba Lagi", "engine:start"]]))
    finally:
        us["is_logged_in"] = False
        if drv:
            try: drv.quit()
            except: pass

def _monitor(drv):
    us      = S
    stop_ev = us.get("stop")
    # jalankan SMS polling di thread terpisah
    threading.Thread(target=_auto_sms_loop, args=(drv,), daemon=True).start()
    # keep alive - hanya cek stop event
    while stop_ev and not stop_ev.is_set():
        stop_ev.wait(timeout=30)
