# ⚡ NEXUS — iVAS SMS Monitor Bot

Bot Telegram otomatis untuk monitoring, injeksi nomor, dan forward OTP dari portal **iVAS SMS** via browser headless (Chromium). Dirancang ringan dan stabil untuk berjalan di **Termux**, VPS, maupun Docker.

---

## 📁 Struktur File

```
NEXUS/
├── main.py          # Entry point — boot & listener Telegram
├── config.py        # Semua konfigurasi (token, URL, interval)
├── core.py          # Session, browser, scraper, injector, engine
├── bot.py           # Telegram API, formatter pesan, handler command
├── database.py      # Penyimpanan user (JSON, flush otomatis)
└── requirements.txt # Dependensi Python
```

---

## ⚙️ Fitur Utama

| Fitur | Keterangan |
|-------|-----------|
| 🖥 Browser Headless | Chromium via Selenium, tanpa tampilan grafis |
| 🔐 Auto Login | Login otomatis + simpan cookie sesi |
| 📡 Monitor Live | Scrape pesan WA masuk secara real-time |
| 💉 Inject Range | Tambah nomor ke range tertentu via Hub |
| 🤖 Auto Inject | Injeksi otomatis berdasarkan traffic tertinggi |
| 📤 Forward OTP | Teruskan kode OTP ke grup Telegram |
| 📥 Export Nomor | Download daftar nomor aktif ke file `.txt` |
| 👑 Admin Panel | Kelola multi-user (ban, kick, broadcast) |
| ♻️ Auto Restart | Engine restart sendiri jika crash |

---

## 🚀 Cara Install & Run di Termux

### 1. Install Termux dari F-Droid
> ⚠️ Jangan gunakan Termux dari Play Store — sudah tidak diupdate.
> Download di: https://f-droid.org/packages/com.termux/

---

### 2. Update & Install Paket Dasar

```bash
pkg update && pkg upgrade -y
pkg install -y python git chromium
```

> Proses ini memakan waktu beberapa menit tergantung koneksi.

---

### 3. Clone / Salin File Bot

Jika pakai git:
```bash
git clone https://github.com/username/nexus-bot.git
cd nexus-bot
```

Atau salin folder `NEXUS/` secara manual ke Termux, lalu:
```bash
cd ~/NEXUS
```

---

### 4. Install Dependensi Python

```bash
pip install -r requirements.txt
```

Isi `requirements.txt`:
```
selenium==4.18.1
requests==2.31.0
openpyxl==3.1.2
webdriver-manager==4.0.1
```

> `webdriver-manager` akan otomatis mencocokkan versi ChromeDriver dengan Chromium yang terinstall — tidak perlu install manual.

---

### 5. Konfigurasi Bot

Edit file `config.py`:

```python
OWNER_ID  = "ISI_CHAT_ID_KAMU"
BOT_TOKEN = "ISI_TOKEN_BOT_TELEGRAM"
BOT_NAME  = "NEXUS"           # Nama bebas
```

