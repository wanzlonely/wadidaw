"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Bubble = {
  id: string;
  title: string;
  sub?: string;
  tone?: "ok" | "err" | "info";
  leaving?: boolean;
};

let pushFn: ((b: Omit<Bubble, "id">) => void) | null = null;
let lastKey = "";
let lastAt = 0;

export function pushBubble(b: Omit<Bubble, "id" | "leaving">) {
  const key = `${b.tone || "info"}|${b.title}|${b.sub || ""}`;
  const now = Date.now();
  if (key === lastKey && now - lastAt < 1400) return;
  lastKey = key;
  lastAt = now;
  pushFn?.(b);
}

function IconOk() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.18" />
      <path
        d="M7.5 12.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconErr() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.18" />
      <path
        d="M12 7.5v5.5M12 16.2h.01"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.18" />
      <path
        d="M12 11v5.5M12 7.8h.01"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function toneIcon(tone?: string) {
  if (tone === "ok") return <IconOk />;
  if (tone === "err") return <IconErr />;
  return <IconInfo />;
}

const VISIBLE_MS = 3400;
const EXIT_MS = 380;

export function BubbleToasts() {
  const [items, setItems] = useState<Bubble[]>([]);
  const timers = useRef<Map<string, number[]>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, leaving: true } : x))
    );
    const t = window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, EXIT_MS);
    const arr = timers.current.get(id) || [];
    arr.push(t);
    timers.current.set(id, arr);
  }, []);

  const push = useCallback(
    (b: Omit<Bubble, "id" | "leaving">) => {
      const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => {
        const next = [...prev, { ...b, id }];
        return next.slice(-2);
      });
      const t = window.setTimeout(() => dismiss(id), VISIBLE_MS);
      timers.current.set(id, [t]);
    },
    [dismiss]
  );

  useEffect(() => {
    pushFn = push;
    return () => {
      pushFn = null;
      timers.current.forEach((arr) => arr.forEach(clearTimeout));
      timers.current.clear();
    };
  }, [push]);

  return (
    <div className="bubble-stack" aria-live="polite">
      {items.map((b) => (
        <div
          key={b.id}
          className={`bubble-toast tone-${b.tone || "info"}${b.leaving ? " is-leaving" : ""}`}
          role="status"
        >
          <div className="bubble-icon" aria-hidden>
            {toneIcon(b.tone)}
          </div>
          <div className="bubble-body">
            <strong>{b.title}</strong>
            {b.sub ? <span>{b.sub}</span> : null}
          </div>
          <div className="bubble-progress" aria-hidden />
        </div>
      ))}
    </div>
  );
}
