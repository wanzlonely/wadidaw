/** Bridge ke app Android (WebView). Di browser biasa semua false / no-op. */

declare global {
  interface Window {
    WalzAndroid?: {
      isApp: () => boolean;
      getStatusJson: () => string;
      openNotificationAccess: () => void;
      openBattery: () => void;
      openAutostart: () => void;
      openOverlay: () => void;
      openShizuku: () => void;
      openPackagePicker: () => void;
      toggleListener: () => void;
      saveListener: () => void;
      requestPostNotifications: () => void;
      setApiKey: (key: string) => void;
      setWebhookUrl: (url: string) => void;
      setWebhookSecret: (secret: string) => void;
    };
    __WALZ_APP__?: boolean;
  }
}

export function isWalzApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.__WALZ_APP__ || window.WalzAndroid?.isApp?.());
  } catch {
    return false;
  }
}

export type AndroidStatus = {
  notification: boolean;
  battery: boolean;
  overlay: boolean;
  listener: boolean;
  shizuku: string;
  packages: number;
  push?: boolean;
};

export function getAndroidStatus(): AndroidStatus | null {
  try {
    const raw = window.WalzAndroid?.getStatusJson?.();
    if (!raw) return null;
    return JSON.parse(raw) as AndroidStatus;
  } catch {
    return null;
  }
}

export function androidCall(
  fn: keyof NonNullable<Window["WalzAndroid"]>
): boolean {
  const api = typeof window !== "undefined" ? window.WalzAndroid : undefined;
  if (!api || typeof api[fn] !== "function") return false;
  try {
    // @ts-expect-error dynamic call
    api[fn]();
    return true;
  } catch {
    return false;
  }
}
