# WALZPAY Android Listener

Aplikasi Android native untuk memantau notifikasi **DANA Bisnis** (`id.dana`) dan mengirim data ke webhook WALZPAY.

## Fitur

- `NotificationListenerService` real-time
- Parser nominal Rupiah
- POST ke `/api/webhook` (+ header secret opsional)
- Filter package DANA / GoPay
- Foreground service + boot restart
- Siap digabung **Service Keeper**

## Build APK

1. Install **Android Studio**
2. `File → Open` → folder `android-listener`
3. Tunggu Gradle sync
4. `Build → Build APK(s)`
5. APK: `app/build/outputs/apk/debug/app-debug.apk`

## Setup HP

1. Install APK
2. Izinkan **Notification Access**
3. Isi Webhook URL: `https://DOMAIN/api/webhook`
4. (Opsional) isi Secret = `WEBHOOK_SECRET`
5. Aktifkan toggle

## Service Keeper

Monitor service:
```
com.walzpay.listener/.PaymentNotificationListener
```
Interval 5–15 menit.

## Payload

```json
{
  "packageName": "id.dana",
  "title": "DANA",
  "text": "Anda menerima Rp 50.000",
  "amount": 50000,
  "merchantId": "dana",
  "source": "walzpay-android-listener"
}
```

## Capacitor / Web → APK

Next.js **tidak bisa** baca notifikasi Android. Capacitor hanya membungkus UI; listener tetap harus native (folder ini).

Alur production yang stabil:

1. Deploy WALZPAY di Vercel + Redis
2. Build APK dari folder ini
3. Install di HP DANA Bisnis
4. (Opsional) Service Keeper
