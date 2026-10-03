"use client";

import { useState } from "react";

export function BillingCheckoutButton({ label = "Assinar agora" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setLoading(true); setError("");
    const response = await fetch("/api/billing/checkout", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.url) window.location.assign(body.url);
    else setError(body.error || "Não foi possível iniciar a cobrança.");
    setLoading(false);
  }
  return <span className="billing-action"><button className="button primary" type="button" disabled={loading} onClick={() => void start()}>{loading ? "Abrindo cobrança..." : label}</button>{error ? <small className="error">{error}</small> : null}</span>;
}
