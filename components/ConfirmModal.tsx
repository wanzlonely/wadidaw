"use client";

import { useEffect } from "react";

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Hapus",
  cancelLabel = "Batal",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-backdrop" onClick={busy ? undefined : onCancel} />
      <div className="confirm-sheet glass card-v2">
        <div className={`confirm-icon ${danger ? "is-danger" : "is-info"}`} aria-hidden>
          {danger ? (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M3 6h18" strokeLinecap="round" />
              <path d="M8 6V4h8v2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 11v6M14 11v6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4" strokeLinecap="round" />
              <path d="M12 16h.01" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <h3 id="confirm-title" className="confirm-title">
          {title}
        </h3>
        <p className="confirm-msg">{message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost btn-press confirm-btn" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-press confirm-btn ${danger ? "confirm-btn-danger" : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
