"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Bubble = {
  id: string;
  title: string;
  sub?: string;
  tone?: "ok" | "err" | "info";
};

let pushFn: ((b: Omit<Bubble, "id">) => void) | null = null;
let lastKey = "";
let lastAt = 0;

export function pushBubble(b: Omit<Bubble, "id">) {
  const key = `${b.tone || "info"}|${b.title}|${b.sub || ""}`;
  const now = Date.now();
  // prevent double / spam within 1.2s
  if (key === lastKey && now - lastAt < 1200) return;
  lastKey = key;
  lastAt = now;
  pushFn?.(b);
}

function IconOk() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function IconErr() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function toneIcon(tone?: string) {
  if (tone === "ok") return <IconOk />;
  if (tone === "err") return <IconErr />;
  return <IconInfo />;
}

export function BubbleToasts() {
  const [items, setItems] = useState<Bubble[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const push = useCallback((b: Omit<Bubble, "id">) => {
    const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => {
      // max 2 visible, drop oldest
      const next = [...prev, { ...b, id }];
      return next.slice(-2);
    });
    const t = window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, 3200);
    timers.current.set(id, t);
  }, []);

  useEffect(() => {
    pushFn = push;
    return () => {
      pushFn = null;
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    };
  }, [push]);

  return (
    <div className="bubble-stack" aria-live="polite">
      {items.map((b) => (
        <div key={b.id} className={`bubble-toast tone-${b.tone || "info"}`}>
          <div className="bubble-icon" aria-hidden>
            {toneIcon(b.tone)}
          </div>
          <div className="bubble-body">
            <strong>{b.title}</strong>
            {b.sub ? <span>{b.sub}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
