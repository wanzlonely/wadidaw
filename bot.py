"""
bot.py — telegram API, formatters, keyboards, handlers
"""
import re, os, glob, time, threading, traceback
from datetime import datetime
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import requests

from config import OWNER_ID, BOT_NAME, BOT_TOKEN, TG_API, TOP_N, URL_LIVE, URL_NUMBERS, log
from database import db_get, db_update, db_set, db_all

# ─────────────────────────────────────────────
# TELEGRAM UTILS
# ─────────────────────────────────────────────
_sess = requests.Session()
_sess.headers.update({"Content-Type": "application/json"})


def esc(t: str) -> str:
    return str(t).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def tg_post(ep: str, data: dict, timeout: int = 10):
    for i in range(3):
        try:
            r = _sess.post(f"{TG_API}/{ep}", json=data, timeout=timeout)
            if r.ok: return r.json()
            if r.status_code == 429:
                wait = r.json().get("parameters", {}).get("retry_after", 2)
                time.sleep(wait); continue
            return r.json()
        except Exception:
            if i < 2: time.sleep(0.5 * (i + 1))
    return None

def send_msg(cid, text: str, markup=None) -> int | None:
    p = {"chat_id": str(cid), "text": text,
         "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup: p["reply_markup"] = markup
    r = tg_post("sendMessage", p)
    if r and r.get("ok"): return r["result"]["message_id"]
    return None

def edit_msg(cid, mid: int, text: str, markup=None) -> bool:
    p = {"chat_id": str(cid), "message_id": mid, "text": text,
         "parse_mode": "HTML", "disable_web_page_preview": True}
    if markup is not None: p["reply_markup"] = markup
    r = tg_post("editMessageText", p)
    return r and (r.get("ok") or "not modified" in str(r).lower())

def delete_msg(cid, mid: int):
    threading.Thread(
        target=tg_post,
        args=("deleteMessage", {"chat_id": str(cid), "message_id": mid}),
        daemon=True).start()

def answer_cb(cb_id: str, text: str = ""):
    threading.Thread(
        target=tg_post,
        args=("answerCallbackQuery", {"callback_query_id": cb_id, "text": text}),
        daemon=True).start()

def send_file(cid, path: str, caption: str = "") -> bool:
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        log.error(f"send_file: invalid {path}"); return False
    cap   = caption[:1024] if caption else ""
    fname = os.path.basename(path)
    for i in range(3):
        try:
            with open(path, "rb") as fh: fdata = fh.read()
            r = requests.post(
                f"{TG_API}/sendDocument",
                data={"chat_id": str(cid), "caption": cap, "parse_mode": "HTML"},
                files={"document": (fname, fdata, "text/plain")},
                timeout=120)
            if r.ok: return True
            resp = r.json()
            if r.status_code == 429:
                time.sleep(resp.get("parameters", {}).get("retry_after", 5)); continue
            if r.status_code == 400:
                if "caption" in resp.get("description","").lower(): cap=""; continue
                return False
            break
        except Exception as e:
            log.error(f"send_file #{i+1}: {e}")
            if i < 2: time.sleep(3)
    return False

def dashboard(cid, text: str, markup=None) -> int | None:
    from core import sess_get
    s   = sess_get(cid)
    mid = s.get("last_dash_id") if s else None
    if mid and edit_msg(cid, mid, text, markup):
        return mid
    if s: s["last_dash_id"] = None
    new_mid = send_msg(cid, text, markup)
    if new_mid and s: s["last_dash_id"] = new_mid
    return new_mid

def check_group_membership(cid) -> tuple[bool, list]:
    from config import REQUIRED_GROUPS
    if not REQUIRED_GROUPS: return True, []
    missing = []
    for gid in REQUIRED_GROUPS:
        try:
            r = tg_post("getChatMember", {"chat_id": gid, "user_id": int(cid)})
            if not r or not r.get("ok"):
                missing.append(gid); continue
            if r["result"].get("status","") in ("left","kicked","restricted"):
                missing.append(gid)
        except Exception:
            missing.append(gid)
    return len(missing) == 0, missing

def broadcast_all(text: str) -> int:
    users = db_all()
    count = 0
    for ucid, u in users.items():
        if u.get("banned"): continue
        if send_msg(ucid, text): count += 1
    return count


# ─────────────────────────────────────────────
# FORMATTERS
# ─────────────────────────────────────────────
def _sep() -> str:
    return "━" * 21

def fmt_status(cid: str) -> str:
    from core import sess_get
    cid  = str(cid)
    user = db_get(cid)
    s    = sess_get(cid)

    if not user:
        return (
            f"<b>⚡ {BOT_NAME}</b>\n"
            f"{_sep()}\n"
            "⚠️ Akun belum terdaftar.\n"
            "Ketik /start untuk memulai."
        )

    engine_on = s and s.get("is_logged_in")
    eng_ic    = "🟢" if engine_on else "🔴"
    eng_tx    = "ACTIVE" if engine_on else "OFFLINE"

    uptime = "─"
    if s and s.get("start_time"):
        delta = datetime.now() - s["start_time"]
        h, rem = divmod(int(delta.total_seconds()), 3600)
        m = rem // 60
        uptime = f"{h}j {m}m"

    wa_today  = 0
    top_range = "─"
    if s:
        with s["data_lock"]:
            wa_today  = sum(s["wa_harian"].values())
            if s["traffic_counter"]:
                top_range = s["traffic_counter"].most_common(1)[0][0]

    fwd_ic  = "✅" if (s and s.get("fwd_enabled") and s.get("fwd_group_id")) else "❌"
    ar_ic   = "✅" if (s and s.get("auto_range_enabled", True)) else "❌"
    acc_st  = "🚫 SUSPENDED" if user.get("banned") else "✅ Normal"
    last_ac = user.get("last_active", "─")

    return (
        f"<b>⚡ {BOT_NAME}  —  STATUS</b>\n"
        f"{_sep()}\n\n"
        f"👤 Nama      : <code>{esc(user.get('name', cid))}</code>\n"
        f"📧 Email     : <code>{esc(user.get('email', '─'))}</code>\n"
        f"🔐 Akun      : {acc_st}\n"
        f"🕒 Terakhir  : <code>{last_ac}</code>\n\n"
        f"⚙️ Engine    : {eng_ic} <code>{eng_tx}</code>\n"
        f"⏱ Uptime    : <code>{uptime}</code>\n\n"
        f"<b>📊 STATISTIK HARI INI</b>\n"
        f"  📨 WA Masuk   : <code>{wa_today}</code>\n"
        f"  📡 Top Range  : <code>{esc(top_range)}</code>\n"
        f"  📤 Forward    : {fwd_ic}\n"
        f"  🤖 AutoRange  : {ar_ic}\n\n"
        f"<b>📋 PERINTAH:</b>\n"
        f"  /status  /traffic  /addrange\n"
        f"  /mynumber  /autorange  /reset\n"
        f"  /bantuan"
    )


def fmt_traffic(cid: str) -> str:
    from core import sess_get
    cid = str(cid)
    s   = sess_get(cid)

    if not s:
        return (
            f"<b>📈 TRAFFIC MONITOR</b>\n"
            f"{_sep()}\n\n"
            "❌ Engine offline.\n"
            "Ketik /start terlebih dahulu."
        )

    with s["data_lock"]:
        counter = dict(s["traffic_counter"])
        harian  = dict(s["wa_harian"])

    if not counter:
        return (
            f"<b>📈 TRAFFIC MONITOR</b>\n"
            f"{_sep()}\n\n"
            "📭 Belum ada data traffic.\n"
            "Monitor aktif, menunggu pesan masuk..."
        )

    top     = sorted(counter.items(), key=lambda x: x[1], reverse=True)[:TOP_N]
    total   = sum(counter.values())
    wa_tot  = sum(harian.values())

    lines = [
        f"<b>📈 TRAFFIC MONITOR</b>",
        _sep(), "",
        f"📊 Total Pesan  : <code>{total}</code>",
        f"📨 WA Hari Ini  : <code>{wa_tot}</code>",
        "",
        f"<b>📡 TOP {len(top)} RANGE</b>",
        "",
    ]

    for i, (rng, cnt) in enumerate(top, 1):
        pct    = int(cnt / total * 100) if total > 0 else 0
        filled = pct // 10
        bar    = "▓" * filled + "░" * (10 - filled)
        lines.append(
            f"<code>{i:>2}.</code> <b>{esc(rng)}</b>\n"
            f"      <code>{bar} {pct:>3}%  ({cnt}x)</code>"
        )

    lines += ["", "  /addrange [nama] [qty]  » Inject range"]
    return "\n".join(lines)


def fmt_admin_stats() -> str:
    from core import sess_all
    users    = db_all()
    sessions = sess_all()
    total    = len(users)
    banned   = sum(1 for u in users.values() if u.get("banned"))
    active   = total - banned
    online   = sum(1 for s in sessions.values() if s.get("is_logged_in"))

    return (
        f"<b>👑 ADMIN PANEL</b>\n"
        f"{_sep()}\n\n"
        f"<b>👥 USER STATISTIK</b>\n"
        f"  📊 Total User    : <code>{total}</code>\n"
        f"  ✅ Aktif          : <code>{active}</code>\n"
        f"  🚫 Suspended      : <code>{banned}</code>\n"
        f"  🟢 Online         : <code>{online}</code>\n\n"
        f"<b>📋 ADMIN COMMANDS:</b>\n"
        f"  /users  /ban  /unban  /kick\n"
        f"  /broadcast  /forward  /deletenum"
    )


def fmt_user_list() -> str:
    from core import sess_all
    users    = db_all()
    sessions = sess_all()

    if not users:
        return (
            f"<b>👥 DAFTAR USER</b>\n"
            f"{_sep()}\n\n"
            "Belum ada user terdaftar."
        )

    lines = [f"<b>👥 DAFTAR USER</b>", _sep(), ""]
    for i, (cid, u) in enumerate(users.items(), 1):
        s      = sessions.get(cid)
        online = s and s.get("is_logged_in")
        if u.get("banned"):   st_ic = "🚫"
        elif online:           st_ic = "🟢"
        else:                  st_ic = "🔴"
        name  = esc(u.get("name", cid))[:22]
        email = esc(u.get("email", "─"))[:30]
        lines.append(
            f"{i}. {st_ic} <b>{name}</b>\n"
            f"   🆔 <code>{cid}</code>\n"
            f"   📧 <code>{email}</code>"
        )
    lines += ["", f"📊 Total: <code>{len(users)}</code> user"]
    return "\n".join(lines)


def fmt_user_detail(target_cid: str) -> str:
    from core import sess_all
    target_cid = str(target_cid)
    u          = db_get(target_cid)
    s          = sess_all().get(target_cid)

    if not u:
        return f"<b>🔍 DETAIL USER</b>\n{_sep()}\n\n❌ User tidak ditemukan."

    online = s and s.get("is_logged_in")
    if u.get("banned"): st = "🚫 BANNED"
    elif online:        st = "🟢 ONLINE"
    else:               st = "🔴 OFFLINE"

    wa_today = 0
    if s:
        with s["data_lock"]: wa_today = sum(s["wa_harian"].values())

    return (
        f"<b>🔍 DETAIL USER</b>\n"
        f"{_sep()}\n\n"
        f"👤 Nama       : <code>{esc(u.get('name', target_cid))}</code>\n"
        f"🆔 Chat ID    : <code>{target_cid}</code>\n"
        f"📧 Email      : <code>{esc(u.get('email', '─'))}</code>\n"
        f"⚙️ Status     : {st}\n"
        f"📅 Join Date  : <code>{u.get('join_date', '─')}</code>\n"
        f"🕒 Last Active: <code>{u.get('last_active', '─')}</code>\n"
        f"📨 WA Hari Ini: <code>{wa_today}</code>\n\n"
        f"<b>📋 ADMIN ACTIONS:</b>\n"
        f"  /ban {target_cid}\n"
        f"  /unban {target_cid}\n"
        f"  /kick {target_cid}"
    )


BANTUAN = (
    f"<b>⚡ PANDUAN {BOT_NAME}</b>\n"
    f"{'━' * 21}\n\n"
    "🔧 <b>DASAR</b>\n"
    "  /start    » Mulai / restart engine\n"
    "  /stop     » Matikan engine\n"
    "  /status   » Dashboard status\n"
    "  /setup    » Ubah kredensial iVAS\n"
    "  /id       » Lihat Chat ID\n\n"
    "📊 <b>MONITORING</b>\n"
    "  /traffic  » Statistik traffic range\n"
    "  /reset    » Reset counter harian\n\n"
    "💉 <b>INJECT</b>\n"
    "  /addrange [nama] [qty]\n"
    "  /autorange   » Toggle auto inject\n\n"
    "📱 <b>NOMOR</b>\n"
    "  /mynumber » Export nomor aktif\n\n"
    "📡 <b>FORWARD OTP</b>\n"
    "  /forward [id]  » Aktifkan ke grup\n"
    "  /forward off   » Matikan forward\n\n"
    f"{'━' * 21}\n"
    "💡 <i>Engine restart otomatis jika crash.</i>"
)


# ─────────────────────────────────────────────
# HANDLERS
# ─────────────────────────────────────────────
_setup_state: dict = {}
_setup_msg:   dict = {}
_setup_lock        = threading.Lock()
_broadcast_state   = {}

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


def _clean_nomor(val):
    if val is None: return None
    s = str(val).strip()
    if "." in s:
        try: s = str(int(float(s)))
        except Exception: s = s.split(".")[0]
    if s and s not in ("None","nan","") and s.lstrip("+-").isdigit() and len(s) >= 6:
        return s.lstrip("+")
    return None

def _parse_xlsx(xl_path):
    import openpyxl
    wb  = openpyxl.load_workbook(xl_path, read_only=True, data_only=True)
    ws  = wb.active; rows = list(ws.iter_rows(values_only=True)); wb.close()
    if not rows: return []
    header  = [str(c).strip().lower() if c is not None else "" for c in rows[0]]
    num_col = next((i for i,h in enumerate(header) if any(x in h for x in
                    ["number","nomor","phone","msisdn","num","tel","hp","mobile"])), None)
    if num_col is None:
        for row in rows[1:8]:
            for idx, val in enumerate(row):
                if _clean_nomor(val): num_col = idx; break
            if num_col is not None: break
    if num_col is None: num_col = 0
    return [n for row in rows[1:]
            for n in [_clean_nomor(row[num_col] if len(row) > num_col else None)] if n]

def _scrape_nums_from_table(driver):
    all_nums = []
    while True:
        rows = driver.execute_script(
            "var o=[];document.querySelectorAll('table tbody tr').forEach(function(tr){"
            "var td=tr.querySelectorAll('td');if(!td.length)return;"
            "var r=[];for(var i=0;i<td.length;i++)r.push(td[i].innerText.trim());o.push(r);});"
            "return o;") or []
        found = 0
        for cols in rows:
            if not cols or (len(cols)==1 and ("no data" in cols[0].lower() or "processing" in cols[0].lower())):
                continue
            for v in cols:
                sv = v.strip().split(".")[0]
                if sv.lstrip("+-").isdigit() and len(sv) >= 6:
                    all_nums.append(sv.lstrip("+")); found += 1; break
        if not found: break
        try:
            nxt = driver.find_element(By.CSS_SELECTOR,
                "a.paginate_button.next:not(.disabled),li.next:not(.disabled) a")
            if nxt.is_displayed():
                driver.execute_script("arguments[0].click();", nxt); time.sleep(1)
            else: break
        except Exception: break
    return all_nums


def do_export(cid: str, s: dict, mid: int):
    s["busy"].set()
    driver = s["driver"]
    xl = None; txt_path = None
    try:
        edit_msg(cid, mid,
            "<b>📥 EXPORT NUMBERS</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            "⏳ Navigasi ke portal numbers...")
        with s["driver_lock"]:
            try:
                driver.execute_cdp_cmd("Page.setDownloadBehavior",
                    {"behavior":"allow","downloadPath":s["download_dir"]})
            except Exception: pass
            driver.get(URL_NUMBERS); time.sleep(2.5)
            for f in glob.glob(os.path.join(s["download_dir"],"*.xlsx")) + \
                     glob.glob(os.path.join(s["download_dir"],"*.xls")):
                try: os.remove(f)
                except Exception: pass
            try:
                show_sel = WebDriverWait(driver, 5).until(EC.presence_of_element_located(
                    (By.CSS_SELECTOR,"select[name*='DataTables_Table'],select[name*='length']")))
                driver.execute_script(
                    "var s=arguments[0],best=null;for(var i=0;i<s.options.length;i++){"
                    "var v=parseInt(s.options[i].value);if(!isNaN(v)&&v<0){best=s.options[i].value;break;}"
                    "if(!isNaN(v)&&(best===null||v>parseInt(best)))best=s.options[i].value;}"
                    "if(best){s.value=best;s.dispatchEvent(new Event('change',{bubbles:true}));}", show_sel)
                time.sleep(1.5)
            except Exception: pass
            btn_export = None
            for by, sel in [
                (By.XPATH, "//a[contains(translate(normalize-space(text()),'ABCDEFGHIJKLMNOPQRSTUVWXYZ',"
                           "'abcdefghijklmnopqrstuvwxyz'),'export number excel')]"),
                (By.XPATH, "//button[contains(translate(normalize-space(text()),'ABCDEFGHIJKLMNOPQRSTUVWXYZ',"
                           "'abcdefghijklmnopqrstuvwxyz'),'export number excel')]"),
                (By.XPATH, "//a[contains(@href,'export')]"),
            ]:
                try:
                    for el in driver.find_elements(by, sel):
                        t = (el.text or el.get_attribute("innerText") or "").lower()
                        if "export" in t or "excel" in t: btn_export = el; break
                    if btn_export: break
                except Exception: pass
            if btn_export:
                edit_msg(cid, mid,
                    "<b>📥 EXPORT NUMBERS</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n\n"
                    "⏳ Mengunduh file Excel...")
                driver.execute_script("arguments[0].scrollIntoView(true);", btn_export); time.sleep(0.4)
                driver.execute_script("arguments[0].click();", btn_export)
                dead = time.time() + 45
                while time.time() < dead:
                    time.sleep(0.6)
                    fs = [f for f in glob.glob(os.path.join(s["download_dir"],"*.xlsx")) +
                          glob.glob(os.path.join(s["download_dir"],"*.xls"))
                          if not f.endswith((".crdownload",".part",".tmp"))]
                    if fs:
                        xl = max(fs, key=os.path.getmtime)
                        if os.path.getsize(xl) > 0: break
                        else: xl = None
            numbers = []
            if xl:
                try: numbers = _parse_xlsx(xl)
                except Exception as e: log.warning(f"parse xlsx: {e}")
            if not numbers:
                edit_msg(cid, mid,
                    "<b>📥 EXPORT NUMBERS</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n\n"
                    "⏳ Scrape manual dari tabel web...")
                numbers = _scrape_nums_from_table(driver)
            try: driver.get(URL_LIVE); s["last_reload"] = time.time()
            except Exception: pass
        if not numbers:
            edit_msg(cid, mid,
                "<b>⚠️ DATA KOSONG</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Tidak ada nomor aktif di portal.\n"
                "Ketik /status untuk kembali."); return
        unique   = list(dict.fromkeys(numbers))
        ts       = datetime.now().strftime("%Y%m%d_%H%M%S")
        txt_path = os.path.join(s["download_dir"], f"NEXUS_NUMS_{ts}.txt")
        with open(txt_path, "w") as f: f.write("\n".join(unique))
        edit_msg(cid, mid,
            "<b>📥 EXPORT NUMBERS</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"📊 Total: <code>{len(unique)}</code> nomor\n"
            "⏳ Mengirim file ke Telegram...")
        cap = (
            "<b>📥 MY ACTIVE NUMBERS</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"📊 Total  : <code>{len(unique)} Nomor</code>\n"
            f"🗂 Method : <code>{'Excel' if xl else 'Table Scrape'}</code>\n"
            f"📅 Date   : <code>{datetime.now().strftime('%d %b %Y %H:%M')}</code>"
        )
        if send_file(cid, txt_path, cap):
            edit_msg(cid, mid,
                "<b>✅ EXPORT BERHASIL</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "File nomor aktif telah dikirim ke chat.\n"
                "Ketik /status untuk kembali.")
        else:
            edit_msg(cid, mid,
                "<b>❌ GAGAL MENGIRIM</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Gagal mengirim file ke Telegram.")
    except Exception as ex:
        log.error(f"do_export [{cid}]: {ex}\n{traceback.format_exc()}")
        edit_msg(cid, mid,
            "<b>💥 CRITICAL ERROR</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"<blockquote>{esc(str(ex)[:300])}</blockquote>")
    finally:
        for p in [xl, txt_path]:
            if p:
                try: os.remove(p)
                except Exception: pass
        s["busy"].clear()


def do_delete(cid: str, s: dict, mid: int):
    s["busy"].set(); driver = s["driver"]
    try:
        edit_msg(cid, mid,
            "<b>🗑 DELETE ALL NUMBERS</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            "⏳ Navigating to panel...")
        with s["driver_lock"]:
            driver.get(URL_NUMBERS); time.sleep(2.5)
            try:
                btn = WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.XPATH,
                    "//button[contains(normalize-space(text()),'Bulk return all numbers')]"
                    "|//a[contains(normalize-space(text()),'Bulk return all numbers')]")))
                driver.execute_script("arguments[0].click();", btn); time.sleep(1.5)
            except Exception as e:
                edit_msg(cid, mid,
                    "<b>❌ ERROR</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n\n"
                    f"<blockquote>{esc(str(e))}</blockquote>"); return
            try: driver.switch_to.alert.accept(); time.sleep(1.5)
            except Exception: pass
            for sel in ["button.confirm","button.swal-button--confirm",
                        ".modal-footer button.btn-danger",
                        "//button[contains(text(),'Yes')]","//button[contains(text(),'OK')]"]:
                try:
                    el = (driver.find_element(By.XPATH, sel) if sel.startswith("//")
                          else driver.find_element(By.CSS_SELECTOR, sel))
                    if el.is_displayed():
                        driver.execute_script("arguments[0].click();", el); time.sleep(2); break
                except Exception: pass
            ok = False; dead = time.time() + 20
            while time.time() < dead:
                time.sleep(0.8)
                try:
                    pt = driver.execute_script("return document.body.innerText.toLowerCase();")
                    if any(x in pt for x in ["no data","no entries","showing 0","success","returned"]):
                        ok = True; break
                except Exception: pass
            try: driver.get(URL_LIVE); s["last_reload"] = time.time()
            except Exception: pass
        if ok:
            edit_msg(cid, mid,
                "<b>✅ DELETE SELESAI</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Semua nomor berhasil dihapus dari panel.")
        else:
            edit_msg(cid, mid,
                "<b>⚠️ STATUS UNKNOWN</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Perintah dieksekusi, silakan cek portal.")
    except Exception as ex:
        log.error(f"do_delete [{cid}]: {ex}")
        edit_msg(cid, mid,
            "<b>💥 CRITICAL ERROR</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"<blockquote>{esc(str(ex))}</blockquote>")
    finally:
        s["busy"].clear()


def handle_message(msg: dict):
    from core import sess_get, start_engine, stop_engine, do_inject, check_auto_range

    cid      = str(msg["chat"]["id"])
    msg_id   = msg["message_id"]
    text     = msg.get("text","").strip()
    from_    = msg.get("from",{})
    fname    = from_.get("first_name","")
    lname    = from_.get("last_name","")
    uname    = from_.get("username","")
    fullname = (fname+" "+lname).strip() or uname or cid
    if not text: return

    st = setup_get(cid)
    if st:
        delete_msg(cid, msg_id)
        step = st["step"]; smid = setup_msg_get(cid)
        if step == "email":
            if not re.match(r"[^@]+@[^@]+\.[^@]+", text):
                if smid: edit_msg(cid, smid,
                    "<b>⚙️ SETUP AKUN iVAS</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n\n"
                    "❌ Format email tidak valid!\n\n"
                    "📧 Masukkan ulang <b>EMAIL</b> yang benar:")
                return
            st["email"] = text; st["step"] = "password"; setup_set(cid, st)
            if smid: edit_msg(cid, smid,
                "<b>⚙️ SETUP AKUN iVAS</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"✅ Email: <code>{esc(text)}</code>\n\n"
                "🔑 Masukkan <b>PASSWORD</b> akun iVAS kamu:")
            return
        elif step == "password":
            st["password"] = text; st["step"] = "chat_name"; setup_set(cid, st)
            if smid: edit_msg(cid, smid,
                "<b>⚙️ SETUP AKUN iVAS</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"✅ Email    : <code>{esc(st['email'])}</code>\n"
                "✅ Password : <code>••••••••</code>\n\n"
                "💬 Masukkan <b>NAMA ALIAS</b> untuk Chat Hub iVAS:")
            return
        elif step == "chat_name":
            chat_name = text.strip() or fullname
            setup_del(cid); setup_msg_del(cid)
            db_update(cid, {
                "email":       st["email"],
                "password":    st["password"],
                "chat_name":   chat_name,
                "name":        fullname,
                "status":      "active",
                "join_date":   datetime.now().strftime("%Y-%m-%d %H:%M"),
                "last_active": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "banned":      False,
            })
            if smid: edit_msg(cid, smid,
                "<b>✅ SETUP SELESAI</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"📧 Email : <code>{esc(st['email'])}</code>\n"
                f"👤 Alias : <code>{esc(chat_name)}</code>\n\n"
                "⏳ Memulai engine otomatis...")
            stop_engine(cid); start_engine(cid)
            return

    if cid == OWNER_ID and _broadcast_state.get(cid):
        del _broadcast_state[cid]
        delete_msg(cid, msg_id)
        send_msg(cid, "📢 <code>Broadcasting...</code>")
        n = broadcast_all(f"📢 <b>SYSTEM BROADCAST</b>\n━━━━━━━━━━━━━━━━━━━━━\n\n{text}")
        send_msg(cid, f"✅ Broadcast terkirim ke <b>{n}</b> user.")
        return

    parts = text.split(); cmd = parts[0].lower().split("@")[0]; args = " ".join(parts[1:]).strip()
    delete_msg(cid, msg_id)
    user = db_get(cid)
    s    = sess_get(cid)

    if not user and cmd not in ("/start",):
        send_msg(cid,
            f"<b>⚡ {BOT_NAME}</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            "Akun belum terdaftar.\nKetik /start untuk memulai.")
        return
    if user and user.get("banned"):
        send_msg(cid,
            "<b>🚫 ACCESS DENIED</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            "Akun di-suspend oleh Administrator.")
        return

    engine_ok = s and s.get("is_logged_in")
    NEED_ENG  = {"/addrange","/mynumber","/deletenum","/traffic","/reset"}
    if cmd in NEED_ENG and not engine_ok:
        send_msg(cid,
            "<b>🔒 ENGINE OFFLINE</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            "Fungsi ini membutuhkan engine aktif.\nGunakan /start untuk menyalakan.")
        return

    if cmd == "/start":
        ok_grp, missing = check_group_membership(cid)
        if not ok_grp:
            links = "\n".join(f"{i+1}. <code>{g}</code>" for i,g in enumerate(missing))
            send_msg(cid,
                "<b>⚠️ AUTHORIZATION REQUIRED</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"Join grup berikut dahulu:\n\n{links}\n\n"
                "Ketik /start setelah bergabung.")
            return
        if not user:
            mid = send_msg(cid,
                f"<b>⚡ WELCOME TO {BOT_NAME}</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Sistem monitoring & automasi iVAS SMS.\n\n"
                "Ketik /setup untuk mendaftarkan akun iVAS kamu.")
            if mid:
                from core import sess_new
                if not s:
                    s_new = sess_new(cid)
                    s_new["last_dash_id"] = mid
                else:
                    s["last_dash_id"] = mid
        else:
            if not s or not s.get("thread") or not s["thread"].is_alive():
                start_engine(cid)
            else:
                old_mid = s.get("last_dash_id")
                if old_mid: delete_msg(cid, old_mid); s["last_dash_id"] = None
                dashboard(cid, fmt_status(cid))

    elif cmd == "/setup":
        old = setup_msg_get(cid)
        if old: delete_msg(cid, old)
        setup_set(cid, {"step":"email"})
        new_mid = send_msg(cid,
            "<b>⚙️ SETUP AKUN iVAS</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            "📧 Masukkan <b>EMAIL</b> akun iVAS kamu:")
        setup_msg_set(cid, new_mid)

    elif cmd == "/stop":
        if stop_engine(cid):
            send_msg(cid,
                "<b>🛑 ENGINE STOPPED</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Sistem berhasil dinonaktifkan.\nKetik /start untuk menyalakan kembali.")
        else:
            send_msg(cid,
                "<b>⚠️ INFO</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Engine tidak aktif / sudah mati.")

    elif cmd in ("/status","/menu"):
        if s:
            old = s.get("last_dash_id")
            if old: delete_msg(cid, old); s["last_dash_id"] = None
        dashboard(cid, fmt_status(cid))

    elif cmd in ("/bantuan","/help"):
        dashboard(cid, BANTUAN)

    elif cmd in ("/traffic","/cekrange"):
        if s:
            old = s.get("last_dash_id")
            if old: delete_msg(cid, old); s["last_dash_id"] = None
        dashboard(cid, fmt_traffic(cid))

    elif cmd == "/addrange":
        if not args:
            send_msg(cid,
                "<b>⚠️ FORMAT SALAH</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Format:\n"
                "  <code>/addrange [NAMA_RANGE]</code>\n"
                "  <code>/addrange [NAMA_RANGE] [QTY]</code>\n\n"
                "Contoh:\n"
                "  <code>/addrange TOGO 443</code>\n"
                "  <code>/addrange TOGO 443 200</code>")
            return
        if s and s["busy"].is_set():
            send_msg(cid,
                "<b>⏳ ENGINE BUSY</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Engine sedang mengerjakan tugas lain.\nCoba lagi sebentar.")
            return
        arg_parts = args.rsplit(None, 1)
        if len(arg_parts) == 2 and arg_parts[1].isdigit():
            range_name = arg_parts[0]
            qty        = max(10, min(int(arg_parts[1]), 9999))
        else:
            range_name = args
            qty        = 100
        mid = dashboard(cid,
            "<b>⚡ INJECTION PREP</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"🎯 Range  : <code>{esc(range_name)}</code>\n"
            f"📦 Target : <code>{qty} Nomor</code>\n\n"
            "⏳ Menyiapkan koneksi...")
        if mid: threading.Thread(target=do_inject, args=(cid, s, range_name, qty, mid), daemon=True).start()

    elif cmd == "/mynumber":
        if s and not s["busy"].is_set():
            mid = dashboard(cid,
                "<b>📥 EXPORT NUMBERS</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "⏳ Inisiasi ekstraksi nomor aktif...")
            if mid: threading.Thread(target=do_export, args=(cid, s, mid), daemon=True).start()

    elif cmd == "/deletenum":
        if cid != OWNER_ID:
            send_msg(cid, "❌ Perintah ini hanya untuk Admin."); return
        if s and not s["busy"].is_set():
            send_msg(cid,
                "<b>⚠️ DANGER ZONE</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "🔴 Yakin ingin hapus <b>SEMUA</b> nomor aktif?\n\n"
                "Kirim /confirmdelete untuk konfirmasi.")

    elif cmd == "/confirmdelete":
        if cid != OWNER_ID:
            send_msg(cid, "❌ Perintah ini hanya untuk Admin."); return
        if s and not s["busy"].is_set():
            mid = dashboard(cid,
                "<b>🗑 PROCESSING DELETE</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "⏳ Mengirim instruksi ke portal...")
            if mid: threading.Thread(target=do_delete, args=(cid, s, mid), daemon=True).start()

    elif cmd == "/reset":
        if s:
            with s["data_lock"]:
                s["wa_harian"].clear(); s["seen_ids"].clear()
        send_msg(cid,
            "<b>♻️ METRICS RESET</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            "✅ Counter harian berhasil di-reset ke 0.")

    elif cmd == "/forward":
        if cid != OWNER_ID: send_msg(cid, "❌ Admin only."); return
        if not args:
            cur    = s.get("fwd_group_id") if s else None
            st_txt = f"✅ Aktif → <code>{cur}</code>" if cur and s and s.get("fwd_enabled") else "❌ Mati"
            send_msg(cid,
                "<b>📡 FORWARD CONFIG</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"Status: {st_txt}\n\n"
                "Format:\n"
                "  <code>/forward -1001234567890</code>\n"
                "  <code>/forward off</code>")
        elif args.lower() == "off":
            if s: s["fwd_enabled"] = False
            db_set(cid, "fwd_group_id", None)
            send_msg(cid,
                "<b>📴 FORWARD OFF</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "✅ Forward OTP berhasil dimatikan.")
        else:
            gid = args.strip()
            if s: s["fwd_group_id"] = gid; s["fwd_enabled"] = True
            db_update(cid, {"fwd_group_id": gid})
            send_msg(cid,
                "<b>📡 FORWARD ACTIVATED</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"🆔 Target: <code>{esc(gid)}</code>\n"
                "✅ OTP akan diteruskan ke grup ini.")

    elif cmd == "/autorange":
        if s:
            new_state = not s.get("auto_range_enabled", True)
            s["auto_range_enabled"] = new_state
            if new_state:
                send_msg(cid,
                    "<b>🤖 AUTO RANGE ON</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n\n"
                    "✅ Mode Auto Inject dihidupkan.\n"
                    "⏳ Memindai traffic secara berkala...")
                threading.Thread(target=check_auto_range,
                    args=(cid, s, s.get("driver")), daemon=True).start()
            else:
                send_msg(cid,
                    "<b>⏸ AUTO RANGE OFF</b>\n"
                    "━━━━━━━━━━━━━━━━━━━━━\n\n"
                    "❌ Mode Auto Inject dimatikan.")
        else:
            send_msg(cid,
                "<b>⚠️ ENGINE OFFLINE</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Engine harus menyala terlebih dahulu.\nKetik /start.")

    elif cmd == "/id":
        send_msg(cid,
            "<b>🆔 CHAT ID INFO</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"ID kamu: <code>{cid}</code>")

    elif cmd == "/admin" and cid == OWNER_ID:
        send_msg(cid, fmt_admin_stats())
    elif cmd == "/users" and cid == OWNER_ID:
        send_msg(cid, fmt_user_list())
    elif cmd == "/ban" and cid == OWNER_ID:
        if args and db_get(args):
            db_set(args,"banned",True); stop_engine(args)
            send_msg(cid,
                "<b>🚫 USER SUSPENDED</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"User <code>{args}</code> berhasil di-ban.")
            send_msg(args,
                "<b>🚫 AKUN SUSPENDED</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Akun kamu telah ditangguhkan oleh Admin.")
        else: send_msg(cid, "❌ UID tidak dikenali.")
    elif cmd == "/unban" and cid == OWNER_ID:
        if args and db_get(args):
            db_set(args,"banned",False)
            send_msg(cid,
                "<b>✅ USER DIPULIHKAN</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"User <code>{args}</code> berhasil di-unban.")
            send_msg(args,
                "<b>✅ AKUN DIPULIHKAN</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Akun kamu telah dipulihkan.\nKetik /start untuk melanjutkan.")
        else: send_msg(cid, "❌ UID tidak dikenali.")
    elif cmd == "/kick" and cid == OWNER_ID:
        if stop_engine(args):
            send_msg(cid,
                "<b>⛔ ENGINE TERMINATED</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                f"Engine user <code>{args}</code> dihentikan.")
        else: send_msg(cid, "❌ Tidak ada sesi aktif / UID invalid.")
    elif cmd == "/broadcast" and cid == OWNER_ID:
        if args:
            n = broadcast_all(f"📢 <b>SYSTEM BROADCAST</b>\n━━━━━━━━━━━━━━━━━━━━━\n\n{args}")
            send_msg(cid, f"✅ Broadcast terkirim ke <b>{n}</b> user.")
        else:
            _broadcast_state[cid] = True
            send_msg(cid,
                "<b>📢 MODE BROADCAST</b>\n"
                "━━━━━━━━━━━━━━━━━━━━━\n\n"
                "Ketik pesan yang akan di-blast ke semua user:")


def handle_callback(cb: dict):
    from core import sess_get, start_engine, stop_engine, do_inject

    cb_id  = cb["id"]
    data   = cb.get("data","")
    msg    = cb["message"]
    cid    = str(msg["chat"]["id"])
    cb_mid = msg["message_id"]
    s      = sess_get(cid)
    user   = db_get(cid)

    if user and user.get("banned"):
        answer_cb(cb_id, "🚫 Akun ditangguhkan"); return
    if s: s["last_dash_id"] = cb_mid

    if data.startswith("inject:"):
        parts = data.split(":",2)
        if len(parts) != 3: answer_cb(cb_id,"❌ Invalid"); return
        _, rn, qs = parts
        try: qty = int(qs)
        except Exception: answer_cb(cb_id,"❌ Malformed QTY"); return
        if not (s and s.get("is_logged_in")):
            answer_cb(cb_id, "🔒 Engine Offline"); return
        if s and s["busy"].is_set(): answer_cb(cb_id,"⏳ Engine sibuk"); return
        answer_cb(cb_id, f"✅ Inject {qty} nomor dimulai...")
        edit_msg(cid, cb_mid,
            "<b>⚡ INJECTION PREP</b>\n"
            "━━━━━━━━━━━━━━━━━━━━━\n\n"
            f"🎯 Range  : <code>{esc(rn)}</code>\n"
            f"📦 Target : <code>{qty} Nomor</code>\n\n"
            "⏳ Menyiapkan koneksi web...")
        threading.Thread(target=do_inject, args=(cid, s, rn, qty, cb_mid), daemon=True).start()
    elif data.startswith("admin:ban:") and cid == OWNER_ID:
        target = data.split(":",2)[2]
        db_set(target,"banned",True); stop_engine(target)
        answer_cb(cb_id, f"UID {target} Banned.")
        send_msg(target, "<b>🚫 AKUN SUSPENDED</b>\n━━━━━━━━━━━━━━━━━━━━━\n\nAkun kamu telah ditangguhkan.")
        edit_msg(cid, cb_mid, fmt_user_detail(target))
    elif data.startswith("admin:unban:") and cid == OWNER_ID:
        target = data.split(":",2)[2]
        db_set(target,"banned",False)
        answer_cb(cb_id, f"UID {target} Restored.")
        send_msg(target, "<b>✅ AKUN DIPULIHKAN</b>\n━━━━━━━━━━━━━━━━━━━━━\n\nKetik /start untuk melanjutkan.")
        edit_msg(cid, cb_mid, fmt_user_detail(target))
    elif data.startswith("admin:kick:") and cid == OWNER_ID:
        target = data.split(":",2)[2]
        ok = stop_engine(target)
        answer_cb(cb_id, "Terminated" if ok else "No Session")
        edit_msg(cid, cb_mid, fmt_user_detail(target))
    elif data.startswith("copy:"):
        answer_cb(cb_id, f"📋 Tersalin: {data.split(':',1)[1]}")
    else:
        answer_cb(cb_id)
