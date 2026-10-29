"use client";

import { useCallback, useEffect, useState } from "react";

export type Bubble = {
  id: string;
  title: string;
  sub?: string;
  tone?: "ok" | "err" | "info";
};

let pushFn: ((b: Omit<Bubble, "id">) => void) | null = null;

export function pushBubble(b: Omit<Bubble, "id">) {
  pushFn?.(b);
}

function toneIcon(tone?: string) {
  if (tone === "ok") return "✓";
  if (tone === "err") return "!";
  return "i";
}

export function BubbleToasts() {
  const [items, setItems] = useState<Bubble[]>([]);

  const push = useCallback((b: Omit<Bubble, "id">) => {
    const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-3), { ...b, id }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 3800);
  }, []);

  useEffect(() => {
    pushFn = push;
    return () => {
      pushFn = null;
    };
  }, [push]);

  return (
    <div className="bubble-stack" aria-live="polite">
      {items.map((b) => (
        <div
          key={b.id}
          className={`bubble-toast tone-${b.tone || "info"}`}
        >
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
