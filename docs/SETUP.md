# Setup WALZPAY dari qrishook

Langkah praktis di **PC + Android Studio**.

## Prasyarat

- Android Studio (Ladybug / versi terbaru)
- JDK 17
- Akun GitHub (repo ini: `wanzlonely/wadidaw`)

---

## Opsi A — Clone qrishook lalu push ke wadidaw

```bash
# 1. Clone basis
git clone https://github.com/suriyadi15/qrishook.git walzpay
cd walzpay

# 2. Ganti remote ke repo kamu
git remote remove origin
git remote add origin https://github.com/wanzlonely/wadidaw.git

# 3. (Opsional) merge dengan docs yang sudah ada di wadidaw
git pull origin main --allow-unrelated-histories
# resolve konflik README jika perlu, prioritaskan isi WALZPAY

# 4. Lakukan rebrand (lihat di bawah), lalu:
git add .
git commit -m "feat: rebrand to WALZPAY + DANA parser"
git push -u origin main
```

---

## Opsi B — Fork qrishook di GitHub, lalu rename

1. Buka https://github.com/suriyadi15/qrishook → **Fork**
2. Di settings fork, rename repo jadi `wadidaw` (atau biarkan lalu transfer ke `wanzlonely/wadidaw`)
3. Clone fork kamu, lanjut rebrand

---

## Checklist rebrand

### 1. Gradle

**`settings.gradle.kts`**
```kotlin
rootProject.name = "WALZPAY"
```

**`app/build.gradle.kts`**
```kotlin
namespace = "com.walzpay.app"
defaultConfig {
    applicationId = "com.walzpay.app"
    // ...
}
```

### 2. Package Kotlin

Rename folder:
`io/github/suriyadi15/qrishook` → `com/walzpay/app`  
(Android Studio: Refactor → Rename package)

### 3. Strings

`app/src/main/res/values/strings.xml` — ganti semua “QRIS Hook” → “WALZPAY”.

### 4. Colors & theme

Copy `docs/colors.xml` → `app/src/main/res/values/colors.xml`  
Update `themes.xml` parent ke dark + colorPrimary `@color/primary`.

### 5. Parser DANA

- Copy `docs/DanaMerchantParser.kt` ke package merchant
- Sesuaikan import & signature `MerchantParser` / `QrisPaymentEvent` agar cocok dengan project
- Daftarkan di registry parser bawaan

### 6. Icon

Ganti `ic_launcher` di semua densitas (mipmap-*).

### 7. Build

```bash
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/
```

Install ke HP via USB atau kirim file APK.

---

## Setelah sample notifikasi DANA didapat

1. Aktifkan Debug Mode di app
2. Centang package `id.dana`
3. Transaksi QRIS masuk → salin title + text dari log
4. Update keyword & regex di `DanaMerchantParser`
5. Commit & rebuild

---

## Lisensi

Kode dari qrishook tetap MIT. Sertakan atribusi di About / README.
