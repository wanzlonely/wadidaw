/**
 * Client-side QR decode from image file.
 * Uses BarcodeDetector when available, else jsQR from CDN.
 */

type JsQRFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number
) => { data: string } | null;

let jsQRCache: JsQRFn | null = null;

async function loadJsQR(): Promise<JsQRFn> {
  if (jsQRCache) return jsQRCache;
  try {
    const mod = await import("jsqr");
    jsQRCache = (mod.default || mod) as JsQRFn;
    return jsQRCache;
  } catch {
    /* fall through to CDN */
  }
  await new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Browser only"));
      return;
    }
    const w = window as unknown as { jsQR?: JsQRFn };
    if (w.jsQR) {
      jsQRCache = w.jsQR;
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
    s.onload = () => {
      jsQRCache = w.jsQR || null;
      if (jsQRCache) resolve();
      else reject(new Error("jsQR gagal dimuat"));
    };
    s.onerror = () => reject(new Error("Gagal memuat decoder QR"));
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

/** Decode QR payload from image file. Returns EMVCo string or throws. */
export async function decodeQrisFromImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar (PNG/JPG)");
  }
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const max = 1200;
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (w > max || h > max) {
    const scale = max / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak tersedia");
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

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
      const codes = await detector.detect(canvas);
      if (codes[0]?.rawValue) return codes[0].rawValue.trim();
    }
  } catch {
    /* ignore */
  }

  const jsQR = await loadJsQR();
  const result = jsQR(imageData.data, imageData.width, imageData.height);
  if (!result?.data) {
    throw new Error(
      "QR tidak terdeteksi. Pastikan foto jelas, terang, dan berisi QRIS."
    );
  }
  return result.data.trim();
}
