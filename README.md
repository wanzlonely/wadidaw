# WALZPAY (Web)

Dashboard **QRIS notification → webhook** dengan UI liquid glass biru laut.  
Deploy: **Vercel** · siap **PWA / web-to-app**.

> Website **tidak** membaca notifikasi Android. Gunakan app listener di HP (mis. [QRIS Hook](https://github.com/suriyadi15/qrishook)) yang mengirim POST ke `/api/webhook`.

---

## Setara QRIS Hook + lebih lengkap

| Fitur | QRIS Hook (app) | WALZPAY (web) |
|--------|-----------------|---------------|
| Listener notifikasi OS | Ya | Tidak (butuh app HP) |
| Terima webhook / event | Kirim keluar | Ya (`/api/webhook`) |
| Toggle aktif/pause | Ya | Ya |
| Multi webhook forward | Terbatas | Ya |
| Daftar merchant | Ya | Ya (panduan filter) |
| Riwayat | Ya | Ya + filter + export CSV |
| Debug log | Ya | Ya |
| Statistik harian | - | Ya |
| Simulasi pembayaran | - | Ya |
| Suara alert browser | - | Ya |
| PWA install | - | Ya |

---

## Halaman

- `/` Beranda — status, stats, webhook URL, forward, merchant, simulasi
- `/riwayat` — list, cari, filter, export CSV
- `/debug` — log payload & error
- `/pengaturan` — dokumentasi API & web-to-app

---

## API

| Method | Path | Ket |
|--------|------|-----|
| POST | `/api/webhook` | Event dari HP |
| GET | `/api/payments` | List + stats |
| DELETE | `/api/payments` | Hapus riwayat |
| POST | `/api/test` | Simulasi |
| GET/POST/PATCH/DELETE | `/api/forwards` | Multi URL |
| GET/POST | `/api/service` | Pause/aktif |
| GET/DELETE | `/api/logs` | Debug |

Contoh body webhook:

```json
{
  "merchantId": "dana",
  "amount": 10000,
  "paymentSource": "DANA",
  "packageName": "id.dana",
  "rawTitle": "Pembayaran berhasil",
  "rawText": "Rp10.000"
}
```

Opsional env: `WEBHOOK_SECRET` + header `x-walzpay-secret`.

---

## Local

```bash
npm install
npm run dev
```

## Deploy Vercel

1. Import `wanzlonely/wadidaw`
2. Deploy
3. Di QRIS Hook isi: `https://PROJECT.vercel.app/api/webhook`

---

## Web → App

1. Deploy stabil di Vercel  
2. Install PWA dari browser, atau bungkus dengan Capacitor/TWA  
3. Listener notifikasi tetap app native (atau plugin khusus)

---

## Catatan data

Store in-memory (demo). Untuk produksi: Vercel KV / database.

Inspirasi alur: suriyadi15/qrishook (MIT).
