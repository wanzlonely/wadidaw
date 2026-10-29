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

export function BubbleToasts() {
  const [items, setItems] = useState<Bubble[]>([]);

  const push = useCallback((b: Omit<Bubble, "id">) => {
    const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-4), { ...b, id }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  useEffect(() => {
    pushFn = push;
    return () => {
      pushFn = null;
    };
  }, [push]);

  return (
    <div className="bubble-stack" aria-live="polite">
      {items.map((b, i) => (
        <div
          key={b.id}
          className={`bubble-toast tone-${b.tone || "info"}`}
          style={{ animationDelay: `${i * 0.05}s` }}
        >
          <div className="bubble-dot" />
          <div className="bubble-body">
            <strong>{b.title}</strong>
            {b.sub ? <span>{b.sub}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
