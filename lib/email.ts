import tls from "tls";

/**
 * Gmail SMTP for OTP — credentials ONLY from environment variables.
 * Never hardcode secrets in source.
 *
 * Required on Vercel / .env.local:
 *   GMAIL_USER=you@gmail.com
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   (Google App Password, spaces ok)
 */
function getGmailCreds(): { user: string; pass: string } | null {
  const user = (process.env.GMAIL_USER || "").trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  if (!user || !pass) return null;
  return { user, pass };
}

function encodeSubject(s: string) {
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function buildOtpHtml(code: string, purpose: "login" | "register"): string {
  const label = purpose === "register" ? "registrasi" : "login";
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>OTP WALZPAY</title>
</head>
<body style="margin:0;padding:0;background:#0b1020;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1020;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:420px;border-radius:24px;overflow:hidden;background:linear-gradient(165deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05));border:1px solid rgba(255,255,255,0.18);">
          <tr>
            <td style="padding:28px 28px 8px;text-align:center;">
              <div style="display:inline-block;width:52px;height:52px;line-height:52px;border-radius:16px;background:linear-gradient(145deg,#eaf4ff,#7eb8ff);color:#0a1220;font-weight:700;font-size:22px;">W</div>
              <h1 style="margin:14px 0 4px;font-size:22px;letter-spacing:-0.03em;color:#ffffff;">WALZPAY</h1>
              <p style="margin:0;font-size:13px;color:rgba(200,210,230,0.7);text-transform:uppercase;letter-spacing:0.12em;">Kode OTP ${label}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:rgba(235,240,255,0.85);text-align:center;">
                Halo! Gunakan kode berikut untuk ${label} akun Anda.
              </p>
              <div style="text-align:center;padding:18px 12px;border-radius:18px;background:rgba(0,0,0,0.35);border:1px solid rgba(174,212,255,0.25);">
                <span style="font-size:32px;font-weight:700;letter-spacing:0.35em;color:#a8d4ff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</span>
              </div>
              <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:rgba(200,210,230,0.65);text-align:center;">
                Berlaku <strong style="color:#7ee0c8;">5 menit</strong>. Jangan bagikan kode ini kepada siapa pun.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:rgba(200,210,230,0.45);">— WALZPAY</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOtpText(code: string, purpose: "login" | "register"): string {
  const label = purpose === "register" ? "registrasi" : "login";
  return [
    `Halo,`,
    ``,
    `Kode OTP ${label} WALZPAY Anda:`,
    ``,
    `  ${code}`,
    ``,
    `Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`,
    ``,
    `— WALZPAY`,
  ].join("\r\n");
}

/** Minimal SMTP (Gmail 465 SSL) — no external deps */
export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: "login" | "register" = "login"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const creds = getGmailCreds();
  if (!creds) {
    return {
      ok: false,
      error:
        "GMAIL_USER / GMAIL_APP_PASSWORD belum di-set di environment (Vercel / .env.local)",
    };
  }

  const subject =
    purpose === "register"
      ? "Kode OTP Registrasi WALZPAY"
      : "Kode OTP Login WALZPAY";

  const boundary = `walz_${Date.now().toString(36)}`;
  const text = buildOtpText(code, purpose);
  const html = buildOtpHtml(code, purpose);

  const raw = [
    `From: WALZPAY <${creds.user}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  try {
    await smtpSend(creds.user, creds.pass, to, raw);
    return { ok: true };
  } catch (e) {
    console.error("[email]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function smtpSend(
  user: string,
  pass: string,
  to: string,
  rawMessage: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: "smtp.gmail.com",
        port: 465,
        servername: "smtp.gmail.com",
        rejectUnauthorized: true,
      },
      () => {
        let buf = "";
        let step = 0;
        const lines = [
          `EHLO walzpay.local`,
          `AUTH LOGIN`,
          Buffer.from(user).toString("base64"),
          Buffer.from(pass).toString("base64"),
          `MAIL FROM:<${user}>`,
          `RCPT TO:<${to}>`,
          `DATA`,
          rawMessage + "\r\n.",
          `QUIT`,
        ];

        const writeNext = () => {
          if (step >= lines.length) return;
          socket.write(lines[step] + "\r\n");
          step++;
        };

        socket.on("data", (chunk) => {
          buf += chunk.toString("utf8");
          const parts = buf.split(/\r?\n/);
          buf = parts.pop() || "";
          for (const line of parts) {
            if (!line) continue;
            const code = parseInt(line.slice(0, 3), 10);
            if (line.length >= 4 && line[3] === "-") continue;
            if (Number.isNaN(code)) continue;
            if (code >= 400) {
              socket.destroy();
              reject(new Error(`SMTP ${code}: ${line}`));
              return;
            }
            if (step < lines.length) {
              writeNext();
            }
            if (code === 221 || (step >= lines.length && code >= 200 && code < 400)) {
              socket.end();
              resolve();
            }
          }
        });

        socket.on("error", reject);
        socket.on("end", () => resolve());
      }
    );
    socket.setTimeout(20000, () => {
      socket.destroy();
      reject(new Error("SMTP timeout"));
    });
  });
}
