/**
 * Client-side QR decode from image file.
 * BarcodeDetector (native) → jsQR (CDN) with multi-scale + invert fallback.
 */

type JsQRFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: string }
) => { data: string } | null;

let jsQRCache: JsQRFn | null = null;

async function loadJsQR(): Promise<JsQRFn> {
  if (jsQRCache) return jsQRCache;
  if (typeof window === "undefined") {
    throw new Error("Decode QR hanya di browser");
  }
  const w = window as unknown as { jsQR?: JsQRFn };
  if (w.jsQR) {
    jsQRCache = w.jsQR;
    return jsQRCache;
  }
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-jsqr="1"]');
    if (existing) {
      // script already injected — wait a tick for global
      const t0 = Date.now();
      const poll = () => {
        if (w.jsQR) {
          jsQRCache = w.jsQR;
          resolve();
        } else if (Date.now() - t0 > 8000) {
          reject(new Error("Decoder QR timeout"));
        } else {
          setTimeout(poll, 50);
        }
      };
      poll();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
    s.async = true;
    s.dataset.jsqr = "1";
    s.onload = () => {
      jsQRCache = w.jsQR || null;
      if (jsQRCache) resolve();
      else reject(new Error("Decoder QR gagal dimuat"));
    };
    s.onerror = () =>
      reject(new Error("Gagal memuat decoder QR. Cek koneksi lalu coba lagi."));
    document.head.appendChild(s);
  });
  return jsQRCache!;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gambar tidak bisa dibaca"));
    };
    img.src = url;
  });
}

function drawScaled(
  img: HTMLImageElement,
  maxSide: number
): { data: ImageData; canvas: HTMLCanvasElement } {
  const canvas = document.createElement("canvas");
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (w > maxSide || h > maxSide) {
    const scale = maxSide / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  // Ensure minimum size for tiny images
  if (w < 200 && h < 200) {
    const scale = 400 / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h), canvas };
}

function invertImageData(src: ImageData): ImageData {
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const d = out.data;
  for (let i = 0; i < s.length; i += 4) {
    d[i] = 255 - s[i];
    d[i + 1] = 255 - s[i + 1];
    d[i + 2] = 255 - s[i + 2];
    d[i + 3] = s[i + 3];
  }
  return out;
}

/** Decode QR payload from image file. Returns EMVCo string or throws. */
export async function decodeQrisFromImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/") && file.type !== "") {
    // some Android pickers leave type empty
    if (!/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || "")) {
      throw new Error("File harus berupa gambar (PNG/JPG)");
    }
  }
  const img = await loadImage(file);

  // 1) Native BarcodeDetector (fast on supported browsers / Android WebView)
  try {
    const BD = (
      window as unknown as {
        BarcodeDetector?: new (opts: {
          formats: string[];
        }) => {
          detect: (
            src: ImageBitmapSource
          ) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;
    if (BD) {
      const detector = new BD({ formats: ["qr_code"] });
      for (const max of [1600, 1000, 700]) {
        const { canvas } = drawScaled(img, max);
        const codes = await detector.detect(canvas);
        if (codes[0]?.rawValue) return codes[0].rawValue.trim();
      }
    }
  } catch {
    /* ignore */
  }

  // 2) jsQR with multiple scales + invert
  const jsQR = await loadJsQR();
  for (const max of [1400, 900, 600]) {
    const { data } = drawScaled(img, max);
    const attempts: Array<{ data: ImageData; mode: string }> = [
      { data, mode: "attemptBoth" },
      { data: invertImageData(data), mode: "attemptBoth" },
    ];
    for (const a of attempts) {
      try {
        const result = jsQR(a.data.data, a.data.width, a.data.height, {
          inversionAttempts: a.mode,
        });
        if (result?.data) return result.data.trim();
      } catch {
        /* try next */
      }
    }
  }

  throw new Error(
    "QR tidak terdeteksi. Pastikan foto jelas, terang, dan berisi QRIS."
  );
}

/** Strip domains / URLs from error text shown to users (privacy). */
export function sanitizePublicError(msg: string): string {
  return String(msg || "")
    .replace(/https?:\/\/[^\s]+/gi, "[server]")
    .replace(/[\w.-]+\.vercel\.app/gi, "[server]")
    .replace(/walzpaynew/gi, "app")
    .trim() || "Terjadi kesalahan";
}
