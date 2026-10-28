# WALZPAY (Web)

Dashboard web **Notifikasi QRIS → Webhook**, brand **WALZPAY**, style **liquid glass biru laut**.  
Deploy ke **Vercel** (Next.js App Router).

## Batasan penting

Browser / website **tidak bisa** membaca notifikasi Android (DANA, GoPay, dll.).  
Itu hanya bisa dilakukan app native (NotificationListenerService).

### Arsitektur yang dipakai

```
[HP: QRIS Hook / app listener]  --POST JSON-->  [WALZPAY di Vercel]
                                                      |
                                              simpan + tampil riwayat
                                              dashboard liquid glass
```

1. Install app listener di HP (mis. [QRIS Hook](https://github.com/suriyadi15/qrishook)).
2. Set webhook URL ke: `https://DOMAIN-KAMU.vercel.app/api/webhook`
3. Buka dashboard WALZPAY di browser untuk lihat pembayaran real-time / riwayat.

Website ini = **penerima webhook + dashboard**, bukan pengganti total app Android.

---

## Fitur

- `POST /api/webhook` — terima event pembayaran dari app di HP
- Dashboard Beranda (status, URL webhook, ringkasan)
- Halaman Riwayat pembayaran
- UI gelap + liquid glass (Ocean Blue)
- Penyimpanan sementara di memory (demo); siap diganti Vercel KV / DB

---

## Stack

- Next.js 14 (App Router)
- TypeScript
- CSS modules / global liquid glass
- Deploy: Vercel

---

## Local development

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

Test webhook:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"merchantId":"dana","amount":10000,"paymentSource":"DANA","rawTitle":"Pembayaran berhasil","rawText":"Rp10.000"}'
```

---

## Deploy Vercel

1. Import repo `wanzlonely/wadidaw` di [vercel.com](https://vercel.com)
2. Framework: Next.js (auto)
3. Deploy
4. Salin URL → pasang di app HP sebagai webhook

Opsional env:

```
WEBHOOK_SECRET=ubah-jadi-rahasia
```

Jika di-set, request harus kirim header `x-walzpay-secret: <nilai>`.

---

## Brand

| Token | Nilai |
|-------|--------|
| Nama | WALZPAY |
| Primary | `#0077B6` |
| Accent | `#00B4D8` |
| Background | `#0A1628` |

---

## Kredit

Ide alur notifikasi QRIS terinspirasi [suriyadi15/qrishook](https://github.com/suriyadi15/qrishook) (MIT).  
Versi web ini fokus dashboard + API webhook.
