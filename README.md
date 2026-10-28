# WALZPAY

Dashboard produksi **notifikasi QRIS → webhook → Upstash Redis → UI**.  
Brand liquid glass · deploy **Vercel** · data **persisten** di Redis.

---

## Cara kerja sungguhan (bukan demo memory)

```
[App di HP: QRIS Hook]
   mendeteksi notifikasi DANA/GoPay/…
        │  POST JSON  (cepat)
        ▼
[POST /api/webhook]  ← parse akurat (amount + merchant)
        │
        ▼
[Upstash Redis]  ← simpan payment + log
        │
        ├── dashboard polling 2–4 dtk
        └── opsional forward ke URL lain
```

**Penting:** Website tidak bisa membaca notifikasi Android. Deteksi “uang masuk” terjadi di **app listener HP**. WALZPAY menyimpan, memvalidasi, menampilkan, dan meneruskan secara **real** lewat Redis.

Akurasi deteksi = kualitas parser di HP **+** parser server (`lib/parse-payment.ts`).

---

## Setup Upstash (wajib)

1. Buka [console.upstash.com](https://console.upstash.com) → **Create Database** (Redis)
2. Tab **REST API** → salin:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Di **Vercel** → Project → Settings → Environment Variables → paste keduanya
4. Redeploy
5. Cek: `https://DOMAIN/api/health` → harus `{ "ok": true, "redis": true }`

Opsional:

```
WEBHOOK_SECRET=rahasia-anda
```

Jika di-set, app HP harus kirim header `x-walzpay-secret`.

Lokal: salin `.env.example` → `.env.local`.

---

## Hubungkan HP (QRIS Hook)

1. Install [QRIS Hook](https://github.com/suriyadi15/qrishook)
2. Aktifkan akses notifikasi + pilih merchant (DANA: `id.dana`)
3. Webhook URL:

```
https://PROJECT.vercel.app/api/webhook
```

4. Transaksi QRIS uji → muncul di **Beranda / Riwayat** dalam hitungan detik

Payload yang diterima fleksibel: `amount` numerik **atau** teks `Rp10.000` di `rawText` / `title`.

---

## Fitur produksi

- Simpan payment & log di **Upstash Redis** (tahan serverless)
- Parse nominal IDR (titik ribuan, koma desimal)
- Map package → merchant (`id.dana` → dana, dll.)
- Filter notifikasi gagal/promo (heuristik)
- Multi-forward webhook
- Pause layanan
- Statistik harian
- Export CSV, debug log, health check
- PWA manifest

---

## API ringkas

| Endpoint | Fungsi |
|----------|--------|
| `POST /api/webhook` | Terima event HP → Redis |
| `GET /api/payments` | List + stats |
| `GET /api/health` | Cek Redis |
| `POST /api/test` | Simulasi (tetap ke Redis) |
| `GET/POST /api/forwards` | Forward URL |
| `GET/POST /api/service` | Aktif/jeda |
| `GET /api/logs` | Debug |

---

## Local

```bash
npm install
cp .env.example .env.local   # isi Upstash
npm run dev
```

---

## Web → App

Setelah Vercel + Redis stabil, bungkus PWA/Capacitor. Listener notifikasi tetap native.
