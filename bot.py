import os, sys, json, pickle, time, threading, glob, shutil, logging, traceback, math, re
from collections import Counter, deque
from datetime import datetime, date
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import WebDriverException, InvalidSessionIdException
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("nexus")

OWNER_ID          = "8062935882"
BOT_TOKEN         = "7673309476:AAEAg4kBjtBvCAKLAN3tBjNcuhJLYr7TdDg"
CHROMIUM_PATH     = ""
CHROMEDRIVER_PATH = ""

URL_BASE    = "https://www.ivasms.com"
URL_LOGIN   = "https://www.ivasms.com/login"
URL_PORTAL  = "https://www.ivasms.com/portal"
URL_LIVE    = "https://www.ivasms.com/portal/live/test_sms"
URL_NUMBERS = "https://www.ivasms.com/portal/numbers"
URL_SMS_RCV = "https://www.ivasms.com/portal/sms/received"
URL_HUB     = "https://hub.orangecarrier.com"

DRV_HUB     = "drv_hub"
DRV_PORTAL  = "drv_portal"
DRV_SMS     = "drv_sms"
DRV_NUMBERS = "drv_numbers"

BASE_DIR    = os.path.expanduser("~/nexus_data")
USERS_FILE  = os.path.join(BASE_DIR, "users.json")
TG_API      = f"https://api.telegram.org/bot{BOT_TOKEN}"

POLL_INTERVAL       = 0.05
RELOAD_INTERVAL     = 1
TOP_N               = 25
QTY_OPTIONS         = [100, 200, 300, 400, 500]
NOMOR_PER_REQUEST   = 50
INJECT_DELAY        = 0.2
MAX_FAIL            = 3
API_POLL_INTERVAL   = 1
AUTO_RANGE_INTERVAL = 7200
AUTO_RANGE_IDLE_TTL = 1200
AUTO_RANGE_QTY      = 100
AUTO_RANGE_MIN_OTP  = 10
AUTO_RANGE_TOP_N    = 3
INJECT_TIMEOUT      = 15
EXPORT_TIMEOUT      = 60
DELETE_TIMEOUT      = 25
HUB_TIMEOUT         = 20
MAX_OTP_CACHE       = 3000

WA_KEYWORDS = ["whatsapp"]

os.makedirs(BASE_DIR, exist_ok=True)

_db_lock = threading.Lock()

def db_load():
    try:
        with open(USERS_FILE, "r") as f: return json.load(f)
    except Exception: return {}

def db_save(data):
    tmp = USERS_FILE + ".tmp"
    with open(tmp, "w") as f: json.dump(data, f, indent=2)
    os.replace(tmp, USERS_FILE)

def db_get(cid):
    with _db_lock: return db_load().get(str(cid))

def db_set(cid, field, value):
    with _db_lock:
        d = db_load(); cid = str(cid)
        if cid not in d: d[cid] = {}
        d[cid][field] = value
        db_save(d)

def db_update(cid, fields: dict):
    with _db_lock:
        d = db_load(); cid = str(cid)
        if cid not in d: d[cid] = {}
        d[cid].update(fields)
        db_save(d)

def db_delete(cid):
    with _db_lock:
        d = db_load(); d.pop(str(cid), None); db_save(d)

def db_all():
    with _db_lock: return db_load()

sessions      = {}
sessions_lock = threading.Lock()

def sess_get(cid):
    with sessions_lock: return sessions.get(str(cid))

def sess_new(cid):
    cid = str(cid)
    with sessions_lock:
        sessions[cid] = {
            "driver":             None,
            DRV_HUB:              None,
            DRV_PORTAL:           None,
            DRV_SMS:              None,
            DRV_NUMBERS:          None,
            "drv_lock_hub":       threading.Lock(),
            "drv_lock_portal":    threading.Lock(),
            "drv_lock_sms":       threading.Lock(),
            "drv_lock_numbers":   threading.Lock(),
            "driver_lock":        threading.Lock(),
            "busy":               threading.Event(),
            "seen_ids":           set(),
            "wa_harian":          Counter(),
            "traffic_counter":    Counter(),
            "data_lock":          threading.Lock(),
            "tanggal":            date.today(),
            "start_time":         datetime.now(),
            "last_reload":        0.0,
            "last_api_poll":      0.0,
            "last_auto_range":    0.0,
            "is_logged_in":       False,
            "last_dash_id":       None,
            "hub":                {"ready": False, "email": None, "system": None, "chat_type": None},
            "thread":             None,
            "stop_flag":          threading.Event(),
            "download_dir":       os.path.join(BASE_DIR, f"dl_{cid}"),
            "profile_dir":        os.path.join(BASE_DIR, f"prof_{cid}"),
            "cookie_file":        os.path.join(BASE_DIR, f"cookie_{cid}.pkl"),
            "fwd_group_id":       None,
            "fwd_enabled":        False,
            "otp_seen_ids":       set(),
            "otp_queue":          deque(maxlen=200),
            "api_jar":            None,
            "api_jar_ts":         0.0,
            "auto_range_enabled": True,
            "auto_range_done":    set(),
            "auto_range_date":    None,
            "range_last_msg":     {},
            "active_ranges":      set(),
            "_inject_range":      "",
            "inject_tasks":       {},
            "_numbers_busy":      False,
            "_last_page":         "dashboard",
        }
        os.makedirs(sessions[cid]["download_dir"], exist_ok=True)
        os.makedirs(sessions[cid]["profile_dir"], exist_ok=True)
        return sessions[cid]

def sess_del(cid):
    cid = str(cid)
    with sessions_lock: s = sessions.pop(cid, None)
    if s:
        s["stop_flag"].set()
        for slot in [DRV_HUB, DRV_PORTAL, DRV_SMS, DRV_NUMBERS]:
            drv = s.get(slot)
            if drv:
                try: drv.quit()
                except Exception: pass

def detect_env():
    if "com.termux" in os.environ.get("PREFIX", "") or os.path.isdir("/data/data/com.termux"):
        return "termux"
    if os.path.isfile("/.dockerenv"): return "docker"
    if sys.platform.startswith("linux"): return "vps"
    return "other"

ENV = detect_env()

def find_chrome():
    if CHROMIUM_PATH and os.path.isfile(CHROMIUM_PATH) and os.access(CHROMIUM_PATH, os.X_OK):
        return CHROMIUM_PATH
    termux = [
        "/data/data/com.termux/files/usr/bin/chromium-browser",
        "/data/data/com.termux/files/usr/bin/chromium",
    ]
    vps = [
        "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser", "/usr/bin/chromium",
        "/usr/local/bin/chromium", "/snap/bin/chromium",
        "/opt/google/chrome/google-chrome",
    ]
    paths = termux + vps if ENV == "termux" else vps + termux
    for p in paths:
        if p and os.path.isfile(p) and os.access(p, os.X_OK): return p
    for name in ["google-chrome-stable", "google-chrome", "chromium-browser", "chromium"]:
        p = shutil.which(name)
        if p: return p
    return None

def find_driver():
    if CHROMEDRIVER_PATH and os.path.isfile(CHROMEDRIVER_PATH) and os.access(CHROMEDRIVER_PATH, os.X_OK):
        return CHROMEDRIVER_PATH
    termux = ["/data/data/com.termux/files/usr/bin/chromedriver"]
    vps    = [
        "/usr/bin/chromedriver", "/usr/local/bin/chromedriver",
        "/usr/lib/chromium-browser/chromedriver", "/usr/lib/chromium/chromedriver",
        "/snap/bin/chromedriver",
    ]
    paths = termux + vps if ENV == "termux" else vps + termux
    for p in paths:
        if p and os.path.isfile(p) and os.access(p, os.X_OK): return p
    return shutil.which("chromedriver")

def _new_http_session():
    s = requests.Session()
    r = Retry(total=3, backoff_factor=0.4, status_forcelist=[429, 500, 502, 503])
    s.mount("https://", HTTPAdapter(max_retries=r))
    return s

_tg_sess  = _new_http_session()
_api_sess = _new_http_session()

def esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def tg_post(ep, data, timeout=10):
    for i in range(3):
        try:
            r = _tg_sess.post(f"{TG_API}/{ep}", json=data, timeout=timeout)
            if r.ok: return r.json()
            if r.status_code == 429:
                time.sleep(r.json().get("parameters", {}).get("retry_after", 2)); continue
            return r.json()
        except Exception:
            if i < 2: time.sleep(0.5 * (i + 1))
    return None

