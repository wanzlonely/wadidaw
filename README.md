# WALZPAY

Dashboard **notifikasi QRIS → webhook → Redis → UI** + **auto-match order pending → success**.

**Deploy:** [Vercel](https://vercel.com) · **Data:** [Upstash Redis](https://upstash.com) · **Listener HP:** folder `android-listener/`

Repo: https://github.com/wanzlonely/wadidaw

---

## Aplikasi (Android + iOS)

| Platform | Cara |
|----------|------|
| **Android** | Build APK dari folder `android-listener/` (versi **3.1.0**). WebView + native listener. |
| **iOS** | Buka situs di Safari → Share → **Add to Home Screen** (PWA). Native iOS akan menyusul. |

### Android 3.1.0 — yang baru
- **Offline page** lokal: tidak lagi muncul "Halaman web tidak tersedia" + domain Vercel saat data mati.
- Keamanan diperkuat (cleartext off, network security config, minify release, WebView hardening).
- `targetSdk 35` (siap Android 15 / menuju 16).
- Detail: lihat `android-listener/CHANGELOG-3.1.0.md`.

---

## Fitur siap pakai

### Web (Next.js)
- **Multi-tenant auth** — daftar / login, session 14 hari, User ID format `WLZPY#######`
- **Captcha matematika** + konfirmasi password saat registrasi
- **A2F OTP email** (Gmail SMTP) saat login & daftar
- **Profil** — nama, password, toggle A2F, logout
- **Setel** — API key, webhook secret, fee acak anti-collision, upload QRIS statis
- **Pesanan** — nominal → QRIS dinamis + countdown + batal
- **Riwayat** — filter, cari, export CSV
- **Dashboard** — live pembayaran, toast bubble tengah, suara
- **Payment link** publik `/pay/[token]`
- Security headers (CSP, HSTS, X-Frame-Options, dll.)

### Android Listener (`android-listener/`)
- **Pilih aplikasi** sumber notifikasi (DANA, GoPay, OVO, Shopee, WA, bank, + app terpasang)
- **Akses notifikasi** (Notification Listener Service)
- **Tanpa bat incatan baterai** (Request ignore battery optimizations)
- **Mulai otomatis** setelah boot (`BootReceiver` + KeepAlive foreground service)
- **Webhook URL + secret** tersimpan di HP
- **Log lokal** di aplikasi
- Exact alarm / wake lock untuk OEM agresif
- Offline-aware WebView

---

## Alur QRIS dinamis

```
1. Buat order pending          POST /api/orders  { amount: 50000 }
   → server alokasi admin fee acak (anti-collision)
   → totalAmount = base + fee · token payment link
2. Bagikan link /pay/{token} ke pelanggan
3. Pelanggan transfer / scan QRIS dengan nominal PERSIS totalAmount
4. HP menerima notifikasi e-wallet
5. android-listener → POST /api/webhook
6. Server parse + dedup + match totalAmount → order success
7. Dashboard live (poll + toast bubble) / payment page auto-update
```

Website **tidak** membaca notifikasi. Deteksi terjadi di app Android.

---

## Setup Vercel (web)

1. Import repo **wanzlonely/wadidaw** di Vercel (root = folder ini)
2. Env wajib:
   ```
   UPSTASH_REDIS_REST_URL=...
   UPSTASH_REDIS_REST_TOKEN=...
   ```
3. Env opsional:
   ```
   WEBHOOK_SECRET=rahasia-anda
   GMAIL_USER=...
   GMAIL_APP_PASSWORD=...
   ```
4. Deploy → cek `/api/health` dan `/login`

Lokal: salin `.env.example` → `.env.local` lalu `npm i && npm run dev`.

---

## Setup Android Listener

Folder **`android-listener/`** — buka di **Android Studio** (bukan root Next.js).

1. `File → Open` → `android-listener`
2. Gradle sync → `Build → Build APK(s)` (atau Generate Signed APK)
3. Install APK ke HP kasir
4. Di app:
   - **Izinkan akses notifikasi**
   - **Tanpa batasan baterai**
   - **Pilih aplikasi** sumber notifikasi
   - Isi **Webhook URL** = `https://YOUR-PROJECT.vercel.app/api/webhook`
   - Secret = nilai `WEBHOOK_SECRET` (jika di-set)
   - Toggle **Aktifkan Listener** → **Simpan**
5. OEM Xiaomi / OPPO / Vivo: nyalakan **Autostart** untuk app ini

Detail: [`android-listener/README.md`](android-listener/README.md) · Changelog 3.1.0: [`android-listener/CHANGELOG-3.1.0.md`](android-listener/CHANGELOG-3.1.0.md)

---

## Stack

- Next.js 14 · React 18 · TypeScript
- Upstash Redis
- Android Kotlin (NotificationListenerService + WebView)
- Vercel hosting
