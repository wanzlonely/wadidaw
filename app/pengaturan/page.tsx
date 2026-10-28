import { Shell } from "@/components/Shell";

export default function PengaturanPage() {
  return (
    <Shell active="/pengaturan" subtitle="Setup · WA · DANA · arsitektur">
      <section className="glass">
        <h2>Batas website vs QRIS Hook</h2>
        <p>
          WALZPAY = dashboard + webhook + Redis + parser (lebih lengkap di sisi
          server). Membaca notifikasi Android hanya bisa dilakukan app native
          (QRIS Hook / forwarder). Website tidak bisa menggantikan Notification
          Listener di OS.
        </p>
      </section>

      <section className="glass">
        <h2>Uji WhatsApp (disarankan dulu)</h2>
        <p>
          1. Di Beranda WALZPAY tekan <strong>Uji notifikasi WhatsApp</strong> —
          cek parser + Redis + suara.
          <br />
          2. Untuk notifikasi WA sungguhan dari HP:
        </p>
        <ul className="ul">
          <li>
            QRIS Hook tidak punya parser WhatsApp bawaan → webhook tidak otomatis
            untuk package <code>com.whatsapp</code>.
          </li>
          <li>
            Opsi A: app <strong>Notification Forwarder</strong> / Tasker → POST
            JSON ke <code>/api/webhook</code> (title, text, packageName).
          </li>
          <li>
            Opsi B: QRIS Hook Mode Debug → pilih WhatsApp → tangkap payload →
            kirim ke kami / POST manual untuk rapikan parser.
          </li>
        </ul>
        <p className="muted" style={{ marginTop: 8 }}>
          Contoh body yang diterima:
        </p>
        <code className="code">
          {`{\n  "packageName": "com.whatsapp",\n  "title": "BCA",\n  "text": "Transfer masuk Rp25.000 dari BUDI",\n  "amount": 25000\n}`}
        </code>
      </section>

      <section className="glass">
        <h2>DANA Bisnis</h2>
        <p>
          Parser WALZPAY sudah mengenali <code>id.dana</code> / payload mirip
          QRIS Hook. QRIS Hook publik belum tentu punya merchant DANA — tanpa
          parser di HP, notifikasi tidak dikirim. Gunakan forwarder atau tunggu /
          minta parser merchant di QRIS Hook (Mode Debug + Minta dukungan).
        </p>
      </section>

      <section className="glass">
        <h2>Merchant bawaan QRIS Hook</h2>
        <p>Langsung bisa webhook jika Debug OFF:</p>
        <ul className="ul">
          <li>GoPay Merchant</li>
          <li>BRI Merchant</li>
          <li>InterActive QRIS</li>
        </ul>
      </section>

      <section className="glass">
        <h2>Endpoint</h2>
        <ul className="ul">
          <li>
            <code>POST /api/webhook</code>
          </li>
          <li>
            <code>POST /api/test</code> · body{" "}
            <code>{`{ "kind": "whatsapp" | "dana" | "default" }`}</code>
          </li>
          <li>
            <code>GET /api/payments</code> · <code>/api/health</code> ·{" "}
            <code>/api/logs</code>
          </li>
        </ul>
      </section>
    </Shell>
  );
}
