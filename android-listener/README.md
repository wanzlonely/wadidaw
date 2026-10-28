# WALZPAY Android Listener

Aplikasi Android native untuk memantau notifikasi **DANA Bisnis** (`id.dana`) dan mengirim data pembayaran ke webhook WALZPAY.

## Fitur

- `NotificationListenerService` yang membaca notifikasi real-time
- Parser nominal Rupiah (Rp 10.000, Rp10.000, dll)
- Kirim otomatis ke `POST /api/webhook`
- Support header `x-walzpay-secret` (opsional)
- Filter package `id.dana` (bisa ditambah)
- Foreground service agar lebih stabil
- Siap digabung dengan **Service Keeper** untuk keep-alive

## Cara Build APK

1. Install **Android Studio** (Hedgehog atau lebih baru)
2. Buka folder ini sebagai project:
   ```
   File → Open → pilih folder android-listener
   ```
3. Tunggu Gradle sync selesai
4. Hubungkan HP / emulator
5. Build → Build Bundle(s) / APK(s) → Build APK(s)
6. Atau jalankan langsung (Run ▶)

APK hasil build ada di:
```
app/build/outputs/apk/debug/app-debug.apk
```

## Setup di HP

1. Install APK
2. Buka aplikasi → izinkan **Notification Access**
3. Isi **Webhook URL** (contoh: `https://wadidaw.vercel.app/api/webhook`)
4. (Opsional) isi **Secret** jika kamu set `WEBHOOK_SECRET` di Vercel
5. Aktifkan toggle listener

## Integrasi Service Keeper (disarankan)

Android sering mematikan NotificationListener. Untuk menjaga service tetap hidup:

1. Install [Service Keeper](https://github.com/sklndev/Service-Keeper)
2. Tambahkan service dari app ini (`com.walzpay.listener/.PaymentNotificationListener`)
3. Set interval pengecekan 5–15 menit

## Payload yang dikirim

```json
{
  "packageName": "id.dana",
  "title": "DANA",
  "text": "Anda menerima Rp 50.000",
  "rawText": "Anda menerima Rp 50.000",
  "amount": 50000,
  "merchantId": "dana",
  "source": "walzpay-android-listener"
}
```

Parser di server (`lib/parse-payment.ts`) akan memproses lebih lanjut.

## Catatan Penting

- Website / Next.js **tidak bisa** membaca notifikasi Android.
- Listener **harus** native (Kotlin/Java).
- Capacitor hanya membungkus UI web; NotificationListener tetap butuh plugin native.
- Folder ini adalah companion app yang berdiri sendiri dan paling stabil untuk production.
