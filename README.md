# WALZPAY

Dashboard **notifikasi QRIS → webhook → Redis → UI** + **auto-match order pending → success**.

Deploy: **Vercel** · Data: **Upstash Redis** · Listener HP: folder `android-listener/`

---

## Alur (QRIS dinamis)

```
1. Buat order pending          POST /api/orders  { amount: 50000 }
   → server alokasi kode unik 3 digit (mis. 123)
   → totalAmount = 50123 · token payment link
2. Bagikan link /pay/{token} ke pelanggan
3. Pelanggan transfer / scan QRIS dengan nominal PERSIS totalAmount
4. HP menerima notifikasi DANA / e-wallet
5. android-listener → POST /api/webhook
6. Server parse + dedup + match totalAmount → order success
7. Dashboard live (poll 2s + toast + suara) / payment page auto-update
```

Website **tidak** membaca notifikasi. Deteksi terjadi di app Android.

---

## Setup Redis (wajib)

1. [Upstash](https://console.upstash.com) → Create Redis
2. Salin `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` ke Vercel env
3. Redeploy · cek `/api/health`

Opsional:
```
WEBHOOK_SECRET=rahasia-anda
```

Lokal: salin `.env.example` → `.env.local`

---

## Android Listener

Folder **`android-listener/`** — build di Android Studio, install APK.

1. Izinkan Notification Access
2. Webhook: `https://PROJECT.vercel.app/api/webhook`
3. Aktifkan listener
4. Disarankan: [Service Keeper](https://github.com/sklndev/Service-Keeper)

Detail: [`android-listener/README.md`](android-listener/README.md)

Alternatif: [QRIS Hook](https://github.com/suriyadi15/qrishook)

---

## API

| Endpoint | Fungsi |
|----------|--------|
| `POST /api/webhook` | Terima notifikasi → parse → dedup → match order → simpan |
| `POST /api/orders` | Buat order dinamis `{ amount, reference?, customerName?, expiresInMinutes?, dynamic? }` |
| `GET /api/orders?status=pending` | List order |
| `GET /api/orders/by-token?token=…` | Ambil order publik by payment-link token |
| `DELETE /api/orders?id=ord_…` | Batalkan order pending |
| `GET /api/payments` | List pembayaran + stats |
| `GET /api/live` | SSE stream snapshot (payments + pending + stats) |
| `GET /api/health` | Cek Redis |
| `POST /api/test` | Simulasi pembayaran |
| `GET/POST /api/forwards` | Forward URL |
| `GET/POST /api/service` | Pause / aktifkan layanan |
| `GET /api/logs` | Debug log |

### Halaman publik

- **`/pay/[token]`** — Payment link untuk pelanggan. Menampilkan nominal yang harus dibayar (base + kode unik) dan auto-refresh saat status berubah.

### Contoh buat order dinamis lalu auto-sukses

```bash
# 1. Buat pending (default dynamic=true)
curl -X POST https://DOMAIN/api/orders \
  -H "Content-Type: application/json" \
  -d '{"amount":50000,"reference":"INV-001","expiresInMinutes":30}'

# Response contoh:
# {
#   "ok": true,
#   "order": {
#     "id": "ord_…",
#     "amount": 50000,
#     "uniqueCode": 123,
#     "totalAmount": 50123,
#     "token": "a1b2c3d4e5f6",
#     "mode": "dynamic",
#     "status": "pending",
#     …
#   }
# }

# 2. Bagikan link: https://DOMAIN/pay/a1b2c3d4e5f6
# 3. Pelanggan transfer Rp 50.123
# 4. Saat notifikasi masuk via listener, order otomatis status = success
```

---

## Fitur (prioritas Mutasiku-style)

1. **QRIS dinamis** — kode unik 3 digit (100–999) ditambahkan ke nominal; anti-collision antar order concurrent
2. **Monitoring real-time** — dashboard poll 2 detik + toast + suara + browser notification saat payment baru
3. **Payment link** — `/pay/[token]` publik, auto-update status
4. **Matching otomatis** — match pada `totalAmount` (FIFO), legacy static tetap didukung
5. **Dashboard live** — stats, pending count, SSE endpoint `/api/live`

Lainnya:
- Parse nominal IDR (titik/koma)
- Map package → merchant (`id.dana` → dana)
- Filter promo / gagal / OTP
- **Dedup** 2 menit (nominal + package)
- Multi-forward webhook
- Pause layanan
- Statistik harian + pending/success order count
- Companion Android Listener

---

## Local

```bash
npm install
cp .env.example .env.local
npm run dev
```
