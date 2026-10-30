# WALZPAY Android 3.1.0

## Perubahan utama

### Offline handling
- Saat tidak ada internet, **tidak lagi** menampilkan halaman error Chrome "Halaman web tidak tersedia" + domain Vercel.
- Diganti dengan halaman offline lokal yang rapi (bahasa Indonesia) + tombol **Coba Lagi**.
- Auto-retry saat koneksi kembali.

### Keamanan
- `usesCleartextTraffic=false` + `networkSecurityConfig`
- WebView: `MIXED_CONTENT_NEVER_ALLOW`, Safe Browsing, third-party cookies off, debugging disabled di release
- `allowBackup=false`
- R8 minify + shrink resources aktif di release
- Security headers di web (CSP, HSTS, X-Frame-Options, dll.)

### Kompatibilitas
- `compileSdk` / `targetSdk` = **35** (siap Android 15 / menuju 16)
- minSdk tetap 26

### Versi
- versionCode 32
- versionName **3.1.0**

## Cara build

1. Buka folder `android-listener` di Android Studio
2. Sync Gradle
3. Build → Generate Signed Bundle / APK (release)
4. Install di HP

## iOS

Saat ini dukungan iOS melalui **PWA** (Add to Home Screen dari Safari).  
Native iOS (WKWebView) akan ditambahkan di tahap berikutnya jika diperlukan.  
Listener notifikasi full hanya tersedia di Android karena keterbatasan platform iOS.