def send_msg(cid, text, markup=None):
    p = {"chat_id": str(cid), "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup: p["reply_markup"] = markup
    r = tg_post("sendMessage", p)
    return r["result"]["message_id"] if r and r.get("ok") else None

def edit_msg(cid, mid, text, markup=None):
    p = {"chat_id": str(cid), "message_id": mid, "text": text,
         "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup is not None: p["reply_markup"] = markup
    r = tg_post("editMessageText", p)
    return r and (r.get("ok") or "not modified" in str(r).lower())

def delete_msg(cid, mid):
    threading.Thread(
        target=tg_post, args=("deleteMessage", {"chat_id": str(cid), "message_id": mid}),
        daemon=True).start()

def answer_cb(cb_id, text=""):
    threading.Thread(
        target=tg_post, args=("answerCallbackQuery", {"callback_query_id": cb_id, "text": text}),
        daemon=True).start()

def dashboard(cid, text, markup=None):
    if markup is None: markup = kb_main(cid)
    s   = sess_get(cid)
    mid = s.get("last_dash_id") if s else None
    if mid and edit_msg(cid, mid, text, markup):
        return mid
    if s: s["last_dash_id"] = None
    new_mid = send_msg(cid, text, markup)
    if new_mid and s: s["last_dash_id"] = new_mid
    return new_mid

def send_file(cid, path, caption=""):
    if not os.path.isfile(path) or os.path.getsize(path) == 0: return False
    cap = caption[:1024] if caption else ""
    for i in range(3):
        try:
            with open(path, "rb") as fh: fdata = fh.read()
            r = requests.post(
                f"{TG_API}/sendDocument",
                data={"chat_id": str(cid), "caption": cap, "parse_mode": "HTML"},
                files={"document": (os.path.basename(path), fdata, "text/plain")},
                timeout=120)
            if r.ok: return True
            resp = r.json()
            if r.status_code == 429:
                time.sleep(resp.get("parameters", {}).get("retry_after", 5)); continue
            if r.status_code == 400 and "caption" in resp.get("description", "").lower():
                cap = ""; continue
            break
        except Exception as e:
            log.error(f"send_file #{i+1}: {e}")
            if i < 2: time.sleep(3)
    return False

_ANIM = ["▰▱▱▱▱▱▱▱▱▱", "▰▰▱▱▱▱▱▱▱▱", "▰▰▰▱▱▱▱▱▱▱", "▰▰▰▰▱▱▱▱▱▱",
         "▰▰▰▰▰▱▱▱▱▱", "▰▰▰▰▰▰▱▱▱▱", "▰▰▰▰▰▰▰▱▱▱", "▰▰▰▰▰▰▰▰▱▱",
         "▰▰▰▰▰▰▰▰▰▱", "▰▰▰▰▰▰▰▰▰▰"]

def anim_frame(step):
    return _ANIM[step % len(_ANIM)]

def kb_main(cid=None):
    s        = sess_get(cid) if cid else None
    fwd_on   = s and s.get("fwd_enabled") and s.get("fwd_group_id")
    ar_on    = s and s.get("auto_range_enabled", True)
    fwd_icon = "📡" if fwd_on else "📴"
    ar_icon  = "🟢" if ar_on else "🔴"
    is_owner = cid and str(cid) == OWNER_ID
    if is_owner:
        return {"inline_keyboard": [
            [{"text": "📊 Dashboard",     "callback_data": "nav:status"},
             {"text": "📈 Traffic",       "callback_data": "nav:traffic"}],
            [{"text": "➕ Inject Range",  "callback_data": "nav:inject"},
             {"text": "📥 My Numbers",    "callback_data": "nav:mynums"}],
            [{"text": "🗑 Delete All",    "callback_data": "nav:deletenum"},
             {"text": f"{ar_icon} Auto Range", "callback_data": "nav:autorange"}],
            [{"text": f"{fwd_icon} Forward OTP", "callback_data": "nav:forward"},
             {"text": "🔄 Refresh",       "callback_data": "nav:refresh"}],
            [{"text": "❓ Bantuan",       "callback_data": "nav:bantuan"}],
        ]}
    return {"inline_keyboard": [
        [{"text": "📊 Dashboard",     "callback_data": "nav:status"},
         {"text": "📈 Traffic",       "callback_data": "nav:traffic"}],
        [{"text": "➕ Inject Range",  "callback_data": "nav:inject"},
         {"text": "📥 My Numbers",    "callback_data": "nav:mynums"}],
        [{"text": f"{ar_icon} Auto Range", "callback_data": "nav:autorange"},
         {"text": "🔄 Refresh",       "callback_data": "nav:refresh"}],
        [{"text": "❓ Bantuan",       "callback_data": "nav:bantuan"}],
    ]}

def kb_back():
    return {"inline_keyboard": [[{"text": "🔙 Kembali ke Menu", "callback_data": "nav:main"}]]}

def kb_qty(rn):
    rows = [{"text": f" {q} Nomor ", "callback_data": f"inject:{rn}:{q}"} for q in QTY_OPTIONS]
    return {"inline_keyboard": [
        [rows[0], rows[1]], [rows[2], rows[3]], [rows[4]],
        [{"text": "❌ Batal", "callback_data": "nav:main"}],
    ]}

def kb_export_select_range(s):
    rows = []
    if s:
        ranges = sorted(s.get("traffic_counter", {}).keys())
        for rng in ranges[:16]:
            lbl = rng[:28]
            rows.append([{"text": f"📌 {lbl}", "callback_data": f"export_range:{rng[:50]}"}])
    rows.append([{"text": "✅ Semua Range", "callback_data": "confirm:export:ALL"}])
    rows.append([{"text": "❌ Batal",       "callback_data": "nav:main"}])
    return {"inline_keyboard": rows}

def kb_konfirm_del():
    return {"inline_keyboard": [
        [{"text": "✅ Ya, Hapus Semua", "callback_data": "confirm:del"}],
        [{"text": "❌ Batal",           "callback_data": "nav:main"}],
    ]}

def kb_konfirm_export():
    return {"inline_keyboard": [
        [{"text": "✅ Semua Range (Download Semua)", "callback_data": "confirm:export:ALL"}],
        [{"text": "🔍 Pilih Range Tertentu",         "callback_data": "confirm:export:SELECT"}],
        [{"text": "❌ Batal",                         "callback_data": "nav:main"}],
    ]}

_setup_state = {}
_setup_lock  = threading.Lock()
_setup_msg   = {}

def setup_get(cid):
    with _setup_lock: return _setup_state.get(str(cid))

def setup_set(cid, val):
    with _setup_lock: _setup_state[str(cid)] = val

def setup_del(cid):
    with _setup_lock: _setup_state.pop(str(cid), None)

def setup_msg_get(cid):
    with _setup_lock: return _setup_msg.get(str(cid))

def setup_msg_set(cid, mid):
    with _setup_lock: _setup_msg[str(cid)] = mid

def setup_msg_del(cid):
    with _setup_lock: _setup_msg.pop(str(cid), None)

def kb_setup_step(step):
    if step == "email":
        return {"inline_keyboard": [
            [{"text": "❌ Batal Setup", "callback_data": "setup:cancel"}]
        ]}
    elif step == "password":
        return {"inline_keyboard": [
            [{"text": "⬅️ Kembali",    "callback_data": "setup:back_email"},
             {"text": "❌ Batal",       "callback_data": "setup:cancel"}]
        ]}
    elif step == "chat_name":
        return {"inline_keyboard": [
            [{"text": "⬅️ Kembali",    "callback_data": "setup:back_password"},
             {"text": "❌ Batal",       "callback_data": "setup:cancel"}]
        ]}
    return kb_back()

def kb_setup_confirm(email, chat_name):
    return {"inline_keyboard": [
        [{"text": "✅ Lanjutkan & Simpan", "callback_data": "setup:confirm"}],
        [{"text": "✏️ Edit",               "callback_data": "setup:back_chat_name"},
         {"text": "❌ Batal",              "callback_data": "setup:cancel"}],
    ]}

BANTUAN = (
    "<b>NEXUS — COMMAND CENTER</b>\n"
    "━━━━━━━━━━━━━━━━━━━━━\n\n"
    "<b>Core</b>\n"
    "/start   — Dashboard utama\n"
    "/setup   — Konfigurasi akun iVAS\n"
    "/stop    — Matikan engine\n\n"
    "<b>Inject & Range</b>\n"
    "/addrange  — Inject nomor ke range\n"
    "/autorange — Toggle auto inject\n"
    "/traffic   — Data traffic & routing\n\n"
    "<b>Data</b>\n"
    "/mynumber  — Export nomor aktif\n"
    "/deletenum — Hapus semua nomor\n"
    "/forward   — Setup forward OTP\n"
    "/reset     — Reset counter harian"
)

def fmt_dashboard(cid):
    s    = sess_get(cid)
    user = db_get(cid) or {}
    email = user.get("email", "?")
    name  = user.get("name", "?")
    if not s:
        return (
            "<b>📡 NEXUS DASHBOARD</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"👤 {esc(name)}\n"
            f"📧 <code>{esc(email)}</code>\n\n"
            "🔴 Engine Offline — Ketik /start"
        )
    up  = str(datetime.now() - s["start_time"]).split(".")[0]
    tgl = s["tanggal"].strftime("%d %b %Y")
    with s["data_lock"]:
        total = sum(s["wa_harian"].values())
        top3  = s["wa_harian"].most_common(3)
    ar_on  = s.get("auto_range_enabled", True)
    fwd_on = s.get("fwd_enabled") and s.get("fwd_group_id")
    login  = "🟢 ONLINE" if s["is_logged_in"] else "🔴 OFFLINE"
    lines  = [
        "<b>📡 NEXUS DASHBOARD</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━\n",
        f"👤 {esc(name)} | <code>{esc(email)}</code>\n\n",
        f"Auth   : {login}\n",
        f"Uptime : <code>{up}</code>\n",
        f"Env    : <code>{ENV.upper()}</code>\n\n",
        f"Date   : <code>{tgl}</code>\n",
        f"OTP WA : <code>{total}</code>\n",
        f"Auto   : {'🟢 ON' if ar_on else '🔴 OFF'}\n",
        f"Forward: {'🟢 ON' if fwd_on else '🔴 OFF'}\n",
    ]
    if top3:
        lines.append("\n<b>🔥 Top Routes</b>\n")
        for i, (c, n) in enumerate(top3, 1):
            char = "┣" if i < len(top3) else "┗"
            lines.append(f"{char} {esc(c)} — <code>{n}</code>\n")
    return "".join(lines)

def fmt_traffic(cid):
    s = sess_get(cid)
    if not s:
        return "<b>TRAFFIC</b>\n━━━━━━━━━━━━━━━━━━━━━\nEngine tidak berjalan."
    with s["data_lock"]:
        snap  = s["traffic_counter"].copy()
        total = sum(snap.values())
    tgl = s["tanggal"].strftime("%d %b %Y")
    lines = [
        "<b>📈 TRAFFIC — WhatsApp OTP per Negara</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━\n",
        f"Total   : <code>{total} OTP WA</code>\n",
        f"Tanggal : <code>{tgl}</code>\n\n",
        "<b>Negara (gabungan semua range):</b>\n",
    ]
    if snap:
        for i, (c, n) in enumerate(snap.most_common(TOP_N), 1):
            flag = get_country_flag(c)
            lines.append(f"<code>{i:02d}.</code> {flag} {esc(c)[:18]} — <code>{n}</code>\n")
    else:
        lines.append("Belum ada data OTP WhatsApp.\n")
    return "".join(lines)

def make_driver(s):
    chrome   = find_chrome()
    drv_path = find_driver()
    if not chrome:
        raise RuntimeError("Chromium tidak ditemukan. Install terlebih dahulu.")
    opt = Options()
    opt.binary_location = chrome
    args = [
        "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800", f"--user-data-dir={s['profile_dir']}",
        "--disable-extensions", "--disable-notifications", "--mute-audio",
        "--disable-web-security", "--allow-running-insecure-content",
        "--disable-images",
        "--blink-settings=imagesEnabled=false",
        "--disable-background-networking",
        "--aggressive-cache-discard",
    ]
    if ENV == "termux":
        args += [
            "--js-flags=--max-old-space-size=512",
            "--disable-features=VizDisplayCompositor",
            "--memory-pressure-off",
        ]
    else:
        args += ["--disable-setuid-sandbox", "--single-process", "--no-zygote",
                 "--disable-features=VizDisplayCompositor", "--ignore-certificate-errors",
                 "--memory-pressure-off"]
    for a in args: opt.add_argument(a)
    opt.add_experimental_option("prefs", {
        "download.default_directory":   s["download_dir"],
        "download.prompt_for_download": False,
        "download.directory_upgrade":   True,
        "safebrowsing.enabled":         True,
    })
    opt.add_experimental_option("excludeSwitches", ["enable-automation"])
    opt.add_experimental_option("useAutomationExtension", False)
    try:
        drv = (webdriver.Chrome(service=Service(drv_path), options=opt)
               if drv_path else webdriver.Chrome(options=opt))
    except Exception as e:
        log.error(f"make_driver failed: {e}")
        raise
    try:
        drv.execute_cdp_cmd("Page.setDownloadBehavior",
            {"behavior": "allow", "downloadPath": s["download_dir"]})
        drv.execute_cdp_cmd("Network.setUserAgentOverride", {"userAgent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"})
    except Exception: pass
    drv.set_page_load_timeout(45)
    drv.set_script_timeout(30)
    return drv

def make_driver_extra(s, slot_profile_suffix):
    chrome   = find_chrome()
    drv_path = find_driver()
    if not chrome: raise RuntimeError("Chromium tidak ditemukan.")
    opt = Options()
    opt.binary_location = chrome
    sub_prof = s["profile_dir"] + "_" + slot_profile_suffix
    os.makedirs(sub_prof, exist_ok=True)
    args = [
        "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800", f"--user-data-dir={sub_prof}",
        "--disable-extensions", "--disable-notifications", "--mute-audio",
        "--disable-web-security", "--allow-running-insecure-content",
    ]
    if ENV == "termux":
        args += [
            "--js-flags=--max-old-space-size=256",
            "--disable-features=VizDisplayCompositor",
        ]
    else:
        args += ["--disable-setuid-sandbox", "--single-process", "--no-zygote",
                 "--disable-features=VizDisplayCompositor", "--ignore-certificate-errors"]
    for a in args: opt.add_argument(a)
    opt.add_experimental_option("prefs", {
        "download.default_directory":   s["download_dir"],
        "download.prompt_for_download": False,
        "download.directory_upgrade":   True,
        "safebrowsing.enabled":         True,
    })
    opt.add_experimental_option("excludeSwitches", ["enable-automation"])
    opt.add_experimental_option("useAutomationExtension", False)
    try:
        drv = (webdriver.Chrome(service=Service(drv_path), options=opt)
               if drv_path else webdriver.Chrome(options=opt))
    except Exception as e:
        log.warning(f"make_driver_extra failed: {e}")
        raise
    try:
        drv.execute_cdp_cmd("Page.setDownloadBehavior",
            {"behavior": "allow", "downloadPath": s["download_dir"]})
        drv.execute_cdp_cmd("Network.setUserAgentOverride", {"userAgent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"})
    except Exception: pass
    drv.set_page_load_timeout(45)
    drv.set_script_timeout(30)
    return drv

def _copy_cookies_to_driver(src_drv, dst_drv, base_url):
    try:
        dst_drv.get(base_url); time.sleep(1)
        for c in src_drv.get_cookies():
            try: dst_drv.add_cookie(c)
            except Exception: pass
    except Exception as e:
        log.warning(f"copy_cookies: {e}")

def _sms_reload_loop(s):
    while not s["stop_flag"].is_set():
        drv = s.get(DRV_SMS)
        if drv:
            try:
                with s["drv_lock_sms"]:
                    try:
                        cur = drv.current_url
                    except Exception:
                        cur = ""
                    if URL_SMS_RCV not in cur:
                        drv.get(URL_SMS_RCV)
                        time.sleep(2.5)
                    today = datetime.now().strftime("%Y-%m-%d")
                    try:
                        drv.execute_script(
                            f"(function(){{"
                            f"  var sd=document.querySelector('input[name=\"start_date\"],"
                            f"#start_date,input[type=\"date\"]');"
                            f"  if(sd){{sd.value='{today}';sd.dispatchEvent(new Event('change'));}}"
                            f"  var ed=document.querySelector('input[name=\"end_date\"],#end_date');"
                            f"  if(ed){{ed.value='{today}';ed.dispatchEvent(new Event('change'));}}"
                            f"}})();"
                        )
                    except Exception:
                        pass
                    clicked = False
                    for by, sel in [
                        (By.XPATH, "//button[contains(normalize-space(text()),'Get SMS')]"),
                        (By.CSS_SELECTOR, "button.btn-warning"),
                        (By.CSS_SELECTOR, "form button[type='submit']"),
                    ]:
                        try:
                            btn = WebDriverWait(drv, 3).until(EC.element_to_be_clickable((by, sel)))
                            drv.execute_script("arguments[0].click();", btn)
                            clicked = True
                            break
                        except Exception:
                            pass
                    try:
                        WebDriverWait(drv, 5).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr")))
                    except Exception:
                        pass
            except Exception as e:
                log.debug(f"sms_reload: {e}")
        time.sleep(4)

def _numbers_reload_loop(s):
    while not s["stop_flag"].is_set():
        time.sleep(30)
        drv = s.get(DRV_NUMBERS)
        if drv and not s["drv_lock_numbers"].locked():
            try:
                with s["drv_lock_numbers"]:
                    drv.get(URL_NUMBERS)
                    try:
                        WebDriverWait(drv, 5).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, "table")))
                    except Exception: pass
            except Exception as e:
                log.debug(f"numbers_reload: {e}")

