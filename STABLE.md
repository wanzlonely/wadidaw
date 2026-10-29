# WALZPAY — Baseline Stabil (JANGAN REGRESI)

**Tanggal kunci:** 2026-10-29  
**Commit acuan:** `main` setelah perbaikan password, dashboard hero, QRIS detail, status transaksi, liquid-glass UI.

Dokumen ini mengunci pola yang sudah terbukti bekerja.  
Setiap perbaikan berikutnya **wajib** dimulai dari state ini dan **tidak boleh** mengembalikan bug di bawah.

---

## 1. Multi-tenant Redis (wajib)

- Semua akses data merchant lewat `setTenant(userId)` + helper `K()` di `lib/tenant.ts`.
- API route **jangan** mengoper `userId` sebagai argumen kedua ke `listOrders` / `addPayment` / store lain yang sudah scoped tenant.
- Pola benar:
  ```ts
  setTenant(session.userId);
  const orders = await listOrders(status);
  ```
- Jangan pernah menulis key global tanpa prefix user untuk data per-merchant.

---

## 2. Auth & sesi (wajib)

- Login/register → OTP (jika A2F) → cookie `walz_sid` + backup `localStorage.walzpay_token` (`x-walz-token`).
- `resolveSession(req)`: cookie **atau** header token.
- **Logout** harus:
  1. `destroySession` cookie + token header
  2. clear cookie (`maxAge: 0`)
  3. client: `setStoredToken(null)` + `localStorage.removeItem("walzpay_token")` + redirect `/login`
- **Jangan** mengandalkan sesi browser saja tanpa destroy di server.

### Ubah password

- Action: `change_password`
- Verifikasi password lama: `verifyUserPassword(session.email, oldPassword)` — **bukan** bandingkan hash manual secara ad-hoc di tempat lain.
- Password baru: `hashPassword` (SHA-256 + salt `|walzpay-v1`) lalu `updateUser`.
- Client (`AkunClient`): form `onSubmit`, tombol **tidak** di-disable hanya karena field kosong (validasi di submit + toast).

---

## 3. QRIS (wajib)

### Static upload
- Decode gambar → `isLikelyQris` → `parseQrisMeta` (merchant, city, postal, issuer, method, category, currency).
- Simpan lewat `/api/qris-static` dengan `setTenant` di **semua** method.
- UI preview: panel **QRIS Information** lengkap sebelum simpan.

### Dynamic generate
- `convertStaticToDynamic` di `lib/qris-convert.ts`:
  - Tag `01` → `12` (dynamic)
  - Tag `54` = nominal integer IDR (tanpa desimal)
  - Tag `53` = `360` jika belum ada
  - Drop `54/55/56/57/63` lama, rebuild + CRC16
  - Urutan tag canonical EMV
- Hasil harus bisa di-scan e-wallet (GoPay, OVO, DANA, ShopeePay, dll.) dengan nominal tetap.

### Bug yang sudah selesai (jangan diulang)
- QRIS sudah tersimpan tapi halaman Pesanan minta upload lagi → biasanya lupa `setTenant` di GET `/api/qris-static`.

---

## 4. Status transaksi (wajib)

Status resmi: `pending` | `success` | `expired` | `cancelled`

- Client: `effectiveStatus(order)` — jika `pending` dan `expiresAt <= now` → tampilkan **Kedaluwarsa**.
- Dashboard **Pending** hanya menghitung order pending yang **belum** expired.
- Riwayat & Pesanan menampilkan chip status asli, **bukan** selalu "Menunggu".

---

## 5. UI / layout (jangan diacak tanpa alasan)

- Liquid glass: `app/globals.css` + `app/extra.css`.
- Subtitle di bawah WALZPAY: class `.tagline` + animasi `tagline-in`, jarak topbar natural (`margin-bottom` ~18px).
- Dashboard hero: `.dash-hero` + grid 4 stat (Hari ini / Pending / Sukses / Semua) — **tanpa** offset manual cm.
- Password toggle login: **🙈** (sembunyi) / **🙉** (tampil).
- Loading sesi: `.session-loader` (cincin), bukan teks "Memeriksa sesi…".
- Toast: `pushBubble` dari `BubbleToasts` untuk **semua** aksi simpan/error penting.
- Bottom nav 4 tab; Setel hanya ikon pojok kanan atas.

---

## 6. Environment (production)

| Variabel | Fungsi |
|----------|--------|
| `UPSTASH_REDIS_REST_URL` | Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Redis |
| `WEBHOOK_SECRET` | Webhook HP |
| `GMAIL_USER` | Kirim OTP |
| `GMAIL_APP_PASSWORD` | Kirim OTP |

Tanpa Redis → API auth/data 503. Tanpa Gmail → OTP gagal kirim.

---

## 7. Aturan perbaikan ke depan

1. **Edit file yang ada** — jangan rewrite dari nol modul yang sudah stabil (auth, qris-convert, tenant, Orders/Riwayat status).
2. Sebelum ubah API store/signature: cari semua pemanggil (`listOrders`, `addPayment`, `setTenant`).
3. Setelah ubah auth/password/QRIS: uji manual checklist di bawah.
4. Jangan hapus `STABLE.md` atau melemahkan pola di §1–§5 tanpa mengganti checklist uji.

### Checklist uji cepat (wajib lulus)

- [ ] Register / login / OTP / logout (benar-benar keluar, tidak auto-masuk lagi)
- [ ] Ubah password (password lama salah ditolak; yang benar berhasil + toast)
- [ ] Upload QRIS → panel detail lengkap → simpan → muncul di Pesanan tanpa minta upload ulang
- [ ] Generate QRIS dinamis → scan e-wallet → nominal sesuai
- [ ] Status riwayat: Menunggu / Sukses / Kedaluwarsa / Dibatalkan benar
- [ ] Dashboard: Pending tidak menghitung order expired; 4 stat tampil
- [ ] Build Vercel: `next build` tanpa TypeScript error

---

*Baseline ini adalah titik aman. Perbaikan baru = cabang dari sini, bukan mengulang bug lama.*
