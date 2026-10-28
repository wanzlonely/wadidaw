# WALZPAY — UI Design (Liquid Glass)

## Identitas

| Item | Nilai |
|------|--------|
| Nama | **WALZPAY** |
| Tagline | Notifikasi QRIS ke webhook |
| Style | Dark + liquid glass (transparan, soft glow) |
| Primary | Ocean blue `#0077B6` |
| Accent | Cyan `#00B4D8` |
| Background | `#0A1628` |

---

## Bottom navigation

1. **Beranda**
2. **Riwayat**
3. **Pengaturan** (menggantikan Debug sebagai tab utama; mode debug di dalam settings)

Active tab: warna accent `#00B4D8`.

---

## 1. Splash

- Background gradient gelap → biru laut
- Logo WALZPAY di tengah
- Tagline kecil di bawah
- Indicator loading tipis accent

---

## 2. Beranda

Urutan kartu (semua style glass):

1. **Header** — logo + badge status Aktif/Nonaktif
2. **Akses Notifikasi** — status + tombol Aktifkan akses / Info aplikasi
3. **Toggle WALZPAY Aktif** — switch besar
4. **Optimasi Baterai** — tombol Izinkan jika dibatasi
5. **Webhook** — URL atau tombol + Tambah webhook
6. **Merchant** — checkbox DANA Bisnis (`id.dana`), opsional DANA Kasir

### Glass card (Compose contoh)

```kotlin
Modifier
    .fillMaxWidth()
    .background(
        color = Color.White.copy(alpha = 0.12f),
        shape = RoundedCornerShape(24.dp)
    )
    .border(1.dp, Color(0x55CAF0F8), RoundedCornerShape(24.dp))
    .padding(16.dp)
```

Corner radius: **20–24 dp**.  
Tombol utama: solid primary. Tombol sekunder: outline transparan.

---

## 3. Riwayat

- List kartu glass kecil: nominal, merchant (DANA), waktu, status webhook
- Empty state: teks “Belum ada pembayaran”

---

## 4. Pengaturan

- Nama app + versi
- Bahasa (ID / EN)
- Mode pengembang → Debug Mode + buka log notifikasi
- Kredit open source (qrishook MIT)

---

## 5. Bottom sheet Webhook

- Input URL
- Simpan + Test (kirim dummy payload)
- Validasi URL

---

## Yang diubah dari QRIS Hook asli

- Nama, icon, splash, warna hijau → biru laut
- Teks “QRIS Hook” → “WALZPAY”
- Tab Debug digeser ke dalam Pengaturan
- Kartu memakai glass semi-transparan, bukan solid putih