Untuk mendapatkan **Chat ID** kamu:
- Kirim pesan ke [@userinfobot](https://t.me/userinfobot) di Telegram

Untuk mendapatkan **Bot Token**:
- Buat bot baru via [@BotFather](https://t.me/BotFather) → `/newbot`

---

### 6. Jalankan Bot

```bash
python main.py
```

Jika berhasil, kamu akan melihat log seperti:
```
[10:00:00] INFO Env: termux | Python 3.11.x | aarch64
[10:00:00] INFO DB loaded: 0 users
[10:00:00] INFO Chrome OK: /data/data/com.termux/files/usr/bin/chromium
[10:00:00] INFO Listener started (long-poll)
```

Dan bot akan mengirim pesan ke Telegram kamu:
```
⚡ NEXUS ONLINE
━━━━━━━━━━━━━━━━━━━━━
🟢 State   : ACTIVE
🖥 Env     : TERMUX
...
```

---

### 7. Jalankan di Background (agar tidak mati saat Termux ditutup)

**Menggunakan `nohup`:**
```bash
nohup python main.py > nexus.log 2>&1 &
```

Cek log:
```bash
tail -f nexus.log
```

Hentikan bot:
```bash
pkill -f main.py
```

---

**Menggunakan `screen` (lebih nyaman):**
```bash
pkg install screen
screen -S nexus
python main.py
# Tekan Ctrl+A lalu D untuk detach (bot tetap jalan)
```

Kembali ke sesi:
```bash
screen -r nexus
```

---

## 📋 Daftar Command Bot

### 👤 User
| Command | Fungsi |
|---------|--------|
| `/start` | Mulai / restart engine |
| `/stop` | Matikan engine |
| `/status` | Lihat dashboard status |
| `/setup` | Daftarkan / ubah akun iVAS |
| `/traffic` | Statistik traffic per range |
| `/addrange [nama] [qty]` | Inject nomor ke range |
| `/autorange` | Toggle auto inject on/off |
| `/mynumber` | Export daftar nomor aktif |
| `/reset` | Reset counter harian |
| `/id` | Lihat Chat ID kamu |
| `/bantuan` | Panduan lengkap |

### 👑 Admin (Owner Only)
| Command | Fungsi |
|---------|--------|
| `/admin` | Panel statistik semua user |
| `/users` | Daftar semua user terdaftar |
| `/ban [id]` | Suspend user |
| `/unban [id]` | Pulihkan user |
| `/kick [id]` | Stop engine user tertentu |
| `/broadcast [pesan]` | Kirim pesan ke semua user |
| `/forward [group_id]` | Aktifkan forward OTP ke grup |
| `/forward off` | Matikan forward OTP |
| `/deletenum` | Hapus semua nomor aktif |

---

## 🔧 Konfigurasi Lanjutan (`config.py`)

```python
# Interval monitoring
POLL_INTERVAL       = 0.10    # detik antar scrape
RELOAD_INTERVAL     = 4       # detik reload halaman
API_POLL_INTERVAL   = 6       # detik poll API SMS

# Inject
NOMOR_PER_REQUEST   = 50      # nomor per 1x request inject
INJECT_DELAY        = 0.4     # jeda antar request inject
MAX_FAIL            = 3       # max gagal berturut-turut

# Auto Inject
AUTO_RANGE_INTERVAL = 7200    # interval auto inject (detik) = 2 jam
AUTO_RANGE_IDLE_TTL = 1800    # range dihapus jika idle (detik) = 30 menit
AUTO_RANGE_QTY      = 100     # jumlah nomor per auto inject

# Grup wajib (opsional)
REQUIRED_GROUPS     = []      # isi jika user harus join grup dulu
                               # contoh: ["-1001234567890"]
```

---

## ❗ Troubleshooting

### Chrome tidak ditemukan
```
Chrome/Chromium tidak ditemukan.
```
**Solusi:**
```bash
pkg install chromium
```
Pastikan Chromium sudah terinstall dengan:
```bash
which chromium-browser
```

---

### ChromeDriver version mismatch
```
session not created: Chrome instance exited...
```
**Solusi:** Script sudah include `webdriver-manager` sebagai fallback. Pastikan sudah install:
```bash
pip install webdriver-manager
```
Jika masih error, cek versi Chromium:
```bash
chromium-browser --version
```
Lalu install chromedriver yang cocok secara manual jika diperlukan.

---

### Memori tidak cukup di Termux
Bot menggunakan flag `--js-flags=--max-old-space-size=256` secara otomatis di Termux untuk membatasi penggunaan RAM. Jika masih crash, coba tutup aplikasi lain yang berjalan di background.

---

### Bot tidak merespons perintah
1. Pastikan `BOT_TOKEN` di `config.py` benar
2. Pastikan tidak ada bot lain dengan token yang sama yang sedang berjalan
3. Cek log: `tail -f nexus.log`

---

## 📦 Dependensi

| Library | Versi | Fungsi |
|---------|-------|--------|
| selenium | 4.18.1 | Kontrol browser Chromium |
| requests | 2.31.0 | HTTP client (Telegram API & SMS API) |
| openpyxl | 3.1.2 | Parse file Excel untuk export nomor |
| webdriver-manager | 4.0.1 | Auto-install ChromeDriver yang cocok |

---

## 📄 Lisensi

Script ini dibuat untuk keperluan pribadi. Gunakan dengan bijak dan sesuai ketentuan layanan iVAS SMS.