def _init_extra_drivers(s, user):
    hub_drv = s.get(DRV_HUB)
    if not hub_drv: return

    def _boot_slot(slot, url, lock_key, profile_sfx):
        try:
            drv = make_driver_extra(s, profile_sfx)
            _copy_cookies_to_driver(hub_drv, drv, URL_BASE)
            drv.get(url)
            try:
                WebDriverWait(drv, 10).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body")))
            except Exception: pass
            time.sleep(1.5)
            s[slot] = drv
            log.info(f"Driver slot [{slot}] ready: {url}")
        except Exception as e:
            log.warning(f"_boot_slot [{slot}]: {e}")

    if ENV == "termux":
        for slot, url, sfx in [
            (DRV_NUMBERS, URL_NUMBERS, "numbers"),
            (DRV_SMS,     URL_SMS_RCV, "sms"),
        ]:
            _boot_slot(slot, url, f"drv_lock_{sfx}", sfx)
            time.sleep(1)
    else:
        threads = [
            threading.Thread(target=_boot_slot,
                args=(DRV_PORTAL, URL_PORTAL, "drv_lock_portal", "portal"), daemon=True),
            threading.Thread(target=_boot_slot,
                args=(DRV_SMS, URL_SMS_RCV, "drv_lock_sms", "sms"), daemon=True),
            threading.Thread(target=_boot_slot,
                args=(DRV_NUMBERS, URL_NUMBERS, "drv_lock_numbers", "numbers"), daemon=True),
        ]
        for t in threads: t.start()
        for t in threads: t.join(timeout=40)
    log.info("Extra drivers initialized")
    threading.Thread(target=_sms_reload_loop, args=(s,), daemon=True).start()
    threading.Thread(target=_numbers_reload_loop, args=(s,), daemon=True).start()

def do_login_driver(driver, email, password):
    driver.get(URL_LOGIN); time.sleep(2.5)
    ef = None
    for by, sel in [
        (By.ID, "card-email"), (By.ID, "email"), (By.NAME, "email"),
        (By.CSS_SELECTOR, "input[type='email']"),
        (By.CSS_SELECTOR, "input[placeholder*='email' i]"),
    ]:
        try: ef = WebDriverWait(driver, 6).until(EC.presence_of_element_located((by, sel))); break
        except Exception: pass
    if not ef: raise Exception("Email field tidak ditemukan")
    pf = None
    for by, sel in [
        (By.ID, "card-password"), (By.ID, "password"), (By.NAME, "password"),
        (By.CSS_SELECTOR, "input[type='password']"),
    ]:
        try: pf = driver.find_element(by, sel); break
        except Exception: pass
    if not pf: raise Exception("Password field tidak ditemukan")
    ef.clear(); ef.send_keys(email)
    pf.clear(); pf.send_keys(password)
    time.sleep(1)
    clicked = False
    for by, sel in [
        (By.CSS_SELECTOR, "button[name='submit']"),
        (By.CSS_SELECTOR, "button[type='submit']"),
        (By.XPATH, "//button[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ',"
                   "'abcdefghijklmnopqrstuvwxyz'),'login')]"),
        (By.CSS_SELECTOR, "input[type='submit']"),
    ]:
        try:
            btn = WebDriverWait(driver, 4).until(EC.element_to_be_clickable((by, sel)))
            driver.execute_script("arguments[0].click();", btn); clicked = True; break
        except Exception: pass
    if not clicked: raise Exception("Submit button tidak ditemukan")
    time.sleep(5)
    return "login" not in driver.current_url

def try_cookie_login(driver, s):
    cf = s["cookie_file"]
    if not os.path.exists(cf): return False
    try:
        driver.get(URL_BASE); time.sleep(1.5)
        with open(cf, "rb") as f: cookies = pickle.load(f)
        for c in cookies:
            try: driver.add_cookie(c)
            except Exception: pass
        driver.get(URL_PORTAL); time.sleep(2.5)
        if "login" not in driver.current_url: return True
        os.remove(cf); return False
    except Exception: return False

def save_cookies(driver, s):
    try:
        with open(s["cookie_file"], "wb") as f: pickle.dump(driver.get_cookies(), f)
    except Exception: pass

def _socket_connected(driver):
    try:
        return bool(driver.execute_script(
            "return typeof socket!=='undefined'&&socket.connected===true;"))
    except Exception: return False

def init_hub(driver, s, email, chat_name="nexus"):
    hub_url = None
    try:
        driver.get(URL_PORTAL); time.sleep(2)
        for fr in driver.find_elements(By.TAG_NAME, "iframe"):
            src = fr.get_attribute("src") or ""
            if "hub.orangecarrier.com" in src: hub_url = src; break
    except Exception: pass
    if not hub_url: hub_url = f"{URL_HUB}?system=ivas"
    for attempt in range(3):
        try:
            driver.get(hub_url)
            deadline = time.time() + HUB_TIMEOUT
            while time.time() < deadline:
                if _socket_connected(driver): break
                time.sleep(0.3)
            else:
                if attempt < 2: time.sleep(3); continue
                break
            try:
                ov = driver.find_element(By.ID, "chatEmailOverlay")
                if ov.is_displayed():
                    inp = WebDriverWait(driver, 5).until(
                        EC.visibility_of_element_located((By.ID, "chatEmailInput")))
                    inp.clear(); inp.send_keys(email)
                    try:
                        ni = driver.find_element(By.ID, "chatNameInput")
                        ni.clear(); ni.send_keys(chat_name)
                    except Exception: pass
                    driver.execute_script("arguments[0].click();",
                        driver.find_element(By.CSS_SELECTOR, "#chatEmailForm button[type='submit']"))
                    time.sleep(3)
            except Exception: pass
            info = None
            for _ in range(10):
                time.sleep(0.4)
                try:
                    info = driver.execute_script(
                        "return(typeof currentUserInfo!=='undefined'&&currentUserInfo)"
                        "?{email:currentUserInfo.email,system:currentSystem,"
                        "type:(typeof chatAuth!=='undefined'?chatAuth.getChatType():'internal')}:null;")
                    if info and info.get("email"): break
                except Exception: pass
            if not info or not info.get("email"):
                info = {"email": email, "system": "ivas", "type": "internal"}
            s["hub"].update({"ready": True, "email": info["email"],
                             "system": info.get("system", "ivas"),
                             "chat_type": info.get("type", "internal"),
                             "_hub_url": hub_url})
            log.info(f"Hub ready: {info['email']}")
            return True
        except Exception as e:
            log.warning(f"init_hub [{attempt+1}]: {e}")
            if attempt < 2: time.sleep(3)
    s["hub"]["ready"] = False
    return False

def inject_once(driver, s):
    h  = s["hub"]
    em, sys_, ct = h["email"], h["system"], h["chat_type"]
    rn = s.get("_inject_range", "")
    try:
        mb = driver.execute_script("return document.querySelectorAll('#messages .message').length;")
    except Exception: mb = 0
    r1 = driver.execute_script(
        f"try{{if(!socket||!socket.connected)return 'nc';"
        f"socket.emit('menu_selection',{{selection:'add_numbers',email:'{em}',"
        f"system:'{sys_}',type:'{ct}'}});return 'ok';}}catch(e){{return 'e:'+e.message;}}")
    if r1 != "ok": return False, f"menu_selection: {r1}"
    time.sleep(0.6)
    r2 = driver.execute_script(
        f"try{{if(!socket||!socket.connected)return 'nc';"
        f"socket.emit('form_submission',{{formType:'add_numbers',"
        f"formData:{{termination_string:'{rn}'}},"
        f"email:'{em}',system:'{sys_}',type:'{ct}'}});return 'ok';}}"
        f"catch(e){{return 'e:'+e.message;}}")
    if r2 != "ok": return False, f"form_submission: {r2}"
    deadline = time.time() + INJECT_TIMEOUT; ma = mb
    while time.time() < deadline:
        time.sleep(0.2)
        try: ma = driver.execute_script(
                "return document.querySelectorAll('#messages .message').length;")
        except Exception: continue
        if ma > mb:
            last = driver.execute_script(
                "var m=document.querySelectorAll('#messages .message');"
                "return m.length?m[m.length-1].innerText.toLowerCase():'';") or ""
            if any(k in last for k in ["successfully", "processed", "added", "success"]): break
            if any(k in last for k in ["error", "failed", "invalid"]):
                full = driver.execute_script(
                    f"var m=document.querySelectorAll('#messages .message'),o=[];"
                    f"for(var i={mb};i<m.length;i++)o.push(m[i].innerText.trim());"
                    f"return o.join(' | ');") or ""
                return False, full[:200]
    else:
        if ma == mb: return False, f"Timeout {INJECT_TIMEOUT}s"
    full = driver.execute_script(
        f"var m=document.querySelectorAll('#messages .message'),o=[];"
        f"for(var i={mb};i<m.length;i++)o.push(m[i].innerText.trim());"
        f"return o.join(' | ');") or ""
    lo = full.lower()
    if any(k in lo for k in ["successfully", "processed", "added", "success"]):
        return True, full[:200]
    return False, full[:200]

