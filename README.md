# WALZPAY

Dashboard **notifikasi QRIS → webhook → Redis → UI** + **auto-match order pending → success**.

**Deploy:** [Vercel](https://vercel.com) · **Data:** [Upstash Redis](https://upstash.com) · **Listener HP:** folder `android-listener/`

Repo: https://github.com/wanzlonely/wadidaw

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

### Android Listener (`android-listener/`)
- **Pilih aplikasi** sumber notifikasi (DANA, GoPay, OVO, Shopee, WA, bank, + app terpasang)
- **Akses notifikasi** (Notification Listener Service)
- **Tanpa batasan baterai** (Request ignore battery optimizations)
- **Mulai otomatis** setelah boot (`BootReceiver` + KeepAlive foreground service)
- **Webhook URL + secret** tersimpan di HP
- **Log lokal** di aplikasi
- Exact alarm / wake lock untuk OEM agresif

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
   GMAIL_USER=stockwanz582@gmail.com
   GMAIL_APP_PASSWORD=vjhexxfklmpzognr
   ```
4. Deploy → cek `/api/health` dan `/login`

Lokal: salin `.env.example` → `.env.local` lalu `npm i && npm run dev`.

---

## Setup Android Listener

Folder **`android-listener/`** — buka di **Android Studio** (bukan root Next.js).

1. `File → Open` → `android-listener`
2. Gradle sync → `Build → Build APK(s)`
3. Install APK ke HP kasir
4. Di app:
   - **Izinkan akses notifikasi**
   - **Tanpa batasan baterai**
   - **Pilih aplikasi** sumber notifikasi
   - Isi **Webhook URL** = `https://YOUR-PROJECT.vercel.app/api/webhook`
   - Secret = nilai `WEBHOOK_SECRET` (jika di-set)
   - Toggle **Aktifkan Listener** → **Simpan**
5. OEM Xiaomi / OPPO / Vivo: nyalakan **Autostart** untuk app ini
6. Opsional: [Service Keeper](https://github.com/sklndev/Service-Keeper) pantau `com.walzpay.listener`

Detail: [`android-listener/README.md`](android-listener/README.md)

---

## Halaman

| Path | Fungsi |
|------|--------|
| `/login` | Masuk / daftar + captcha + OTP email |
| `/` | Dashboard live |
| `/pesanan` | Buat QRIS dinamis |
| `/riwayat` | Riwayat + export |
| `/profil` | Akun, password, A2F |
| `/pengaturan` | API key, webhook, fee, QRIS upload |
| `/pay/[token]` | Link bayar pelanggan (publik) |

---

## API ringkas

| Endpoint | Fungsi |
|----------|--------|
| `POST /api/auth` | register / login / verify_otp / logout / update_profile |
| `POST /api/webhook` | Terima notifikasi dari APK |
| `POST /api/orders` | Buat order dinamis |
| `GET /api/orders` | List order (per user) |
| `DELETE /api/orders?id=` | Batalkan pending |
| `GET /api/orders/by-token?token=` | Order publik |
| `GET /api/payments` | List pembayaran |
| `GET /api/settings` | Settings user |
| `GET /api/health` | Cek Redis |

---

## Stack

- Next.js 14 · React 18 · TypeScript
- Upstash Redis
- Android Kotlin (NotificationListenerService)
- Vercel hosting
