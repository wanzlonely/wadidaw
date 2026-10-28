# WALZPAY

Aplikasi Android native untuk memantau **notifikasi pembayaran QRIS** (terutama **DANA Bisnis**) dan mengirim event ke **webhook** kamu secara real-time.

> Brand & UI: **WALZPAY** — biru laut + style liquid glass transparan  
> Basis teknis: [suriyadi15/qrishook](https://github.com/suriyadi15/qrishook) (MIT License)

---

## Fitur yang direncanakan

- Listener notifikasi Android (NotificationListenerService)
- Parser **DANA Bisnis** (`id.dana` / `id.dana.kasir`)
- Forward payload pembayaran ke webhook URL
- UI modern: gelap + liquid glass (blur / transparan)
- Branding penuh: nama, warna, icon, string

---

## Status saat ini

| Item | Status |
|------|--------|
| Repo | Inisialisasi |
| Branding (nama, warna) | Direncanakan di docs |
| Parser DANA | Kerangka di `docs/DanaMerchantParser.kt` |
| Source Android penuh | Belum di-import dari qrishook |
| Sample notifikasi DANA asli | Belum ada (parser masih heuristik) |

---

## Cara melanjutkan (butuh PC + Android Studio)

### 1. Ambil source dasar

```bash
git clone https://github.com/suriyadi15/qrishook.git walzpay-temp
cd walzpay-temp
```

Atau fork qrishook, lalu push ke repo ini sebagai remote `origin`.

### 2. Rebrand ke WALZPAY

- `applicationId` / `namespace` → `com.walzpay.app` (atau `id.walzpay.hook`)
- `app_name` → **WALZPAY**
- Ganti `colors.xml` & theme sesuai `docs/colors.xml`
- Ganti icon launcher
- Rename package folder Java/Kotlin

### 3. Tambah parser DANA

Salin isi `docs/DanaMerchantParser.kt` ke package merchant project, lalu daftarkan di `MerchantRegistry`.

### 4. UI liquid glass

Ikuti desain di `docs/UI_DESIGN.md`.

### 5. Build APK

```bash
./gradlew assembleRelease
```

---

## Warna (Ocean Blue + Liquid Glass)

| Token | Hex |
|-------|-----|
| primary | `#0077B6` |
| primary_dark | `#023E8A` |
| accent | `#00B4D8` |
| bg_dark | `#0A1628` |
| glass | `#33FFFFFF` |
| text | `#F0F9FF` |

Detail: lihat `docs/colors.xml`.

---

## Lisensi & kredit

- Kode dasar: **MIT** — [suriyadi15/qrishook](https://github.com/suriyadi15/qrishook)
- Branding & kustomisasi WALZPAY: milik pemilik repo ini

---

## Catatan penting

Parser DANA masih **kerangka**. Format notifikasi resmi DANA jarang dipublikasikan. Setelah ada 1–2 sample notifikasi asli (title + text dari Debug Mode), parser perlu disesuaikan agar akurat.
