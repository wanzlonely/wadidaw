import re, os, time, threading
import requests

from engine import (
    BOT_NAME, TG_API, OWNER_ID,
    send, edit, delete_msg, answer,
    get_account, save_account, is_online, get_drv,
    start_engine, stop_engine,
    do_inject_hub, do_bulk_return,
    get_groups, add_group, remove_group,
    init_hub, hub_info,
    MAX_GROUPS, _get_us,
    kb, div, esc, fmt, flag, log,
)

_tg = requests.Session()
_tg.headers.update({"Content-Type": "application/json"})

_state    = {}
_state_lk = threading.Lock()

def state_get(cid):
    with _state_lk: return _state.get(str(cid))

def state_set(cid, v):
    with _state_lk: _state[str(cid)] = v

def state_del(cid):
    with _state_lk: _state.pop(str(cid), None)

def kb_back(to="m:home"):
    return kb([[(f"◀ Kembali", to)]])

# ── halaman ───────────────────────────────────────────────────────────────────

def page_home():
    acc    = get_account()
    online = is_online()
    em     = acc.get("email","─")
    has_acc = bool(acc.get("email") and acc.get("password"))
    if not has_acc:
        txt = (
            f"<b>{BOT_NAME}</b>\n{div()}\n\n"
            f"  ⚠️ <b>Akun belum diatur!</b>\n\n"
            f"  Set akun iVAS terlebih dahulu:\n"
            f"  <code>/login email password</code>"
        )
        return txt, kb([[(\"⚙️ Set Akun Login\", \"m:login\")]])
    status = "🟢 Online" if online else "🔴 Offline"
    txt = (
        f"<b>{BOT_NAME}</b>\n{div()}\n\n"
        f"  📧 <code>{esc(em)}</code>\n\n"
        f"{div('STATUS')}\n"
        f"  ⚡ Engine  {status}\n\n"
        f"{div()}\n"
        f"  <i>Pilih menu di bawah ↓</i>"
    )
    eng = [("■ Stop Engine","engine:stop")] if online else [("▶ Start Engine","engine:start")]
    return txt, kb([
        [("📤 Add Range","m:addrange"), ("🗑 Hapus Nomor","m:hapus")],
        [("📢 Grup Forward","m:grup")],
        eng + [("⚙️ Login","m:login")],
    ])

def page_addrange():
    txt = (
        f"<b>📤 ADD RANGE</b>\n{div()}\n\n"
        f"  Tambahkan nomor ke range tertentu\n"
        f"  melalui Hub OrangeCarrier.\n\n"
        f"{div('CONTOH RANGE')}\n"
        f"  <code>NIGERIA 14603</code>\n"
        f"  <code>NEPAL 4930</code>\n"
        f"  <code>CAMBODIA 4326</code>"
    )
    return txt, kb([
        [("✏️ Ketik Range","addrange:input")],
        [("◀ Kembali","m:home")],
    ])

def page_hapus():
    txt = (
        f"<b>🗑 HAPUS SEMUA NOMOR</b>\n{div()}\n\n"
        f"  Bot akan klik tombol:\n"
        f"  <b>「 Bulk return all numbers 」</b>\n\n"
        f"  ⚠️ Semua nomor aktif akan dikembalikan.\n"
        f"  <b>Tidak bisa dibatalkan!</b>"
    )
    return txt, kb([
        [("🗑 Hapus Sekarang","confirm:hapus")],
        [("◀ Kembali","m:home")],
    ])

def page_login():
    acc    = get_account()
    em     = acc.get("email","─")
    pw     = acc.get("password","")
    masked = (pw[0]+"●"*(len(pw)-1)) if pw else "─"
    txt = (
        f"<b>⚙️ LOGIN AKUN iVAS</b>\n{div()}\n\n"
        f"  📧 Email  <code>{esc(em)}</code>\n"
        f"  🔑 Pass   <code>{masked}</code>\n\n"
        f"  Ganti: <code>/login email password</code>"
    )
    return txt, kb([
        [("✏️ Ganti Akun","login:input")],
        [("◀ Kembali","m:home")],
    ])

def page_grup():
    groups = get_groups()
    lines  = [
        "<b>📢 GRUP FORWARD SMS</b>",
        div(), "",
        "  SMS baru otomatis dikirim ke semua grup ini.", "",
        div(f"GRUP TERDAFTAR ({len(groups)}/{MAX_GROUPS})"),
    ]
    btn_rows = []
    if not groups:
        lines.append("  <i>Belum ada grup. Kirim /addgrup di grup target.</i>")
    else:
        for i, g in enumerate(groups, 1):
            gid   = g["id"]
            title = esc(g.get("title", gid))
            link  = g.get("invite_link","")
            lines.append(f"  {i}. <b>{title}</b>  <code>{gid}</code>")
            if link and not link.endswith("_KAMU"):
                lines.append(f"  🔗 <code>{link}</code>")
            btn_rows.append([(f"🗑 Hapus: {title[:16]}", f"delgrup:{gid}")])
    lines += ["", "  <i>Kirim /addgrup dari dalam grup untuk mendaftar</i>"]
    btn_rows.append([("ℹ️ Cara Daftar","grup:howto")])
    btn_rows.append([("◄ Kembali","m:home")])
    return "\n".join(lines), kb(btn_rows)

def page_confirm(title, desc, yes_cb, back_cb="m:home", yes_label="✅  Ya, Lanjutkan", back_label="❌  Batal"):
    txt = (
        f"<b>{title}</b>\n{div()}\n\n"
        f"{desc}\n\n"
        f"{div()}\n"
        f"  <i>Lanjutkan?</i>"
    )
    return txt, kb([[(yes_label, yes_cb)], [(back_label, back_cb)]])

# ── handlers ──────────────────────────────────────────────────────────────────

def handle_message(msg):
    cid       = str(msg["chat"]["id"])
    mid       = msg["message_id"]
    text      = msg.get("text","").strip()
    chat_type = msg.get("chat",{}).get("type","private")
    from_id   = str(msg.get("from",{}).get("id",""))
    if not text: return

    is_owner = (from_id == str(OWNER_ID))
    is_group = chat_type in ("group","supergroup")
    cmd_bare = text.split()[0].lower().split("@")[0] if text.split() else ""

    if not is_owner:
        if is_group and cmd_bare == "/addgrup": pass
        else: return

    def _del_if_private():
        if chat_type == "private": delete_msg(cid, mid)

    st = state_get(cid) if chat_type == "private" else None
    if st:
        step = st.get("step")
        smid = st.get("mid")
        _del_if_private()

        if step == "addrange_name":
            rng = text.strip()
            state_del(cid)
            if smid:
                edit(cid, smid,
                    f"<b>📤 ADD RANGE</b>\n{div()}\n\n"
                    f"  Range   <code>{esc(rng)}</code>\n\n"
                    f"{div('PILIH JUMLAH')}",
                    kb([
                        [(" 100 ",f"inj:{rng}:100"), (" 200 ",f"inj:{rng}:200")],
                        [(" 300 ",f"inj:{rng}:300"), (" 400 ",f"inj:{rng}:400")],
                        [(" 500 ",f"inj:{rng}:500"), ("✏️ Custom",f"inj_custom:{rng}")],
                        [("◀ Kembali","m:addrange")],
                    ]))
            return

        if step == "inject_custom":
            rng = st.get("range","")
            state_del(cid)
            try: qty = max(10, min(int(text.strip()), 9999))
            except:
                if smid: edit(cid, smid, f"<b>❌ Input tidak valid</b>\n\n  Masukkan angka (10–9999)", kb_back("m:addrange"))
                return
            if smid:
                txt, markup = page_confirm(
                    "📤 INJECT RANGE",
                    f"  {flag(rng)} <b>{esc(rng)}</b>\n  Jumlah  : <b>{qty}</b> nomor",
                    yes_cb=f"inj_go:{rng}:{qty}",
                    back_cb="m:addrange",
                )
                edit(cid, smid, txt, markup)
            return

        if step == "login_input":
            state_del(cid)
            parts = text.strip().split(None, 1)
            if len(parts) < 2:
                if smid: edit(cid, smid, f"<b>❌ Format salah!</b>\n\n  Kirim: <code>email password</code>", kb_back("m:login"))
                return
            em_in, pw_in = parts[0].lower(), parts[1]
            if not re.match(r"[^@]+@[^@]+\.[^@]+", em_in):
                if smid: edit(cid, smid, f"<b>❌ Email tidak valid!</b>", kb_back("m:login"))
                return
            save_account(em_in, pw_in)
            _saved_account_msg(cid, smid, em_in, pw_in)
            return

    parts = text.split()
    if not parts: return
    cmd  = parts[0].lower().split("@")[0]
    args = " ".join(parts[1:]).strip()

    if is_group and cmd != "/addgrup": return
    _del_if_private()

    if cmd == "/start":
        txt, markup = page_home()
        send(cid, txt, markup)

    elif cmd in ("/login","/setlogin"):
        if not args:
            send(cid, f"<b>⚙️ SET AKUN iVAS</b>\n{div()}\n\n  <code>/login email password</code>")
            return
        p = args.split(None, 1)
        if len(p) < 2:
            send(cid, f"<b>❌ Format salah!</b>\n\n  <code>/login email password</code>")
            return
        save_account(p[0].lower(), p[1])
        _saved_account_msg(cid, None, p[0].lower(), p[1])

    elif cmd == "/stop":
        stop_engine()
        time.sleep(0.3)
        txt, markup = page_home()
        send(cid, txt, markup)

    elif cmd == "/id":
        send(cid, f"<b>🪪 CHAT ID</b>\n{div()}\n\n  <code>{cid}</code>")

    elif cmd == "/addgrup":
        chat      = msg.get("chat",{})
        chat_type = chat.get("type","private")
        title     = chat.get("title") or chat.get("first_name") or cid
        if chat_type == "private":
            send(cid,
                f"<b>⚠️ Kirim perintah ini dari dalam Grup!</b>\n{div()}\n\n"
                f"  1. Tambahkan bot ke grup kamu\n"
                f"  2. Kirim <code>/addgrup</code> di dalam grup tsb\n\n"
                f"  Chat ID kamu: <code>{cid}</code>")
            return
        result = add_group(cid, title)
        if result == "ok":
            send(cid,
                f"<b>✅ GRUP BERHASIL DITAMBAHKAN!</b>\n{div()}\n\n"
                f"  📢 <b>{esc(title)}</b>\n"
                f"  🆔 <code>{cid}</code>\n\n"
                f"  SMS baru akan langsung di-forward ke sini.")
            send(str(OWNER_ID),
                f"<b>📢 Grup baru didaftarkan!</b>\n{div()}\n\n"
                f"  <b>{esc(title)}</b>\n  <code>{cid}</code>")
        elif result == "exists":
            send(cid, f"<b>ℹ️ Grup ini sudah terdaftar.</b>\n  <code>{cid}</code>")
        elif result == "full":
            send(cid, f"<b>❌ Sudah {MAX_GROUPS} grup!</b>\n\n  Hapus dulu lewat menu 📢 Grup Forward.")

    elif cmd == "/delgrup":
        if not args:
            send(cid, f"Format: <code>/delgrup CHAT_ID</code>")
            return
        ok = remove_group(args.strip())
        send(cid, "<b>✅ Dihapus.</b>" if ok else f"<b>❌ Tidak ditemukan: <code>{args.strip()}</code></b>")

    else:
        txt, markup = page_home()
        send(cid, txt, markup)

def _saved_account_msg(cid, smid, em_in, pw_in):
    local  = em_in.split("@")[0]; domain = em_in.split("@")[1] if "@" in em_in else ""
    me     = (local[0]+"***"+local[-1] if len(local)>2 else local[0]+"***")+f"@{domain}"
    mp     = pw_in[0]+"●"*(len(pw_in)-1) if pw_in else "●●●"
    txt    = (
        f"<b>✅ AKUN TERSIMPAN!</b>\n{div()}\n\n"
        f"  📧 Email  <code>{me}</code>\n"
        f"  🔑 Pass   <code>{mp}</code>\n\n"
        f"  Tekan ▶ Start Engine untuk mulai:"
    )
    markup = kb([[("▶ Start Engine","engine:start")],[("◀ Kembali","m:home")]])
    if smid: edit(cid, smid, txt, markup)
    else:    send(cid, txt, markup)

def handle_callback(cb):
    cb_id   = cb["id"]
    data    = cb.get("data","")
    msg     = cb["message"]
    cid     = str(msg["chat"]["id"])
    mid     = msg["message_id"]
    from_id = str(cb.get("from",{}).get("id",""))

    if from_id != str(OWNER_ID):
        answer(cb_id, "⛔ Hanya owner yang bisa menggunakan bot ini.", alert=True)
        return

    answer(cb_id)
    online = is_online()

    if data == "m:home":
        txt, markup = page_home()
        edit(cid, mid, txt, markup)

    elif data == "m:grup":
        txt, markup = page_grup()
        edit(cid, mid, txt, markup)

    elif data == "grup:howto":
        edit(cid, mid,
            f"<b>ℹ️ CARA DAFTARKAN GRUP</b>\n{div()}\n\n"
            f"  1️⃣ Tambahkan bot ke grup Telegram kamu\n"
            f"  2️⃣ Buka grup tersebut\n"
            f"  3️⃣ Ketik <code>/addgrup</code> di dalam grup\n"
            f"  4️⃣ Bot langsung terdaftar ✅\n\n"
            f"  Maksimal <b>{MAX_GROUPS} grup</b>.",
            kb([[("◄ Kembali","m:grup")]]))

    elif data.startswith("delgrup:"):
        gid = data.split(":",1)[1]
        ok  = remove_group(gid)
        answer(cb_id, "✅ Grup dihapus" if ok else "❌ Tidak ditemukan", alert=not ok)
        txt, markup = page_grup()
        edit(cid, mid, txt, markup)

    elif data.startswith("ch:"):
        try:
            parts  = data[3:].split("|",3)
            gid    = parts[0]; phone = parts[1] if len(parts)>1 else ""
            otp    = parts[2] if len(parts)>2 else ""; rng = parts[3] if len(parts)>3 else ""
            from engine import _mask_phone
            masked = _mask_phone(phone, with_cc=True)
            fl     = flag(rng)
            fwd    = f"<b>WS</b> | <code>{masked}</code> | {fl}"
            if otp: fwd += f"\n\n<b><code>{otp}</code></b>"
            r = _tg.post(f"{TG_API}/sendMessage", json={"chat_id":gid,"text":fwd,"parse_mode":"HTML"}, timeout=10)
            if r and r.json().get("ok"):
                answer(cb_id, "✅ OTP dikirim ke channel!")
            else:
                err = r.json().get("description","") if r else "timeout"
                answer(cb_id, f"❌ Gagal: {err[:40]}", alert=True)
        except Exception as ex:
            answer(cb_id, f"❌ Error: {str(ex)[:40]}", alert=True)

    elif data == "m:addrange":
        if not online:
            answer(cb_id, "⚠️ Engine offline — start dulu!", alert=True); return
        txt, markup = page_addrange()
        edit(cid, mid, txt, markup)

    elif data == "m:hapus":
        if not online:
            answer(cb_id, "⚠️ Engine offline — start dulu!", alert=True); return
        txt, markup = page_hapus()
        edit(cid, mid, txt, markup)

    elif data == "m:login":
        txt, markup = page_login()
        edit(cid, mid, txt, markup)

    elif data == "engine:start":
        if online:
            answer(cb_id, "Engine sudah aktif!"); return
        acc = get_account()
        if not acc.get("email") or not acc.get("password"):
            edit(cid, mid,
                f"<b>⚠️ AKUN BELUM DIATUR</b>\n{div()}\n\n"
                f"  <code>/login email password</code>",
                kb([[("✏️ Set Akun","login:input")],[("◀ Kembali","m:home")]])); return
        txt, markup = page_confirm(
            "▶ START ENGINE",
            f"  📧 <code>{esc(acc.get('email',''))}</code>\n\n"
            f"  Bot akan login ke iVAS\n  dan mulai auto-forward SMS.",
            yes_cb="engine:start:go", back_cb="m:home",
        )
        edit(cid, mid, txt, markup)

    elif data == "engine:start:go":
        if online:
            answer(cb_id, "Engine sudah aktif!"); return
        acc = get_account()
        edit(cid, mid,
            f"<b>{BOT_NAME}</b>\n{div()}\n\n"
            f"  📧 <code>{esc(acc.get('email',''))}</code>\n\n"
            f"{div('MENGHUBUNGKAN')}\n"
            f"  ◌ Browser    menunggu\n"
            f"  ◌ Login iVAS menunggu\n"
            f"  ◌ Hub Socket menunggu")
        start_engine(cid, msg_id=mid)

    elif data == "engine:stop":
        txt, markup = page_confirm(
            "■ STOP ENGINE",
            f"  Engine akan dihentikan.\n  Auto-forward akan berhenti.",
            yes_cb="engine:stop:go", back_cb="m:home",
            yes_label="■  Ya, Stop Engine",
        )
        edit(cid, mid, txt, markup)

    elif data == "engine:stop:go":
        stop_engine()
        time.sleep(0.3)
        txt, markup = page_home()
        edit(cid, mid, txt, markup)

    elif data == "addrange:input":
        edit(cid, mid,
            f"<b>📤 ADD RANGE</b>\n{div()}\n\n"
            f"  Ketik nama range:\n\n"
            f"  <code>NIGERIA 14603</code>",
            kb_back("m:addrange"))
        state_set(cid, {"step":"addrange_name","mid":mid})

    elif data.startswith("inj:"):
        parts = data.split(":",2)
        if len(parts)<3: return
        rng, qty = parts[1], parts[2]
        if not online:
            answer(cb_id,"Engine offline!",alert=True); return
        txt, markup = page_confirm(
            "📤 INJECT RANGE",
            f"  {flag(rng)} <b>{esc(rng)}</b>\n  Jumlah  : <b>{qty}</b> nomor",
            yes_cb=f"inj_go:{rng}:{qty}", back_cb=f"inj_direct:{rng}",
        )
        edit(cid, mid, txt, markup)

    elif data.startswith("inj_go:"):
        parts = data.split(":",2)
        if len(parts)<3: return
        rng, qty = parts[1], int(parts[2])
        if not online:
            answer(cb_id,"Engine offline!",alert=True); return
        threading.Thread(target=_do_inject, args=(cid,mid,rng,qty), daemon=True).start()

    elif data.startswith("inj_custom:"):
        rng = data.split(":",1)[1]
        edit(cid, mid,
            f"<b>📤 ADD RANGE</b>\n{div()}\n\n"
            f"  Range  <code>{esc(rng)}</code>\n\n"
            f"  Ketik jumlah nomor (10–9999):",
            kb_back("m:addrange"))
        state_set(cid, {"step":"inject_custom","range":rng,"mid":mid})

    elif data.startswith("inj_direct:"):
        full_range = data.split(":",1)[1]
        if not online:
            answer(cb_id,"Engine offline!",alert=True); return
        edit(cid, mid,
            f"<b>📤 ADD RANGE</b>\n{div()}\n\n"
            f"  {flag(full_range)} <code>{esc(full_range)}</code>\n\n"
            f"{div('PILIH JUMLAH')}",
            kb([
                [(" 100 ",f"inj:{full_range}:100"),(" 200 ",f"inj:{full_range}:200")],
                [(" 300 ",f"inj:{full_range}:300"),(" 400 ",f"inj:{full_range}:400")],
                [(" 500 ",f"inj:{full_range}:500"),("✏️ Custom",f"inj_custom:{full_range}")],
                [("◀ Kembali","m:addrange")],
            ]))

    elif data.startswith("confirm:hapus") or data == "confirm:hapus":
        us = _get_us()
        if us.get("busy") and us["busy"].is_set():
            answer(cb_id,"Engine sedang sibuk!",alert=True); return
        edit(cid, mid,
            f"<b>🗑 HAPUS NOMOR</b>\n{div()}\n\n"
            f"  ⟳ Mencari tombol Bulk return all numbers...", None)
        threading.Thread(target=_do_hapus, args=(cid,mid), daemon=True).start()

    elif data == "login:input":
        edit(cid, mid,
            f"<b>⚙️ GANTI AKUN</b>\n{div()}\n\n  Kirim: <code>email password</code>",
            kb_back("m:login"))
        state_set(cid, {"step":"login_input","mid":mid})

# ── tasks ─────────────────────────────────────────────────────────────────────

def _do_inject(cid, mid, rng, qty):
    us   = _get_us()
    busy = us.get("busy")
    if busy: busy.set()
    try:
        drv = get_drv()
        if not drv:
            edit(cid, mid,
                f"<b>❌ ENGINE OFFLINE</b>\n{div()}\n\n  Start engine terlebih dahulu.",
                kb([[("▶ Start Engine","engine:start")],[("◀ Kembali","m:addrange")]])); return
        edit(cid, mid,
            f"<b>📤 ADD RANGE</b>\n{div()}\n\n"
            f"  Range   <code>{esc(rng)}</code>\n"
            f"  Target  {fmt(qty)} nomor\n\n"
            f"  ⟳ Menghubungi Hub...", kb_back("m:addrange"))
        acc  = get_account()
        em   = acc.get("email","")
        drv.get("https://hub.orangecarrier.com?system=ivas")
        time.sleep(1)
        info = hub_info(drv)
        if not info.get("email"): init_hub(drv, em)

        def on_progress(pct, ok, fail, done):
            edit(cid, mid,
                f"<b>📤 ADD RANGE</b>\n{div()}\n\n"
                f"  Range   <code>{esc(rng)}</code>\n"
                f"  Target  {fmt(qty)} nomor\n\n"
                f"{div('PROGRESS')}\n"
                f"  {pct}% — ✅ {ok} req  ❌ {fail} req\n"
                f"  ~{fmt(done)} nomor ditambahkan",
                kb_back("m:addrange"))

        ok, fail, done = do_inject_hub(drv, rng, qty, on_progress, em)
        status = "✅ SELESAI" if fail==0 else ("⚠️ SEBAGIAN" if ok>0 else "❌ GAGAL")
        edit(cid, mid,
            f"<b>📤 INJECT {status}</b>\n{div()}\n\n"
            f"  Range      <code>{esc(rng)}</code>\n"
            f"  Target     {fmt(qty)} nomor\n\n"
            f"{div('HASIL')}\n"
            f"  ✅ Berhasil  {ok} req  (~{fmt(done)} nomor)\n"
            f"  ❌ Gagal     {fail} req",
            kb([[("📤 Inject Lagi","m:addrange")],[("◀ Kembali","m:home")]]))
    except Exception as e:
        log.error(f"_do_inject: {e}")
        edit(cid, mid, f"<b>❌ INJECT ERROR</b>\n{div()}\n\n  <code>{esc(str(e)[:300])}</code>", kb_back("m:addrange"))
    finally:
        if busy: busy.clear()

def _do_hapus(cid, mid):
    us   = _get_us()
    busy = us.get("busy")
    if busy: busy.set()
    try:
        drv = get_drv()
        if not drv:
            edit(cid, mid, f"<b>❌ ENGINE OFFLINE</b>", kb_back()); return
        ok = do_bulk_return(drv)
        if ok:
            edit(cid, mid,
                f"<b>✅ HAPUS BERHASIL</b>\n{div()}\n\n"
                f"  Semua nomor berhasil dikembalikan ke sistem.",
                kb([[("◀ Kembali","m:home")]]))
        else:
            edit(cid, mid,
                f"<b>⚠️ PROSES TERKIRIM</b>\n{div()}\n\n"
                f"  Perintah hapus sudah dikirim.\n"
                f"  Cek halaman My Numbers untuk verifikasi.",
                kb([[("◀ Kembali","m:home")]]))
    except Exception as e:
        log.error(f"_do_hapus: {e}")
        edit(cid, mid, f"<b>❌ HAPUS ERROR</b>\n{div()}\n\n  <code>{esc(str(e)[:300])}</code>", kb_back())
    finally:
        if busy: busy.clear()
