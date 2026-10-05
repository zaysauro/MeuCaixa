"use client";

import { useEffect, useRef, useState } from "react";

export function BillingCheckoutButton({ label = "Assinar agora", autoStart = false }: { label?: string; autoStart?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);

  async function start() {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setError(body.error || "Não foi possível iniciar a cobrança.");
    } catch {
      setError("Não foi possível iniciar a cobrança.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void start();
  }, [autoStart]);

  return <span className="billing-action"><button className="button primary" type="button" disabled={loading} onClick={() => void start()}>{loading ? "Abrindo pagamento seguro..." : label}</button>{error ? <small className="error">{error}</small> : null}</span>;
}
