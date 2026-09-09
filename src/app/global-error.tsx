"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#050505", color: "#f8fafc", padding: 24 }}>
          <section style={{ width: "100%", maxWidth: 520, border: "1px solid rgba(255,159,28,.35)", borderRadius: 8, padding: 28, background: "rgba(15,23,42,.72)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#ff9f1c", fontWeight: 800 }}>
              <AlertTriangle size={20} />
              Fly Logistics recovered a system error
            </div>
            <p style={{ marginTop: 14, color: "#cbd5e1", lineHeight: 1.6 }}>
              The platform could not render this view. Please retry the request.
            </p>
            {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>Error reference: {error.digest}</p>}
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 6, background: "#ff9f1c", color: "#111827", padding: "10px 14px", fontWeight: 800 }}
            >
              <RotateCcw size={16} />
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