def do_inject(cid, s, range_name, qty, mid):
    jumlah = math.ceil(qty / NOMOR_PER_REQUEST)
    driver = s["driver"]
    try:
        with s["driver_lock"]:
            if not s["hub"]["ready"] or not _socket_connected(driver):
                s["hub"]["ready"] = False
                user = db_get(cid)
                init_hub(driver, s, user["email"], user.get("chat_name", "nexus"))
        s["_inject_range"] = range_name
        edit_msg(cid, mid,
            "<b>⚙️ INJECT INITIALIZATION</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"Range  : <code>{esc(range_name)}</code>\n"
            f"Target : <code>{qty} Nomor</code>\n"
            f"Batch  : <code>{jumlah}x ({NOMOR_PER_REQUEST}/req)</code>\n\n"
            f"<blockquote>{anim_frame(0)} Menyiapkan soket...</blockquote>",
            {"inline_keyboard": []})
        ok = fail_streak = done_nums = 0
        last_edit_t = time.time()
        for i in range(jumlah):
            if s["stop_flag"].is_set(): break
            with s["driver_lock"]:
                try:
                    if not _socket_connected(driver):
                        s["hub"]["ready"] = False
                        user = db_get(cid)
                        init_hub(driver, s, user["email"], user.get("chat_name", "nexus"))
                    success, reply = inject_once(driver, s)
                except Exception as ex:
                    success, reply = False, str(ex)
            if success:
                ok += 1; fail_streak = 0; done_nums += NOMOR_PER_REQUEST
            else:
                fail_streak += 1
                if fail_streak >= MAX_FAIL:
                    edit_msg(cid, mid,
                        "<b>❌ INJECTION FAILED</b>\n"
                        "━━━━━━━━━━━━━━━━━━━━━\n"
                        f"Max retry tercapai.\n"
                        f"<blockquote>{esc(reply[:200])}</blockquote>", kb_back())
                    return
            now = time.time()
            if (i + 1) % 2 == 0 or (i + 1) == jumlah or now - last_edit_t >= 3:
                pct = int((i + 1) / jumlah * 100)
                af  = anim_frame(i)
                edit_msg(cid, mid,
                    "<b>⚙️ INJECT PROGRESS</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"Range  : <code>{esc(range_name)}</code>\n"
                    f"Load   : <code>{af} {pct}%</code>\n\n"
                    f"Sukses : <code>{ok} req (~{done_nums} nums)</code>\n"
                    f"Gagal  : <code>{i+1-ok} req</code>",
                    {"inline_keyboard": []})
                last_edit_t = now
            time.sleep(INJECT_DELAY)
        with s["driver_lock"]:
            try:
                hub_url = s["hub"].get("_hub_url") or f"{URL_HUB}?system=ivas"
                driver.get(hub_url); time.sleep(1)
            except Exception: pass
        icon = "✅" if ok == jumlah else ("⚠️" if ok > 0 else "❌")
        edit_msg(cid, mid,
            f"<b>{icon} INJECT COMPLETED</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"Range  : <code>{esc(range_name)}</code>\n"
            f"Result : <code>~{done_nums} Nomor Valid</code>\n"
            f"Valid  : <code>{ok}/{jumlah} req</code>\n"
            f"Error  : <code>{jumlah-ok}/{jumlah} req</code>",
            kb_back())
    except Exception as ex:
        log.error(f"do_inject [{cid}]: {ex}")
        edit_msg(cid, mid,
            "<b>CRITICAL ERROR</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"<blockquote>{esc(str(ex)[:300])}</blockquote>", kb_back())

def _clean_nomor(val):
    if val is None: return None
    s = str(val).strip()
    if "." in s:
        try: s = str(int(float(s)))
        except Exception: s = s.split(".")[0]
    if s and s not in ("None", "nan", "") and s.lstrip("+-").isdigit() and len(s) >= 6:
        return s.lstrip("+")
    return None

def _parse_xlsx(xl_path):
    import openpyxl
    wb = openpyxl.load_workbook(xl_path, read_only=True, data_only=True)
    ws = wb.active; rows = list(ws.iter_rows(values_only=True)); wb.close()
    if not rows: return []
    header  = [str(c).strip().lower() if c is not None else "" for c in rows[0]]
    num_col = next((i for i, h in enumerate(header) if any(x in h for x in
                    ["number", "nomor", "phone", "msisdn", "num", "tel", "hp", "mobile"])), None)
    if num_col is None:
        for row in rows[1:8]:
            for idx, val in enumerate(row):
                n = _clean_nomor(val)
                if n: num_col = idx; break
            if num_col is not None: break
    if num_col is None: num_col = 0
    result = []
    for row in rows[1:]:
        val = row[num_col] if len(row) > num_col else None
        n = _clean_nomor(val)
        if n: result.append(n)
    return result

def _scrape_nums_from_table(driver):
    all_nums = []; page = 1
    while True:
        rows = driver.execute_script(
            "var o=[];document.querySelectorAll('table tbody tr').forEach(function(tr){"
            "var td=tr.querySelectorAll('td');if(!td.length)return;"
            "var r=[];for(var i=0;i<td.length;i++)r.push(td[i].innerText.trim());o.push(r);});"
            "return o;") or []
        found = 0
        for cols in rows:
            if not cols or (len(cols) == 1 and
               ("no data" in cols[0].lower() or "processing" in cols[0].lower())):
                continue
            for v in cols:
                s2 = v.strip().split(".")[0]
                if s2.lstrip("+-").isdigit() and len(s2) >= 6:
                    all_nums.append(s2.lstrip("+")); found += 1; break
        if not found: break
        try:
            nxt = driver.find_element(By.CSS_SELECTOR,
                "a.paginate_button.next:not(.disabled),li.next:not(.disabled) a")
            if nxt.is_displayed():
                driver.execute_script("arguments[0].click();", nxt)
                time.sleep(1.2); page += 1
            else: break
        except Exception: break
    return all_nums

def _export_via_http(s, driver):
    jar = _get_api_jar(driver, s)
    if not jar: return None
    hdrs = {
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*",
        "Referer": URL_NUMBERS,
        "X-Requested-With": "XMLHttpRequest",
    }
    export_urls = [
        f"{URL_BASE}/portal/numbers/export",
        f"{URL_BASE}/portal/numbers/export-excel",
        f"{URL_BASE}/api/numbers/export",
        f"{URL_BASE}/numbers/export",
    ]
    for ep in export_urls:
        try:
            r = _api_sess.get(ep, cookies=jar, headers=hdrs, timeout=45, stream=True)
            if r.status_code == 200 and len(r.content) > 100:
                ct = r.headers.get("Content-Type", "")
                if "excel" in ct or "spreadsheet" in ct or "octet" in ct or r.content[:4] == b"PK\x03\x04":
                    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
                    pth = os.path.join(s["download_dir"], f"export_{ts}.xlsx")
                    with open(pth, "wb") as f: f.write(r.content)
                    return pth
        except Exception as e:
            log.debug(f"_export_via_http [{ep}]: {e}")
    return None

def _find_export_href(driver):
    for by, sel in [
        (By.XPATH, "//a[contains(translate(normalize-space(.),"
                   "'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'export number excel')]"),
        (By.XPATH, "//a[contains(@href,'export')]"),
        (By.CSS_SELECTOR, "a[href*='export']"),
    ]:
        try:
            els = driver.find_elements(by, sel)
            for el in els:
                href = el.get_attribute("href") or ""
                txt  = (el.text or el.get_attribute("innerText") or "").lower()
                if href and ("export" in txt or "excel" in txt or "export" in href):
                    return href
        except Exception: pass
    return None

def _click_export_safe(driver, el):
    try:
        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        time.sleep(0.3)
        href = el.get_attribute("href") or ""
        if href and href.startswith("http"):
            return href
        driver.set_script_timeout(45)
        driver.execute_script("arguments[0].click();", el)
        driver.set_script_timeout(20)
        return None
    except Exception as e:
        log.warning(f"_click_export_safe: {e}")
        return None

def do_export(cid, s, mid, filter_range=None):
    driver   = s.get(DRV_NUMBERS) or s["driver"]
    drv_lock = s["drv_lock_numbers"] if s.get(DRV_NUMBERS) else s["driver_lock"]
    xl = txt_path = None
    lbl = f" [{filter_range}]" if filter_range else " [SEMUA]"
    try:
        aframe = 0
        edit_msg(cid, mid,
            f"<b>📥 EXPORT NUMBERS{lbl}</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"<blockquote>{anim_frame(aframe)} Membuka portal numbers...</blockquote>",
            {"inline_keyboard": []})
        with drv_lock:
            for f in (glob.glob(os.path.join(s["download_dir"], "*.xlsx")) +
                      glob.glob(os.path.join(s["download_dir"], "*.xls"))):
                try: os.remove(f)
                except Exception: pass

            try:
                driver.get(URL_NUMBERS)
                WebDriverWait(driver, 12).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "table,#DataTables_Table_0")))
                time.sleep(1)
            except Exception:
                time.sleep(2)

            aframe += 1
            edit_msg(cid, mid,
                f"<b>📥 EXPORT NUMBERS{lbl}</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                f"<blockquote>{anim_frame(aframe)} Mengunduh via HTTP (tanpa klik)...</blockquote>",
                {"inline_keyboard": []})

            xl = _export_via_http(s, driver)

            if not xl:
                href = _find_export_href(driver)
                if href:
                    try:
                        jar = _get_api_jar(driver, s)
                        r   = _api_sess.get(href, cookies=jar,
                                            headers={"Referer": URL_NUMBERS}, timeout=60)
                        if r.status_code == 200 and len(r.content) > 100:
                            pth = os.path.join(s["download_dir"], "export_href.xlsx")
                            with open(pth, "wb") as f2: f2.write(r.content)
                            xl = pth
                    except Exception as e:
                        log.warning(f"href download: {e}")

            numbers = []
            if xl:
                aframe += 1
                edit_msg(cid, mid,
                    f"<b>📥 EXPORT NUMBERS{lbl}</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"<blockquote>{anim_frame(aframe)} Membaca data Excel...</blockquote>",
                    {"inline_keyboard": []})
                try: numbers = _parse_xlsx(xl)
                except Exception as e: log.warning(f"parse xlsx: {e}")

            if not numbers:
                aframe += 1
                edit_msg(cid, mid,
                    f"<b>📥 EXPORT NUMBERS{lbl}</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"<blockquote>{anim_frame(aframe)} Scrape tabel web (fallback)...</blockquote>",
                    {"inline_keyboard": []})
                numbers = _scrape_nums_from_table(driver)

            try: driver.get(URL_NUMBERS)
            except Exception: pass

        if filter_range and numbers:
            pass

        if not numbers:
            edit_msg(cid, mid,
                "<b>DATA KOSONG</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Tidak ada nomor aktif di portal saat ini.", kb_back())
            return

        unique   = list(dict.fromkeys(numbers))
        ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_lbl = (filter_range or "ALL").replace(" ", "_")[:20]
        txt_path = os.path.join(s["download_dir"], f"NEXUS_NUMS_{safe_lbl}_{ts}.txt")
        with open(txt_path, "w") as f: f.write("\n".join(unique))
        edit_msg(cid, mid,
            f"<b>📥 EXPORT NUMBERS{lbl}</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"Total : <code>{len(unique)} Nomor</code>\n"
            f"<blockquote>▰▰▰▰▰▰▰▰▰▰ Mengirim ke Telegram...</blockquote>",
            {"inline_keyboard": []})
        cap = (
            f"<b>MY ACTIVE NUMBERS{lbl}</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"Total  : <code>{len(unique)} Nomor</code>\n"
            f"Method : <code>{'Excel' if xl else 'Table Scrape'}</code>\n"
            f"Date   : <code>{datetime.now().strftime('%d %b %Y %H:%M')}</code>"
        )
        if send_file(cid, txt_path, cap):
            edit_msg(cid, mid,
                "<b>✅ EXPORT SELESAI</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "File nomor aktif telah dikirim.", kb_back())
        else:
            edit_msg(cid, mid,
                "<b>❌ GAGAL KIRIM</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Gagal mengirim dokumen ke Telegram.", kb_back())
    except Exception as ex:
        log.error(f"do_export [{cid}]: {ex}\n{traceback.format_exc()}")
        edit_msg(cid, mid,
            "<b>CRITICAL ERROR</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"<blockquote>{esc(str(ex)[:300])}</blockquote>", kb_back())
    finally:
        for p in [xl, txt_path]:
            if p:
                try: os.remove(p)
                except Exception: pass

def do_delete(cid, s, mid):
    try:
        edit_msg(cid, mid,
            "<b>🗑 DELETE ALL NUMBERS</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"<blockquote>{anim_frame(0)} Membuka portal...</blockquote>",
            {"inline_keyboard": []})
        with drv_lock:
            driver.get(URL_NUMBERS); time.sleep(2.5)
            btn = None
            for by, sel in [
                (By.XPATH, "//button[contains(normalize-space(text()),'Bulk return all numbers')]"),
                (By.XPATH, "//a[contains(normalize-space(text()),'Bulk return all numbers')]"),
                (By.XPATH, "//a[contains(normalize-space(text()),'Bulk return all numbers')]"),
                (By.XPATH, "//button[contains(normalize-space(text()),'bulk return')]"),
                (By.CSS_SELECTOR, "button.btn-danger"),
            ]:
                try:
                    btn = WebDriverWait(driver, 8).until(EC.element_to_be_clickable((by, sel))); break
                except Exception: pass
            if not btn:
                edit_msg(cid, mid,
                    "<b>TOMBOL TIDAK DITEMUKAN</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    "Mungkin tidak ada nomor aktif.", kb_back())
                return
            driver.execute_script("arguments[0].scrollIntoView(true);", btn)
            time.sleep(0.3)
            driver.execute_script("arguments[0].click();", btn)
            time.sleep(1.5)
            edit_msg(cid, mid,
                "<b>🗑 DELETE ALL NUMBERS</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                f"<blockquote>{anim_frame(3)} Menunggu konfirmasi...</blockquote>",
                {"inline_keyboard": []})
            try: driver.switch_to.alert.accept(); time.sleep(1.5)
            except Exception: pass
            for sel in [
                "button.confirm", "button.swal-button--confirm", ".swal2-confirm",
                ".modal-footer button.btn-danger",
                "//button[contains(text(),'Yes')]", "//button[contains(text(),'OK')]",
                "//button[contains(text(),'Confirm')]",
            ]:
                try:
                    el = (driver.find_element(By.XPATH, sel) if sel.startswith("//")
                          else driver.find_element(By.CSS_SELECTOR, sel))
                    if el.is_displayed():
                        driver.execute_script("arguments[0].click();", el)
                        time.sleep(2); break
                except Exception: pass
            ok = False; af = 5
            deadline = time.time() + DELETE_TIMEOUT
            while time.time() < deadline:
                time.sleep(0.8); af += 1
                edit_msg(cid, mid,
                    "<b>🗑 DELETE ALL NUMBERS</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"<blockquote>{anim_frame(af)} Memproses penghapusan...</blockquote>",
                    {"inline_keyboard": []})
                try:
                    pt = driver.execute_script("return document.body.innerText.toLowerCase();")
                    if any(x in pt for x in ["no data", "no entries", "showing 0", "success", "returned"]):
                        ok = True; break
                except Exception: pass
            try: driver.get(URL_NUMBERS); time.sleep(1)
            except Exception: pass
        if ok:
            edit_msg(cid, mid,
                "<b>✅ DELETE SELESAI</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Semua nomor berhasil dihapus dari panel.", kb_back())
        else:
            edit_msg(cid, mid,
                "<b>⚠️ STATUS UNKNOWN</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Perintah dikirim. Silakan verifikasi di portal.", kb_back())
    except Exception as ex:
        log.error(f"do_delete [{cid}]: {ex}")
        edit_msg(cid, mid,
            "<b>CRITICAL ERROR</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"<blockquote>{esc(str(ex))}</blockquote>", kb_back())

def parse_country(raw):
    first = raw.split("\n")[0].strip()
    words = [w for w in first.split() if not w.isdigit()]
    return " ".join(words).upper()

def parse_range_full(raw):
    return raw.split("\n")[0].strip().upper()

def normalize_country_key(raw_range):
    words = [w for w in raw_range.split() if not w.isdigit()]
    return " ".join(words).upper() if words else raw_range.upper()

def mask_number(num):
    num = str(num).strip()
    if len(num) <= 6:
        return num
    keep = 4
    mid  = len(num) - keep * 2
    if mid <= 0:
        return num[:4] + "••" + num[-2:]
    return num[:keep] + "•" * mid + num[-keep:]

def extract_otp(msg_text):
    if not msg_text: return None
    for p in [
        r"(?:^|\D)(\d{6})(?:\D|$)",
        r"(?:code|kode|otp|pin)[:\s\-]+([\d\-]+)",
        r"(\d{4,8})\s+(?:is|adalah)\s+(?:your|kode)",
        r"(?:^|\D)(\d{4,8})(?:\D|$)",
    ]:
        m = re.search(p, msg_text, re.IGNORECASE)
        if m:
            code = m.group(1).replace("-", "").strip()
            if 4 <= len(code) <= 8: return code
    return None

def get_country_flag(country_name):
    flags = {
        "TOGO":"🇹🇬","NIGERIA":"🇳🇬","GHANA":"🇬🇭","KENYA":"🇰🇪","SENEGAL":"🇸🇳",
        "BENIN":"🇧🇯","CAMEROON":"🇨🇲","IVORY COAST":"🇨🇮","COTE D IVOIRE":"🇨🇮",
        "ANGOLA":"🇦🇴","CONGO":"🇨🇬","TANZANIA":"🇹🇿","MOZAMBIQUE":"🇲🇿",
        "ZAMBIA":"🇿🇲","ZIMBABWE":"🇿🇼","ETHIOPIA":"🇪🇹","UGANDA":"🇺🇬",
        "RWANDA":"🇷🇼","MALI":"🇲🇱","INDONESIA":"🇮🇩","INDIA":"🇮🇳",
        "PHILIPPINES":"🇵🇭","VIETNAM":"🇻🇳","THAILAND":"🇹🇭","MALAYSIA":"🇲🇾",
        "PAKISTAN":"🇵🇰","BANGLADESH":"🇧🇩","SRI LANKA":"🇱🇰","MYANMAR":"🇲🇲",
        "CAMBODIA":"🇰🇭","LAOS":"🇱🇦","NEPAL":"🇳🇵","SINGAPORE":"🇸🇬",
        "USA":"🇺🇸","UNITED STATES":"🇺🇸","UK":"🇬🇧","UNITED KINGDOM":"🇬🇧",
        "GERMANY":"🇩🇪","FRANCE":"🇫🇷","SPAIN":"🇪🇸","ITALY":"🇮🇹",
        "TURKEY":"🇹🇷","EGYPT":"🇪🇬","RUSSIA":"🇷🇺","UKRAINE":"🇺🇦",
        "COLOMBIA":"🇨🇴","BRAZIL":"🇧🇷","MEXICO":"🇲🇽","PERU":"🇵🇪",
        "ARGENTINA":"🇦🇷","VENEZUELA":"🇻🇪","CHILE":"🇨🇱","ECUADOR":"🇪🇨",
        "IRELAND":"🇮🇪","IRAQ":"🇮🇶",
    }
    cn = country_name.upper().strip()
    for k, v in flags.items():
        if k in cn: return v
    return "🌍"

_JS_SCRAPE = (
    "var o=[];"
    "document.querySelectorAll('table tbody tr').forEach(function(r){"
    "  var td=r.querySelectorAll('td');"
    "  if(td.length<3)return;"
    "  var row=[];"
    "  for(var i=0;i<td.length;i++)row.push(td[i].innerText.trim());"
    "  o.push(row);"
    "});"
    "return o;"
)

def _is_whatsapp_row(cols):
    app_text = " ".join(cols).lower()
    if not any(k in app_text for k in ["whatsapp", "wa.me", "whats app"]):
        return False
    exclude = ["telegram", "signal", "viber", "line app", "google voice",
               "bank", "bca", "mandiri", "bri", "bni", "ovo", "dana",
               "shopee", "tokopedia", "gojek", "grab", "traveloka"]
    return not any(x in app_text for x in exclude)

_JS_SCRAPE_FAST = (
    "var o=[];"
    "document.querySelectorAll('table tbody tr').forEach(function(r){"
    "  var td=r.querySelectorAll('td');"
    "  if(td.length<3)return;"
    "  var row=[];"
    "  for(var i=0;i<td.length;i++)row.push((td[i].innerText||'').trim());"
    "  o.push(row);"
    "});"
    "return o;"
)

def scrape(driver, s):
    today = date.today()
    if today != s["tanggal"]:
        with s["data_lock"]:
            s["wa_harian"].clear(); s["seen_ids"].clear()
            s["traffic_counter"].clear(); s["auto_range_done"].clear()
            s["active_ranges"].clear(); s["range_last_msg"].clear()
            s["auto_range_date"] = today; s["tanggal"] = today
    now = time.time()
    is_sms_slot = (driver is s.get(DRV_SMS))
    if not is_sms_slot and now - s["last_reload"] >= RELOAD_INTERVAL:
        try:
            driver.get(URL_LIVE)
            WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr")))
        except Exception:
            time.sleep(0.5)
        s["last_reload"] = time.time()
    elif is_sms_slot:
        pass
    try:
        rows = driver.execute_script(_JS_SCRAPE_FAST) or []
    except Exception:
        return []
    hasil = []
    seen = s["seen_ids"]
    for cols in rows:
        if not _is_whatsapp_row(cols): continue
        cp  = cols[0] if cols else ""
        app = cols[2] if len(cols) > 2 else ""
        msg = cols[3] if len(cols) > 3 else ""
        uid = f"{cp[:40]}|{app}|{msg[:40]}"
        if uid in seen: continue
        nomor = None
        for v in cols:
            sv = str(v).strip().split(".")[0]
            if sv.isdigit() and len(sv) >= 8: nomor = sv; break
        country      = parse_country(cp)
        range_str    = parse_range_full(cp)
        country_key  = normalize_country_key(range_str)
        otp_code     = extract_otp(msg)
        hasil.append({
            "uid":         uid,
            "country":     country,
            "range":       range_str,
            "country_key": country_key,
            "nomor":       nomor or "",
            "msg":         msg,
            "otp":         otp_code,
            "app":         app,
        })
    return hasil

def _get_api_jar(driver, s):
    now = time.time()
    if s.get("api_jar") and now - s.get("api_jar_ts", 0) < 300:
        return s["api_jar"]
    try:
        jar = {c["name"]: c["value"] for c in driver.get_cookies()}
        s["api_jar"] = jar; s["api_jar_ts"] = now
        return jar
    except Exception: return {}

def forward_otp_to_group(cid, s, item):
    gid     = s.get("fwd_group_id")
    if not gid:
        return
    nomor   = str(item.get("nomor", "")).strip()
    country = item.get("country", "")
    otp     = item.get("otp", "")
    msg_txt = item.get("msg", "")
    range_s = item.get("range", "")
    flag    = get_country_flag(country or range_s)
    masked  = mask_number(nomor) if nomor else "?"
    if not otp:
        m = re.search(r"\d{4,8}", msg_txt)
        otp = m.group() if m else None
    if not otp:
        return
    ts      = datetime.now().strftime("%H:%M:%S")
    channel = range_s or country or "—"
    text = (
        f"{flag} <b>WhatsApp OTP</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        f"📱 <code>{masked}</code>\n\n"
        f"🔑 <b>{esc(otp)}</b>\n\n"
        f"<code>{'Channel':<14}{'Number'}</code>\n"
        f"<code>{esc(channel[:14]):<14}{nomor}</code>\n"
        f"<i>{ts}</i>"
    )
    kb = {"inline_keyboard": [[{"text": f"📋 Copy OTP: {otp}", "callback_data": f"copy:{otp}"}]]}
    s["otp_queue"].append({"ts": ts, "nomor": masked, "country": country, "otp": otp})
    try:
        tg_post("sendMessage", {
            "chat_id": str(gid), "text": text,
            "parse_mode": "HTML", "disable_web_page_preview": True,
            "reply_markup": kb,
        })
    except Exception as e:
        log.warning(f"forward_otp [{cid}]: {e}")

_JS_SCRAPE_SMS_RCV = (
    "(function(){"
    "  var result=[];"
    "  var range='';"
    "  var phone='';"
    "  var rows=document.querySelectorAll('table tr,tbody tr');"
    "  for(var i=0;i<rows.length;i++){"
    "    var tds=rows[i].querySelectorAll('td');"
    "    if(tds.length<2)continue;"
    "    var c=Array.from(tds).map(function(t){return(t.innerText||'').trim();});"
    "    var full=c.join(' ').toLowerCase();"
    "    if(full.indexOf('whatsapp')>=0){"
    "      var msg=c[1]||c[2]||'';"
    "      if(msg)result.push([phone,'WhatsApp',msg,range]);"
    "      continue;"
    "    }"
    "    var v0=(c[0]||'').replace(/\\s+/g,' ').trim();"
    "    var num=v0.replace(/[^0-9]/g,'');"
    "    if(num.length>=8&&/^\\d/.test(v0)){"
    "      phone=num;"
    "      continue;"
    "    }"
    "    if(v0.match(/[A-Z]{3,}/)&&!v0.match(/SENDER|COUNT|PAID|UNPAID|RANGE|REVENUE/i)){"
    "      range=v0.split('\\n')[0].trim();"
    "    }"
    "  }"
    "  return result;"
    "})()"
)

def _scrape_sms_received_dom(drv):
    try:
        rows = drv.execute_script(_JS_SCRAPE_SMS_RCV) or []
        hasil = []
        for r in rows:
            if len(r) < 3:
                continue
            phone, app, msg_t, rng = r[0], r[1], r[2], r[3] if len(r) > 3 else ""
            hasil.append({
                "phone_number": phone,
                "application":  app,
                "otp_message":  msg_t,
                "range":        rng.split("\n")[0].strip().upper(),
            })
        return hasil
    except Exception:
        return []

def _fetch_sms_received(driver, s):
    jar  = _get_api_jar(driver, s)
    hdrs = {"Accept": "application/json", "X-Requested-With": "XMLHttpRequest",
            "Referer": URL_SMS_RCV}
    today_str = datetime.now().strftime("%d/%m/%Y")
    if jar:
        for ep in [
            f"{URL_BASE}/portal/sms/received",
            f"{URL_BASE}/api/sms/received",
            f"{URL_BASE}/sms/received",
        ]:
            try:
                r = _api_sess.get(ep, params={"date": today_str, "limit": 500},
                    cookies=jar, headers=hdrs, timeout=10)
                if r.status_code == 200:
                    try:
                        data = r.json()
                        for key in ["data", "messages", "sms", "otp_messages"]:
                            msgs = data.get(key)
                            if isinstance(msgs, list) and msgs: return msgs
                    except Exception: pass
            except Exception: continue
    sms_drv = s.get(DRV_SMS)
    if sms_drv:
        return _scrape_sms_received_dom(sms_drv)
    return []

def _count_wa_otp_per_range_api(driver, s):
    msgs = _fetch_sms_received(driver, s)
    counter = Counter()
    for m in msgs:
        app = (m.get("application", "") or m.get("app", "") or "").lower()
        if not any(k in app for k in ["whatsapp", "wa.me"]):
            continue
        rng = (m.get("range", "") or m.get("termination_string", "") or "").strip().upper()
        if rng: counter[rng] += 1
    return counter

def fetch_sms_api(driver, s):
    today_str = datetime.now().strftime("%d/%m/%Y")
    jar       = _get_api_jar(driver, s)
    if not jar: return []
    hdrs = {"Accept": "application/json", "X-Requested-With": "XMLHttpRequest", "Referer": URL_LIVE}
    for ep in [f"{URL_BASE}/sms", f"{URL_BASE}/portal/sms", f"{URL_BASE}/api/sms"]:
        try:
            r = _api_sess.get(ep, params={"date": today_str, "limit": 100},
                cookies=jar, headers=hdrs, timeout=12)
            if r.status_code == 200:
                data = r.json()
                for key in ["otp_messages", "data", "messages", "sms"]:
                    msgs = data.get(key)
                    if isinstance(msgs, list) and msgs: return msgs
            elif r.status_code == 401:
                s["api_jar"] = None; break
        except Exception: continue
    return []

def process_api_otps(cid, s):
    if not s.get("fwd_enabled") or not s.get("fwd_group_id"): return
    driver = s.get(DRV_SMS) or s.get("driver")
    if not driver: return
    try:
        sms_drv = s.get(DRV_SMS)
        if sms_drv:
            msgs = _scrape_sms_received_dom(sms_drv)
        else:
            msgs = fetch_sms_api(driver, s)
        for m in msgs:
            app   = (m.get("application", "") or m.get("app", "") or "").lower()
            if not any(k in app for k in ["whatsapp", "wa.me", "whats app"]):
                continue
            phone  = m.get("phone_number", "") or m.get("phone", "")
            msg_t  = m.get("otp_message", "") or m.get("message", "") or m.get("msg", "")
            rng    = m.get("range", "") or m.get("termination_string", "")
            uid    = f"api|{phone}|{msg_t[:50]}"
            if uid in s["otp_seen_ids"]: continue
            s["otp_seen_ids"].add(uid)
            if len(s["otp_seen_ids"]) > MAX_OTP_CACHE:
                s["otp_seen_ids"] = set(list(s["otp_seen_ids"])[-MAX_OTP_CACHE//2:])
            otp = extract_otp(msg_t)
            if not otp: continue
            forward_otp_to_group(cid, s, {
                "nomor":   phone,
                "country": rng.strip().lstrip("+").split()[0].upper() if rng else "",
                "range":   rng.strip().upper(),
                "msg":     msg_t,
                "otp":     otp,
                "app":     "WhatsApp",
            })
    except Exception as e:
        log.debug(f"process_api_otps [{cid}]: {e}")

def _auto_inject_task(cid, s, driver, range_name, qty):
    jumlah = math.ceil(qty / NOMOR_PER_REQUEST)
    ok = done_nums = 0
    try:
        with s["driver_lock"]:
            if not s["hub"]["ready"] or not _socket_connected(driver):
                s["hub"]["ready"] = False
                user = db_get(cid)
                init_hub(driver, s, user["email"], user.get("chat_name", "nexus"))
        s["_inject_range"] = range_name
        af = 0
        for i in range(jumlah):
            if s["stop_flag"].is_set(): break
            with s["driver_lock"]:
                try: success, _ = inject_once(driver, s)
                except Exception: success = False
            if success: ok += 1; done_nums += NOMOR_PER_REQUEST
            af += 1
            time.sleep(INJECT_DELAY)
        icon = "✅" if ok == jumlah else ("⚠️" if ok > 0 else "❌")
        send_msg(cid,
            f"<b>{icon} AUTO INJECT DONE</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"Range  : <code>{esc(range_name)}</code>\n"
            f"Result : <code>~{done_nums} Nomor</code>\n"
            f"Req    : <code>{ok}/{jumlah} Valid</code>")
    except Exception as e:
        log.error(f"_auto_inject_task [{cid}]: {e}")

def check_auto_range(cid, s, driver):
    if not s.get("auto_range_enabled", True) or not driver: return
    today = date.today()
    if s.get("auto_range_date") != today:
        s["auto_range_done"].clear(); s["active_ranges"].clear()
        s["range_last_msg"].clear(); s["auto_range_date"] = today

    now = time.time()
    for rng in list(s.get("active_ranges", set())):
        last_t = s["range_last_msg"].get(rng, now)
        if now - last_t >= AUTO_RANGE_IDLE_TTL:
            s["active_ranges"].discard(rng)
            s["auto_range_done"].discard(rng)
            log.info(f"Auto-range idle expired [{cid}]: {rng}")

    with s["data_lock"]: counter = s["traffic_counter"].copy()
    if not counter: return

    qualified = [(rng, cnt) for rng, cnt in counter.most_common()
                 if cnt >= AUTO_RANGE_MIN_OTP]
    if not qualified: return

    top3 = [r for r, _ in qualified[:AUTO_RANGE_TOP_N]
            if r not in s["auto_range_done"]]
    if not top3: return
    if len(top3) < AUTO_RANGE_TOP_N and len(qualified) >= AUTO_RANGE_TOP_N:
        pass

    user = db_get(cid)
    if not user: return

    send_msg(cid,
        "<b>🔄 AUTO RANGE — SCANNING</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        f"Ditemukan <code>{len(top3)}</code> range aktif (≥{AUTO_RANGE_MIN_OTP} OTP WA):\n" +
        "\n".join(f"• <code>{esc(r)}</code>" for r in top3) +
        "\n\n<blockquote>Memulai inject semua range...</blockquote>")

    all_success = True
    for range_name in top3:
        if s["stop_flag"].is_set(): break
        s["auto_range_done"].add(range_name)
        s["active_ranges"].add(range_name)
        s["range_last_msg"][range_name] = now
        log.info(f"Auto-range [{cid}]: {range_name}")
        t = threading.Thread(
            target=_auto_inject_task,
            args=(cid, s, driver, range_name, AUTO_RANGE_QTY),
            daemon=True)
        t.start()
        t.join(timeout=INJECT_TIMEOUT * math.ceil(AUTO_RANGE_QTY / NOMOR_PER_REQUEST) + 30)
        if t.is_alive():
            all_success = False
            log.warning(f"Auto-range timeout [{cid}]: {range_name}")
            break
        time.sleep(1)

    if not all_success:
        send_msg(cid,
            "<b>⚠️ AUTO RANGE INCOMPLETE</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Salah satu range gagal diselesaikan.")

def monitor_loop(cid, s):
    s["last_reload"] = s["last_api_poll"] = s["last_auto_range"] = 0.0
    err_count = 0
    driver    = s["driver"]
    with s["driver_lock"]:
        driver.get(URL_LIVE); time.sleep(1.5); s["last_reload"] = time.time()
    if s.get("auto_range_enabled", True):
        s["last_auto_range"] = time.time()
    while not s["stop_flag"].is_set():
        try:
            scrape_drv  = s.get(DRV_SMS) or driver
            scrape_lock = s["drv_lock_sms"] if s.get(DRV_SMS) else s["driver_lock"]
            with scrape_lock: baru = scrape(scrape_drv, s)
            with s["data_lock"]:
                for p in baru:
                    s["seen_ids"].add(p["uid"])
                    s["wa_harian"][p["country"]] += 1
                    ck = p.get("country_key", p["country"])
                    s["traffic_counter"][ck] += 1
                    s["range_last_msg"][ck] = time.time()
            if s.get("fwd_enabled") and s.get("fwd_group_id"):
                for p in baru:
                    if p.get("otp"):
                        threading.Thread(
                            target=forward_otp_to_group, args=(cid, s, p), daemon=True).start()
            now = time.time()
            if now - s["last_api_poll"] >= API_POLL_INTERVAL:
                s["last_api_poll"] = now
                threading.Thread(target=process_api_otps, args=(cid, s), daemon=True).start()
            if now - s["last_auto_range"] >= AUTO_RANGE_INTERVAL:
                s["last_auto_range"] = now
                threading.Thread(target=check_auto_range, args=(cid, s, driver), daemon=True).start()
            err_count = 0
        except (WebDriverException, InvalidSessionIdException):
            log.error(f"Driver mati [{cid}]"); break
        except Exception as e:
            err_count += 1
            log.warning(f"monitor error [{cid}] #{err_count}: {e}")
            if err_count >= 10: break
            time.sleep(0.5); continue
        time.sleep(POLL_INTERVAL)

def run_user_engine(cid):
    cid = str(cid)
    while True:
        s = sess_get(cid)
        if not s or s["stop_flag"].is_set(): break
        user = db_get(cid)
        if not user or user.get("banned"):
            log.info(f"Engine stop [{cid}]: banned/no user"); break
        driver = None
        try:
            log.info(f"Engine boot [{cid}]: {user.get('email','?')}")
            driver = make_driver(s)
            s["driver"] = driver
            s[DRV_HUB]  = driver
            s["is_logged_in"] = False
            logged = try_cookie_login(driver, s)
            if not logged:
                login_ok = False
                while not login_ok and not s["stop_flag"].is_set():
                    try:
                        login_ok = do_login_driver(driver, user["email"], user["password"])
                    except Exception as e:
                        log.warning(f"Login error [{cid}]: {e}")
                        time.sleep(15)
                        fresh = db_get(cid)
                        if fresh: user = fresh
                        continue
                    if not login_ok:
                        send_msg(cid,
                            "<b>❌ LOGIN GAGAL</b>\n"
                            "━━━━━━━━━━━━━━━━━━━━━\n"
                            "Email atau password tidak valid.\n"
                            "Gunakan /setup untuk memperbarui.")
                        while not s["stop_flag"].is_set():
                            time.sleep(15)
                            fresh = db_get(cid)
                            if not fresh: break
                            if fresh["email"] != user["email"] or fresh["password"] != user["password"]:
                                user = fresh
                                try:
                                    login_ok = do_login_driver(driver, user["email"], user["password"])
                                    if login_ok: break
                                except Exception: pass
                logged = login_ok
            if logged:
                save_cookies(driver, s)
                s["is_logged_in"] = True
                saved_gid = user.get("fwd_group_id")
                if saved_gid: s["fwd_group_id"] = saved_gid; s["fwd_enabled"] = True
                send_msg(cid,
                    "<b>✅ NEXUS ONLINE</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"Akun : <code>{esc(user['email'])}</code>\n"
                    f"iVAS : <b>🟢 TERHUBUNG</b>\n"
                    f"Env  : <code>{ENV.upper()}</code>\n"
                    f"Fwd  : <code>{'ON' if saved_gid else 'OFF'}</code>\n"
                    "<blockquote>▰▱▱▱▱ Inisialisasi multi-driver...</blockquote>",
                    kb_main(cid))
                s["last_dash_id"] = None
                threading.Thread(target=_init_extra_drivers, args=(s, user), daemon=True).start()
                time.sleep(3)
                monitor_loop(cid, s)
            else:
                s["is_logged_in"] = False
        except Exception as e:
            log.error(f"engine crash [{cid}]: {e}\n{traceback.format_exc()}")
        finally:
            s["is_logged_in"] = False; s["driver"] = None
            for slot in [DRV_HUB, DRV_PORTAL, DRV_SMS, DRV_NUMBERS]:
                d2 = s.get(slot)
                if d2:
                    try: d2.quit()
                    except Exception: pass
                    s[slot] = None
            if driver:
                try: driver.quit()
                except Exception: pass
        if s["stop_flag"].is_set(): break
        log.info(f"Engine restart [{cid}] in 10s")
        time.sleep(10)

def start_engine(cid):
    cid      = str(cid)
    existing = sess_get(cid)
    if existing:
        if existing.get("is_logged_in") or (existing.get("thread") and existing["thread"].is_alive()):
            return False
        sess_del(cid)
    s = sess_new(cid)
    t = threading.Thread(target=run_user_engine, args=(cid,), daemon=True)
    s["thread"] = t; t.start()
    return True

def stop_engine(cid):
    cid = str(cid)
    s   = sess_get(cid)
    if s:
        s["stop_flag"].set()
        drv = s.get("driver")
        if drv:
            try: drv.quit()
            except Exception: pass
        sess_del(cid)
        return True
    return False

_broadcast_state = {}
BOT_START = datetime.now()

def broadcast_all(text):
    users = db_all(); sent = 0
    for cid in users:
        if users[cid].get("banned"): continue
        try:
            if send_msg(cid, f"<b>BROADCAST</b>\n━━━━━━━━━━━━━━━━━━━━━\n\n{text}"): sent += 1
        except Exception: pass
        time.sleep(0.1)
    return sent

def handle_message(msg):
    cid      = str(msg["chat"]["id"])
    msg_id   = msg["message_id"]
    text     = msg.get("text", "").strip()
    from_    = msg.get("from", {})
    fname    = from_.get("first_name", "")
    lname    = from_.get("last_name", "")
    uname    = from_.get("username", "")
    fullname = (fname + " " + lname).strip() or uname or cid
    if not text: return

    st = setup_get(cid)
    if st:
        delete_msg(cid, msg_id)
        step = st["step"]
        smid = setup_msg_get(cid)
        if step == "email":
            if not re.match(r"[^@]+@[^@]+\.[^@]+", text):
                if smid:
                    edit_msg(cid, smid,
                        "<b>⚙️ SETUP AKUN iVAS</b>\n"
                        "━━━━━━━━━━━━━━━━━━━━━\n"
                        "⚠️ Format email tidak valid!\n\n"
                        "Masukkan ulang EMAIL akun iVAS:",
                        kb_setup_step("email"))
                return
            st["email"] = text; st["step"] = "password"
            setup_set(cid, st)
            if smid:
                edit_msg(cid, smid,
                    "<b>⚙️ SETUP AKUN iVAS — Langkah 1/3</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"✅ Email: <code>{esc(text)}</code>\n\n"
                    "Sekarang masukkan <b>PASSWORD</b> akun iVAS:",
                    kb_setup_step("password"))
            return
        elif step == "password":
            st["password"] = text; st["step"] = "chat_name"
            setup_set(cid, st)
            if smid:
                edit_msg(cid, smid,
                    "<b>⚙️ SETUP AKUN iVAS — Langkah 2/3</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"✅ Email   : <code>{esc(st['email'])}</code>\n"
                    "✅ Password: <code>••••••••</code>\n\n"
                    "Masukkan <b>NAMA ALIAS</b> (identitas di Hub iVAS):",
                    kb_setup_step("chat_name"))
            return
        elif step == "chat_name":
            chat_name = text.strip() or fullname
            st["chat_name"] = chat_name
            st["step"] = "confirm"
            setup_set(cid, st)
            if smid:
                edit_msg(cid, smid,
                    "<b>⚙️ SETUP AKUN iVAS — Konfirmasi</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"📧 Email   : <code>{esc(st['email'])}</code>\n"
                    "🔒 Password: <code>••••••••</code>\n"
                    f"👤 Alias   : <code>{esc(chat_name)}</code>\n\n"
                    "Tekan <b>Lanjutkan</b> untuk menyimpan dan memulai engine.",
                    kb_setup_confirm(st["email"], chat_name))
            return

    if cid == OWNER_ID and _broadcast_state.get(cid):
        del _broadcast_state[cid]
        delete_msg(cid, msg_id)
        send_msg(cid, "Broadcasting...")
        n = broadcast_all(text)
        send_msg(cid, f"Broadcast ke <b>{n}</b> user.")
        return

    parts = text.split(); cmd = parts[0].lower().split("@")[0]
    args  = " ".join(parts[1:]).strip()
    delete_msg(cid, msg_id)
    user = db_get(cid)

    if not user and cmd not in ("/start",):
        send_msg(cid,
            "<b>NEXUS</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Akun belum terdaftar.\n"
            "Ketik /start untuk mulai.")
        return

    if user and user.get("banned"):
        send_msg(cid,
            "<b>ACCESS DENIED</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Akun Anda telah di-suspend.")
        return

    NEED_ENGINE = {"/addrange", "/mynumber", "/deletenum", "/traffic", "/reset", "/cekrange"}
    s         = sess_get(cid)
    engine_ok = s and s.get("is_logged_in")

    if cmd in NEED_ENGINE and not engine_ok:
        send_msg(cid,
            "<b>ENGINE OFFLINE</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Aktifkan engine dengan /start.", kb_back())
        return

    if cmd == "/start":
        if not user:
            mid = send_msg(cid,
                "<b>🤖 NEXUS — iVAS BOT</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "🔴 Status iVAS: <b>BELUM TERHUBUNG</b>\n\n"
                "Setup akun iVAS untuk mulai monitoring.\n"
                "Tekan tombol di bawah:",
                {"inline_keyboard": [[{"text": "⚙️ Setup Credential iVAS", "callback_data": "nav:setup"}]]})
            with sessions_lock:
                if str(cid) not in sessions: sessions[str(cid)] = {"last_dash_id": mid}
                else: sessions[str(cid)]["last_dash_id"] = mid
        else:
            s_ex = sess_get(cid)
            if not s_ex or not s_ex.get("thread") or not s_ex["thread"].is_alive():
                mid = send_msg(cid,
                    "<b>🤖 NEXUS — iVAS BOT</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"📧 Akun : <code>{esc(user.get('email','?'))}</code>\n"
                    "🔄 Status iVAS: <b>SEDANG MENGHUBUNGKAN...</b>\n\n"
                    f"<blockquote>{anim_frame(0)} Inisialisasi engine...</blockquote>",
                    {"inline_keyboard": []})
                if s_ex:
                    s_ex["last_dash_id"] = mid
                else:
                    with sessions_lock:
                        if str(cid) not in sessions: sessions[str(cid)] = {"last_dash_id": mid}
                        else: sessions[str(cid)]["last_dash_id"] = mid
                start_engine(cid)
            else:
                old = s_ex.get("last_dash_id")
                if old: delete_msg(cid, old); s_ex["last_dash_id"] = None
                dashboard(cid, fmt_dashboard(cid), kb_main(cid))

    elif cmd == "/setup":
        old = setup_msg_get(cid)
        if old: delete_msg(cid, old)
        setup_set(cid, {"step": "email"})
        mid = send_msg(cid,
            "<b>⚙️ SETUP AKUN iVAS — Langkah 1/3</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Masukkan <b>EMAIL</b> akun iVAS kamu:",
            kb_setup_step("email"))
        setup_msg_set(cid, mid)

    elif cmd == "/stop":
        if stop_engine(cid):
            send_msg(cid,
                "<b>🔴 ENGINE STOPPED</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Sistem berhasil dinonaktifkan.\n"
                "Status iVAS: <b>OFFLINE</b>")
        else:
            send_msg(cid, "Engine sudah mati.")

    elif cmd in ("/menu", "/dashboard"):
        if s:
            old = s.get("last_dash_id")
            if old: delete_msg(cid, old); s["last_dash_id"] = None
        dashboard(cid, fmt_dashboard(cid), kb_main(cid))

    elif cmd in ("/bantuan", "/help"):
        dashboard(cid, BANTUAN, kb_back())

    elif cmd in ("/traffic", "/cekrange"):
        if s:
            old = s.get("last_dash_id")
            if old: delete_msg(cid, old); s["last_dash_id"] = None
        dashboard(cid, fmt_traffic(cid), kb_main(cid))

    elif cmd == "/addrange":
        if not args:
            dashboard(cid,
                "<b>FORMAT SALAH</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Format: <code>/addrange [NAMA_RANGE]</code>", kb_back())
            return
        dashboard(cid,
            "<b>➕ INJECT RANGE</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"Target: <code>{esc(args)}</code>\n\n"
            "Pilih kuota nomor:", kb_qty(args))

    elif cmd == "/mynumber":
        if s:
            dashboard(cid,
                "<b>📥 EXPORT MY NUMBERS</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Pilih range mana yang ingin diunduh:\n\n"
                "<blockquote>Semua Range = download semua nomor aktif\n"
                "Pilih Range = filter per negara/range</blockquote>",
                kb_konfirm_export())

    elif cmd == "/deletenum":
        if cid != OWNER_ID:
            send_msg(cid, "Hanya Owner yang dapat melakukan ini."); return
        if s:
            dashboard(cid,
                "<b>🗑 DANGER ZONE</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Yakin ingin hapus SEMUA nomor aktif?", kb_konfirm_del())

    elif cmd == "/reset":
        if s:
            with s["data_lock"]:
                s["wa_harian"].clear(); s["seen_ids"].clear()
                s["traffic_counter"].clear()
        dashboard(cid,
            "<b>✅ RESET SELESAI</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Counter harian di-reset ke 0.", kb_back())

    elif cmd == "/forward":
        if cid != OWNER_ID:
            send_msg(cid, "Hanya Owner yang dapat mengatur Forward."); return
        if not args:
            cur    = s.get("fwd_group_id") if s else None
            st_txt = f"🟢 Aktif ke <code>{cur}</code>" if cur and s and s.get("fwd_enabled") else "🔴 Nonaktif"
            send_msg(cid,
                "<b>📡 FORWARD OTP CONFIG</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                f"Status: {st_txt}\n\n"
                "<code>/forward -100xxxxxxxxx</code>\n"
                "<code>/forward off</code>")
        elif args.lower() == "off":
            if s: s["fwd_enabled"] = False
            db_set(cid, "fwd_group_id", None)
            send_msg(cid, "📴 Forward OTP dimatikan.")
        else:
            gid = args.strip()
            if s: s["fwd_group_id"] = gid; s["fwd_enabled"] = True
            db_update(cid, {"fwd_group_id": gid})
            send_msg(cid,
                "<b>📡 FORWARD ACTIVATED</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                f"Target: <code>{esc(gid)}</code>\n"
                "OTP WA akan di-forward otomatis.")

    elif cmd == "/autorange":
        if s:
            new_state = not s.get("auto_range_enabled", True)
            s["auto_range_enabled"] = new_state
            if new_state:
                send_msg(cid,
                    "<b>🟢 AUTO RANGE ON</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"Top-{AUTO_RANGE_TOP_N} range (≥{AUTO_RANGE_MIN_OTP} OTP WA) akan di-inject otomatis.\n"
                    f"Range idle >{AUTO_RANGE_IDLE_TTL//60} menit akan dihapus.")
            else:
                send_msg(cid, "🔴 Auto Range OFF.")
        else:
            send_msg(cid, "Engine harus aktif terlebih dahulu.")

    elif cmd == "/broadcast" and cid == OWNER_ID:
        if args:
            n = broadcast_all(args)
            send_msg(cid, f"Broadcast ke <b>{n}</b> user.")
        else:
            _broadcast_state[cid] = True
            send_msg(cid, "Ketik pesan untuk di-broadcast:")

def handle_callback(cb):
    cb_id  = cb["id"]
    data   = cb.get("data", "")
    msg    = cb["message"]
    cid    = str(msg["chat"]["id"])
    cb_mid = msg["message_id"]

    s    = sess_get(cid)
    user = db_get(cid)

    if user and user.get("banned"):
        answer_cb(cb_id, "Akun ditangguhkan"); return

    if s: s["last_dash_id"] = cb_mid

    FREE_ANON      = {"nav:setup"}
    NEED_ENGINE_CB = {"nav:mynums", "nav:deletenum", "confirm:del", "confirm:export",
                      "confirm:export:ALL", "confirm:export:SELECT"}
    engine_ok      = s and s.get("is_logged_in")

    if not user and data not in FREE_ANON:
        answer_cb(cb_id, "Ketik /start terlebih dahulu")
        edit_msg(cid, cb_mid,
            "<b>UNAUTHORIZED</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Ketik /start untuk mendaftar.", kb_back())
        return

    if data in NEED_ENGINE_CB and not engine_ok:
        answer_cb(cb_id, "Engine Offline!")
        edit_msg(cid, cb_mid,
            "<b>ENGINE OFFLINE</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Aktifkan engine dengan /start.", kb_back())
        return

    if data == "nav:setup":
        answer_cb(cb_id)
        setup_set(cid, {"step": "email"})
        setup_msg_set(cid, cb_mid)
        edit_msg(cid, cb_mid,
            "<b>⚙️ SETUP AKUN iVAS — Langkah 1/3</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Masukkan <b>EMAIL</b> akun iVAS kamu:",
            kb_setup_step("email"))

    elif data == "setup:cancel":
        answer_cb(cb_id, "Setup dibatalkan")
        setup_del(cid); setup_msg_del(cid)
        edit_msg(cid, cb_mid,
            "<b>❌ SETUP DIBATALKAN</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Ketik /setup untuk mencoba lagi.", kb_back())

    elif data == "setup:back_email":
        answer_cb(cb_id)
        st = setup_get(cid) or {}
        st["step"] = "email"; setup_set(cid, st)
        edit_msg(cid, cb_mid,
            "<b>⚙️ SETUP AKUN iVAS — Langkah 1/3</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Masukkan <b>EMAIL</b> akun iVAS kamu:",
            kb_setup_step("email"))

    elif data == "setup:back_password":
        answer_cb(cb_id)
        st = setup_get(cid) or {}
        st["step"] = "password"; setup_set(cid, st)
        edit_msg(cid, cb_mid,
            "<b>⚙️ SETUP AKUN iVAS — Langkah 2/3</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"✅ Email: <code>{esc(st.get('email','?'))}</code>\n\n"
            "Masukkan <b>PASSWORD</b> akun iVAS:",
            kb_setup_step("password"))

    elif data == "setup:back_chat_name":
        answer_cb(cb_id)
        st = setup_get(cid) or {}
        st["step"] = "chat_name"; setup_set(cid, st)
        edit_msg(cid, cb_mid,
            "<b>⚙️ SETUP AKUN iVAS — Langkah 3/3</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"✅ Email   : <code>{esc(st.get('email','?'))}</code>\n"
            "✅ Password: <code>••••••••</code>\n\n"
            "Masukkan <b>NAMA ALIAS</b>:",
            kb_setup_step("chat_name"))

    elif data == "setup:confirm":
        answer_cb(cb_id, "Menyimpan dan memulai engine...")
        st = setup_get(cid)
        if not st or not st.get("email") or not st.get("password"):
            edit_msg(cid, cb_mid,
                "<b>⚠️ DATA TIDAK LENGKAP</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Mulai ulang setup.", kb_back())
            return
        from_    = cb.get("from", {})
        fname    = from_.get("first_name", "")
        fullname = fname or str(cid)
        chat_name = st.get("chat_name", fullname)
        setup_del(cid); setup_msg_del(cid)
        db_update(cid, {
            "email":       st["email"],
            "password":    st["password"],
            "chat_name":   chat_name,
            "name":        fullname,
            "join_date":   datetime.now().strftime("%Y-%m-%d %H:%M"),
            "last_active": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "banned":      False,
        })
        edit_msg(cid, cb_mid,
            "<b>✅ SETUP SELESAI</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"📧 Email : <code>{esc(st['email'])}</code>\n"
            f"👤 Alias : <code>{esc(chat_name)}</code>\n\n"
            f"<blockquote>{anim_frame(0)} Menghubungkan ke iVAS...</blockquote>")
        stop_engine(cid); start_engine(cid)

    elif data in ("nav:status", "nav:main"):
        if s: s["_last_page"] = "dashboard"
        edit_msg(cid, cb_mid, fmt_dashboard(cid), kb_main(cid)); answer_cb(cb_id)

    elif data == "nav:traffic":
        if s: s["_last_page"] = "traffic"
        edit_msg(cid, cb_mid, fmt_traffic(cid), kb_main(cid)); answer_cb(cb_id)

    elif data == "nav:refresh":
        last_page = s.get("_last_page", "dashboard") if s else "dashboard"
        if last_page == "traffic":
            edit_msg(cid, cb_mid, fmt_traffic(cid), kb_main(cid))
        else:
            edit_msg(cid, cb_mid, fmt_dashboard(cid), kb_main(cid))
        answer_cb(cb_id, "✅ Diperbarui!")

    elif data == "nav:bantuan":
        edit_msg(cid, cb_mid, BANTUAN, kb_back()); answer_cb(cb_id)

    elif data == "nav:forward":
        if cid != OWNER_ID:
            answer_cb(cb_id, "Akses Owner"); return
        answer_cb(cb_id)
        cur    = s.get("fwd_group_id") if s else None
        st_txt = f"🟢 Aktif ke <code>{cur}</code>" if cur and s and s.get("fwd_enabled") else "🔴 Nonaktif"
        edit_msg(cid, cb_mid,
            "<b>📡 FORWARD OTP CONFIG</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"Status: {st_txt}\n\n"
            "<code>/forward [ID_GRUP]</code>\n"
            "<code>/forward off</code>", kb_back())

    elif data == "nav:autorange":
        answer_cb(cb_id)
        if s:
            new_ar = not s.get("auto_range_enabled", True)
            s["auto_range_enabled"] = new_ar
            if new_ar:
                edit_msg(cid, cb_mid,
                    "<b>🟢 AUTO RANGE ON</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    f"Top-{AUTO_RANGE_TOP_N} range (≥{AUTO_RANGE_MIN_OTP} OTP WA) akan di-inject otomatis.\n"
                    f"Range idle >{AUTO_RANGE_IDLE_TTL//60} mnt → dihapus otomatis.",
                    kb_main(cid))
            else:
                edit_msg(cid, cb_mid,
                    "<b>🔴 AUTO RANGE OFF</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n"
                    "Auto inject dimatikan.", kb_main(cid))
        else:
            edit_msg(cid, cb_mid,
                "<b>ENGINE OFFLINE</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "Aktifkan engine dahulu.", kb_back())

    elif data.startswith("copy:"):
        answer_cb(cb_id, f"Tersalin: {data.split(':', 1)[1]}")

    elif data == "nav:inject":
        edit_msg(cid, cb_mid,
            "<b>➕ INJECT MANUAL</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Ketik di chat:\n"
            "<code>/addrange [NAMA_RANGE]</code>", kb_back())
        answer_cb(cb_id)

    elif data == "nav:mynums":
        if not engine_ok: answer_cb(cb_id, "Engine Offline"); return
        answer_cb(cb_id)
        edit_msg(cid, cb_mid,
            "<b>📥 EXPORT MY NUMBERS</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Pilih range mana yang ingin diunduh:\n\n"
            "<blockquote>Semua Range = download semua nomor aktif\n"
            "Pilih Range = filter per negara/range</blockquote>",
            kb_konfirm_export())

    elif data in ("confirm:export", "confirm:export:ALL"):
        if not engine_ok: answer_cb(cb_id, "Engine Offline"); return
        answer_cb(cb_id, "Memulai ekspor semua range...")
        edit_msg(cid, cb_mid,
            "<b>📥 EXPORT NUMBERS [SEMUA]</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"<blockquote>{anim_frame(0)} Menarik data nomor...</blockquote>",
            {"inline_keyboard": []})
        threading.Thread(target=do_export, args=(cid, s, cb_mid, None), daemon=True).start()

    elif data == "confirm:export:SELECT":
        if not engine_ok: answer_cb(cb_id, "Engine Offline"); return
        answer_cb(cb_id)
        available = sorted(s.get("traffic_counter", {}).keys()) if s else []
        if not available:
            edit_msg(cid, cb_mid,
                "<b>📥 PILIH RANGE</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                "<blockquote>Belum ada data traffic range.\n"
                "Gunakan 'Semua Range' untuk download semua nomor.</blockquote>",
                kb_konfirm_export())
        else:
            edit_msg(cid, cb_mid,
                "<b>📥 PILIH RANGE EXPORT</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n"
                f"<blockquote>Tersedia {len(available)} range aktif.\n"
                "Pilih range yang ingin diunduh:</blockquote>",
                kb_export_select_range(s))

    elif data.startswith("export_range:"):
        if not engine_ok: answer_cb(cb_id, "Engine Offline"); return
        rng_filter = data.split(":", 1)[1]
        answer_cb(cb_id, f"Export {rng_filter}...")
        edit_msg(cid, cb_mid,
            f"<b>📥 EXPORT [{esc(rng_filter[:30])}]</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"<blockquote>{anim_frame(0)} Mengunduh nomor...</blockquote>",
            {"inline_keyboard": []})
        threading.Thread(target=do_export, args=(cid, s, cb_mid, rng_filter), daemon=True).start()

    elif data == "nav:deletenum":
        if cid != OWNER_ID:
            answer_cb(cb_id, "Akses Owner"); return
        answer_cb(cb_id)
        edit_msg(cid, cb_mid,
            "<b>🗑 DANGER ZONE</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Hapus SEMUA nomor aktif?", kb_konfirm_del())

    elif data == "confirm:del":
        if cid != OWNER_ID:
            answer_cb(cb_id, "Akses Owner"); return
        answer_cb(cb_id, "Mengeksekusi...")
        edit_msg(cid, cb_mid,
            "<b>🗑 PROCESSING DELETE</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"<blockquote>{anim_frame(0)} Mengirim instruksi ke portal...</blockquote>",
            {"inline_keyboard": []})
        threading.Thread(target=do_delete, args=(cid, s, cb_mid), daemon=True).start()

    elif data.startswith("inject:"):
        parts = data.split(":", 2)
        if len(parts) != 3: answer_cb(cb_id, "Invalid"); return
        _, rn, qs = parts
        try: qty = int(qs)
        except Exception: answer_cb(cb_id, "Invalid qty"); return
        if not engine_ok: answer_cb(cb_id, "Engine Offline"); return
        answer_cb(cb_id, f"Antrean: {qty} nomor...")
        edit_msg(cid, cb_mid,
            "<b>⚙️ INJECT PREP</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            f"<blockquote>{anim_frame(0)} Menyiapkan soket inject...</blockquote>",
            {"inline_keyboard": []})
        threading.Thread(target=do_inject, args=(cid, s, rn, qty, cb_mid), daemon=True).start()

    else:
        answer_cb(cb_id)

def listener():
    offset = None
    log.info("Listener started")
    while True:
        try:
            resp = _tg_sess.get(
                f"{TG_API}/getUpdates",
                params={"timeout": 30, "offset": offset,
                        "allowed_updates": ["message", "callback_query"]},
                timeout=35)
            for upd in resp.json().get("result", []):
                offset = upd["update_id"] + 1
                try:
                    if "callback_query" in upd: handle_callback(upd["callback_query"])
                    elif "message"       in upd: handle_message(upd["message"])
                except Exception as e:
                    log.error(f"handler error: {e}\n{traceback.format_exc()}")
        except KeyboardInterrupt: break
        except requests.RequestException as e:
            log.warning(f"listener network: {e}"); time.sleep(5)
        except Exception as e:
            log.error(f"listener crash: {e}"); time.sleep(2)

def main():
    log.info(f"NEXUS starting — ENV={ENV} | Python {sys.version.split()[0]}")
    chrome = find_chrome()
    if not chrome: log.warning("Chromium NOT found!")
    else: log.info(f"Chrome: {chrome}")
    driver_p = find_driver()
    if driver_p: log.info(f"Driver: {driver_p}")
    users = db_all()
    for cid, u in users.items():
        if u.get("banned"): continue
        if u.get("email") and u.get("password"):
            log.info(f"Boot node: {cid}")
            start_engine(cid); time.sleep(1)
    send_msg(OWNER_ID,
        "<b>🤖 NEXUS ONLINE</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        f"Env    : <code>{ENV.upper()}</code>\n"
        f"Python : <code>{sys.version.split()[0]}</code>\n"
        f"Chrome : <code>{'OK' if chrome else 'NOT FOUND'}</code>\n"
        f"Nodes  : <code>{len(users)}</code>",
        kb_main(OWNER_ID))
    try:
        listener()
    except KeyboardInterrupt:
        log.info("NEXUS stopped.")
        send_msg(OWNER_ID,
            "<b>🔴 NEXUS OFFLINE</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n"
            "Server dihentikan.")

if __name__ == "__main__":
    main()
