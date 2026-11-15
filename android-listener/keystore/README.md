# Release keystore

- `walzpay-release.jks.b64` — keystore release (base64) untuk CI & build lokal.
- Alias: `walzpay`
- Password store/key: lihat `keystore.properties.example` atau env CI.

## Decode lokal

```bash
base64 -d walzpay-release.jks.b64 > walzpay-release.jks
```

Jangan commit file `.jks` mentah jika repo publik (sudah cukup bentuk `.b64`).
Signature ini dipakai untuk update APK yang sama di perangkat pengguna.
