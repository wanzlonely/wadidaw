"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";

type Log = {
  id: string;
  at: string;
  level: string;
  message: string;
  payload?: unknown;
};

export function DebugClient() {
  const [logs, setLogs] = useState<Log[]>([]);

  async function load() {
    const res = await fetch("/api/logs");
    const data = await res.json();
    setLogs(data.logs ?? []);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function clear() {
    await fetch("/api/logs", { method: "DELETE" });
    load();
  }

  return (
    <>
      <section className="glass">
        <h2>Debug logs</h2>
        <p>Payload webhook mentah & status forward (auto-refresh).</p>
        <button type="button" className="btn btn-ghost" onClick={clear}>
          Bersihkan log
        </button>
      </section>
      {logs.length === 0 ? (
        <section className="glass">
          <p className="empty">Log kosong</p>
        </section>
      ) : (
        logs.map((l) => (
          <section key={l.id} className="glass">
            <p>
              <span className={`badge level-${l.level}`}>{l.level}</span>{" "}
              <span className="muted">{formatTime(l.at)}</span>
            </p>
            <p style={{ marginTop: 8 }}>{l.message}</p>
            {l.payload != null ? (
              <pre className="code" style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(l.payload, null, 2)}
              </pre>
            ) : null}
          </section>
        ))
      )}
    </>
  );
}
