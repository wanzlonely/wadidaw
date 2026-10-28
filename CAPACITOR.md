# Catatan Capacitor (Web → APK)

## Realita teknis

Next.js / PWA **tidak bisa** membaca notifikasi Android.

Untuk mendapatkan APK yang bisa memantau notifikasi DANA, ada dua jalan:

### 1. Companion Native (Disarankan) ✅

Gunakan folder `android-listener/` yang sudah disediakan.

- Full native NotificationListenerService
- Paling stabil
- Langsung kirim ke `/api/webhook`
- Bisa digabung dengan Service Keeper

### 2. Capacitor + Native Plugin (Lebih kompleks)

Jika ingin UI web dibungkus jadi APK:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init
npx cap add android
```

Kemudian kamu **tetap harus** menulis native plugin Kotlin untuk NotificationListenerService (mirip kode di `android-listener`).

Capacitor hanya membungkus UI. Kemampuan baca notifikasi tetap native.

## Rekomendasi

Untuk production auto-verifikasi pembayaran DANA:

1. Deploy WALZPAY (Next.js) di Vercel + Redis
2. Build APK dari `android-listener/`
3. Install di HP yang login DANA Bisnis
4. (Opsional) pasang Service Keeper agar listener tidak mati

Ini arsitektur yang paling andal dan sudah dipakai banyak payment gateway non-merchant.
