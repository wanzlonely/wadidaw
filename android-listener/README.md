# WALZPAY Android Listener

Aplikasi **native Kotlin** (`android-listener/`).  
Tugas: **memantau notifikasi** e-wallet/bank yang dipilih → parse nominal → **POST webhook** website → order pending **otomatis Sukses**.

Website **tidak** membaca notifikasi HP. Yang membaca = **APK ini**.

---

## Build APK TANPA PC (GitHub Actions)

Repo sudah punya workflow otomatis. Bisa dari **HP** saja:

### Cara 1 — Trigger manual (paling mudah)

1. Buka di browser HP:  
   https://github.com/wanzlonely/wadidaw/actions/workflows/build-apk.yml
2. Tap **Run workflow** → **Run workflow** (branch `main`)
3. Tunggu ~3–6 menit sampai status **hijau**
4. Tap run yang baru selesai → bagian **Artifacts**
5. Unduh **walzpay-listener-apk** (file ZIP)
6. Extract → dapat `app-debug.apk` → install di HP

> Jika tombol **Run workflow** tidak muncul: login GitHub, pastikan akun Anda punya akses write ke repo.

### Cara 2 — Otomatis saat ada perubahan

Setiap push ke `main` yang mengubah folder `android-listener/` akan build ulang APK.  
Hasilnya tetap di **Actions → Artifacts**.

### Install di HP

1. Settings → izinkan **Install unknown apps** untuk browser/file manager
2. Buka `app-debug.apk` → Install
3. Lanjut setup di bawah (izin notifikasi, API key, dll.)

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

1. Buka **WALZPAY Listener**
2. **Izinkan akses notifikasi** → centang app ini
3. **Tanpa batasan baterai** → izinkan
4. **Webhook URL** = `https://DOMAIN-ANDA.vercel.app/api/webhook`
5. **API Key** = salin dari website **Setel → API key** (**wajib**)
6. Secret = `WEBHOOK_SECRET` Vercel (opsional)
7. **Pilih sumber notifikasi** (DANA, GoPay, OVO, Shopee, WA, bank…)
8. Toggle **Aktifkan Listener** → **Simpan**
9. Xiaomi/OPPO/Vivo: **Autostart ON**

### Uji sinkron

1. Website → Pesanan → generate QRIS nominal uji
2. Bayar (atau notifikasi) dengan nominal **persis** total
3. Log lokal APK: `Webhook HTTP 200`
4. Website: status **Sukses**

---

## Build lokal (jika punya PC)

1. Android Studio → Open folder **`android-listener`**
2. Gradle sync → **Build → Build APK(s)**
3. Output: `app/build/outputs/apk/debug/app-debug.apk`

---

## Forward ke Telegram / WhatsApp

Dashboard website → **Forward URL** → tambah endpoint bot.  
APK **tidak** chat bot langsung — website yang meneruskan.

---

## File penting

| File | Isi |
|------|-----|
| `PaymentNotificationListener.kt` | Tangkap notifikasi + POST + X-Api-Key |
| `MainActivity.kt` | UI izin, API key, sumber, log |
| `KeepAliveService.kt` | Foreground sticky |
| `BootReceiver.kt` | Restart setelah boot |
| `.github/workflows/build-apk.yml` | Build APK di cloud |
