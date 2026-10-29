# WALZPAY Android Listener

Aplikasi **native Kotlin** di folder `android-listener/`.
Tugasnya: memantau notifikasi (utamanya **DANA**), parse nominal, POST ke website WALZPAY.

Website (Next.js) **tidak** bisa membaca notifikasi HP. Yang membaca = APK ini.

## Referensi open-source (pola, bukan copy buta)

| Repo | Dipakai untuk |
|------|----------------|
| [suriyadi15/qrishook](https://github.com/suriyadi15/qrishook) | Arsitektur webhook QRIS |
| [ItsAzni/NotificationForwarder](https://github.com/ItsAzni/NotificationForwarder) | Listener + POST webhook |
| [Chagall/notification-listener-service-example](https://github.com/Chagall/notification-listener-service-example) | Dasar NotificationListenerService |
| [sklndev/Service-Keeper](https://github.com/shaunkleyn/Service-Keeper) | **Opsional** jaga service di OEM agresif |

Tidak menyertakan teknik keep-alive berbahaya (1px activity, silent music, hide uninstall).

## Permission (sah)

- `BIND_NOTIFICATION_LISTENER_SERVICE` — baca notifikasi (user aktifkan di Settings)
- `FOREGROUND_SERVICE` + specialUse — notifikasi status “listener aktif”
- `RECEIVE_BOOT_COMPLETED` — nyalakan lagi setelah reboot
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — minta user: tanpa optimasi baterai
- `INTERNET` / `POST_NOTIFICATIONS` / `WAKE_LOCK`

## Alur

```
Notifikasi DANA di status bar
        ↓
PaymentNotificationListener (package id.dana / id.dana.kasir)
        ↓ parse Rp…
POST https://wadidaw-zeta.vercel.app/api/webhook
        ↓
WALZPAY Redis + dashboard → pembayaran tercatat
```

## Build APK

1. Install **Android Studio** (butuh PC/laptop sekali; build dari HP saja sulit)
2. `File → Open` → folder **`android-listener`** (bukan root Next.js)
3. Tunggu Gradle sync
4. `Build → Build Bundle(s) / APK(s) → Build APK(s)`
5. File: `app/build/outputs/apk/debug/app-debug.apk`
6. Install ke HP kasir

## Setup di HP

1. Buka **WALZPAY Listener**
2. **Izinkan akses notifikasi** → centang app ini
3. **Tanpa batasan baterai** → izinkan
4. Webhook (default): `https://wadidaw-zeta.vercel.app/api/webhook`
5. Secret = nilai `WEBHOOK_SECRET` di Vercel (jika di-set)
6. Toggle **Aktifkan Listener** → **Simpan**
7. OEM Xiaomi/OPPO/Vivo: **Autostart** ON untuk app ini
8. Transaksi uji DANA → cek **Log lokal** + dashboard web

## Service Keeper (opsional)

Pantau package: `com.walzpay.listener`  
Service class: `com.walzpay.listener.PaymentNotificationListener`

## File penting

| File | Isi |
|------|-----|
| `PaymentNotificationListener.kt` | Tangkap notifikasi + POST |
| `KeepAliveService.kt` | Foreground sticky |
| `BootReceiver.kt` | Restart setelah boot |
| `MainActivity.kt` | UI izin + URL + log |
| `AppLog.kt` | Log lokal di HP |
| `AndroidManifest.xml` | Permission |

## Yang tidak dilakukan di sini

- Capacitor/TWA tidak menggantikan folder ini
- “Immortal” process / hide dari uninstall = tidak ditambahkan (risiko Play Protect & tidak etis)
