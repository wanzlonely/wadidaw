# WALZPAY Android Listener

Aplikasi **native Kotlin** (`android-listener/`).  
Tugas: **memantau notifikasi** e-wallet/bank yang dipilih → parse nominal → **POST webhook** website → order pending **otomatis Sukses**.

Website **tidak** membaca notifikasi HP. Yang membaca = **APK ini**.

**Versi rilis publik:** `3.1.4` (signed release)

---

## Install untuk publik (paling mudah)

1. Buka halaman **Releases**:  
   **https://github.com/wanzlonely/wadidaw/releases**
2. Pilih rilis terbaru (**v3.1.4**)
3. Unduh **`WALZPAY-3.1.4.apk`**
4. Di HP: Settings → izinkan **Install unknown apps** (Chrome / Files)
5. Buka file APK → **Install**
6. Buka **WALZPAY** → izinkan **Akses notifikasi** + **Tanpa batasan baterai**
7. Login / isi **API key** dari website → **Setel**

Alternatif:  
https://github.com/wanzlonely/wadidaw/actions → workflow **Build WALZPAY Release APK** → Artifacts → `walzpay-release-apk`

---

## Build APK (GitHub Actions)

### Trigger manual

1. https://github.com/wanzlonely/wadidaw/actions/workflows/build-apk.yml
2. **Run workflow** (branch `main`)
3. Tunggu status hijau (~3–8 menit)
4. Artifacts **atau** tab **Releases** (jika workflow_dispatch / tag)

### Otomatis

- Push ke `main` → build release APK (artifact)
- Tag `v*` atau **Run workflow** → **GitHub Release** + APK publik

### Install di HP

1. Settings → izinkan **Install unknown apps**
2. Buka `WALZPAY-3.1.4.apk` → Install
3. Lanjut setup izin di bawah

---

## Alur sinkron (APK ↔ Website ↔ Bot)

```
[Website] Buat pesanan → QRIS dinamis (totalAmount = harga + fee acak)
        ↓
[Pembeli] Bayar exact totalAmount lewat e-wallet
        ↓
[HP] Notifikasi masuk (DANA/GoPay/OVO/…)
        ↓
[APK Listener] Filter app terpilih → parse Rp → POST /api/webhook
              Header: X-Api-Key = API key merchant (dari Setel)
        ↓
[Website] setTenant(userId) → simpan payment → matchPendingOrder(totalAmount)
        ↓ order.status = success
[Website] Dashboard / Riwayat / halaman /pay/[token] update (poll)
        ↓
[Forward URL] opsional → bot Telegram / WhatsApp / sistem lain
```

| Komponen | Tugas |
|----------|--------|
| **Website** | Order, QRIS, status, dashboard, forward URL |
| **APK Listener** | Izin notifikasi, baterai, pilih app, kirim webhook |
| **Bot TG/WA** | Terima forward JSON dari website (bukan langsung dari APK) |

---

## Permission (sah)

| Permission | Fungsi |
|------------|--------|
| Notification Listener | Baca notifikasi app terpilih |
| Ignore battery optimizations | Listener tidak dimatikan OEM |
| Foreground service | Keep-alive status |
| Boot completed | Nyala lagi setelah reboot |
| Internet | POST webhook |
| Wake lock / exact alarm | OEM agresif |

---

## Setup HP (setelah install APK)

1. Buka **WALZPAY**
2. **Izinkan akses notifikasi** → centang app ini
3. **Tanpa batasan baterai** → izinkan
4. **Webhook URL** = `https://walzpaynew.vercel.app/api/webhook` (atau domain Anda)
5. **API Key** = salin dari website **Setel → API key** (**wajib**)
6. Secret = opsional
7. **Pilih sumber notifikasi** (DANA, GoPay, OVO, Shopee, WA, bank…)
8. Toggle **Aktifkan Listener** → **Simpan**
9. Xiaomi/OPPO/Vivo: **Autostart ON**

### Uji sinkron

1. Website → Pesanan → generate QRIS nominal uji
2. Bayar (atau notifikasi) dengan nominal **persis** total
3. Log lokal APK: `Webhook HTTP 200`
4. Website: status **Sukses**

---

## Build lokal (PC + Android Studio)

1. Decode keystore: `base64 -d keystore/walzpay-release.jks.b64 > keystore/walzpay-release.jks`
2. Open folder **`android-listener`** di Android Studio
3. **Build → Generate Signed Bundle / APK → APK → release**
4. Output: `app/build/outputs/apk/release/`

---

## Forward ke Telegram / WhatsApp

Dashboard website → **Forward URL** → tambah endpoint bot.  
APK **tidak** chat bot langsung — website yang meneruskan.

---

## File penting

| File | Isi |
|------|-----|
| `PaymentNotificationListener.kt` | Tangkap notifikasi + POST + X-Api-Key |
| `MainActivity.kt` | WebView dashboard + bridge izin |
| `KeepAliveService.kt` | Foreground sticky |
| `BootReceiver.kt` | Restart setelah boot |
| `.github/workflows/build-apk.yml` | Build **signed release** + GitHub Release |
