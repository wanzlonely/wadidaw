import tls from "tls";

const GMAIL_USER = process.env.GMAIL_USER || "stockwanz582@gmail.com";
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "vjhe xxfk lmpz ognr").replace(
  /\s+/g,
  ""
);

function encodeSubject(s: string) {
  return `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

/** Minimal SMTP (Gmail 465 SSL) — no external deps */
export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: "login" | "register" = "login"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const subject =
    purpose === "register"
      ? "Kode OTP Registrasi WALZPAY"
      : "Kode OTP Login WALZPAY";
  const body = [
    `Halo,`,
    ``,
    `Kode OTP ${purpose === "register" ? "registrasi" : "login"} WALZPAY Anda:`,
    ``,
    `    ${code}`,
    ``,
    `Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`,
    ``,
    `— WALZPAY`,
  ].join("\r\n");

  const raw = [
    `From: WALZPAY <${GMAIL_USER}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body,
  ].join("\r\n");

  try {
    await smtpSend(GMAIL_USER, GMAIL_APP_PASSWORD, to, raw);
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
