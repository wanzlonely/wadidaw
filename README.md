# WALZPAY

Dashboard **notifikasi QRIS → webhook → Redis → UI** + **auto-match order pending → success**.

Deploy: **Vercel** · Data: **Upstash Redis** · Listener HP: folder `android-listener/`

---

## Alur

```
1. Buat order pending          POST /api/orders  { amount: 50000 }
2. HP menerima notifikasi DANA
3. android-listener → POST /api/webhook
4. Server parse + dedup + match nominal
5. Order status → success
6. Dashboard / forward webhook
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
| `POST /api/orders` | Buat order pending `{ amount, reference?, expiresInMinutes? }` |
| `GET /api/orders?status=pending` | List order |
| `DELETE /api/orders?id=ord_…` | Batalkan order pending |
| `GET /api/payments` | List pembayaran + stats |
| `GET /api/health` | Cek Redis |
| `POST /api/test` | Simulasi pembayaran |
| `GET/POST /api/forwards` | Forward URL |
| `GET/POST /api/service` | Pause / aktifkan layanan |
| `GET /api/logs` | Debug log |

### Contoh buat order lalu auto-sukses

```bash
# 1. Buat pending
curl -X POST https://DOMAIN/api/orders \
  -H "Content-Type: application/json" \
  -d '{"amount":50000,"reference":"INV-001","expiresInMinutes":30}'

# 2. Saat notifikasi DANA Rp50.000 masuk via listener,
#    order otomatis status = success
```

---

## Fitur

- Parse nominal IDR (titik/koma)
- Map package → merchant (`id.dana` → dana)
- Filter promo / gagal / OTP
- **Dedup** 2 menit (nominal + package)
- **Matching order** pending → success (nominal sama, FIFO)
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
