"use client";

import { useEffect, useRef, useState } from "react";

export function BillingCheckoutButton({ label = "Assinar agora", autoStart = false, initialBranches = 1, basePrice = 79.99, branchPrice = 50 }: { label?: string; autoStart?: boolean; initialBranches?: number; basePrice?: number; branchPrice?: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CREDIT_CARD" | "PIX" | "BOLETO">("CREDIT_CARD");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [branches, setBranches] = useState(Math.max(1, initialBranches));
  const [pixPayload, setPixPayload] = useState("");
  const started = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  async function start() {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentMethod, cpfCnpj, billingBranchCount: branches, idempotencyKey: idempotencyKey.current }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      if (response.ok && body.checkoutUrl) { window.location.assign(body.checkoutUrl); return; }
      if (response.ok && body.invoiceUrl) { window.location.assign(body.invoiceUrl); return; }
      if (response.ok && body.pix) { setPixPayload(body.pix.payload || ""); setError(""); return; }
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

  const total = basePrice + Math.max(0, branches - 1) * branchPrice;
  return <span className="billing-action">
    <div className="billing-methods" role="group" aria-label="Forma de pagamento">
      {([["CREDIT_CARD", "Cartão de crédito", "Cobrança automática mensal"], ["PIX", "Pix", "Pagamento mensal via Pix"], ["BOLETO", "Boleto bancário", "Pagamento mensal via boleto"]] as const).map(([value, title, description]) => <button key={value} type="button" className={paymentMethod === value ? "button secondary active" : "button secondary"} onClick={() => { setPaymentMethod(value); idempotencyKey.current = crypto.randomUUID(); }}><strong>{title}</strong><small>{description}</small></button>)}
    </div>
    <div className="billing-branch-selector"><span>Filiais adicionais</span><button type="button" aria-label="Reduzir filiais" onClick={() => { setBranches(value => Math.max(1, value - 1)); idempotencyKey.current = crypto.randomUUID(); }}>−</button><strong>{Math.max(0, branches - 1)}</strong><button type="button" aria-label="Adicionar filial" onClick={() => { setBranches(value => Math.min(100, value + 1)); idempotencyKey.current = crypto.randomUUID(); }}>+</button><span>Mensalidade: <strong>R$ {total.toFixed(2).replace(".", ",")}</strong></span></div>
    {paymentMethod !== "CREDIT_CARD" && <input className="field" value={cpfCnpj} onChange={event => setCpfCnpj(event.target.value)} placeholder="CPF ou CNPJ" inputMode="numeric" aria-label="CPF ou CNPJ" />}
    <button className="button primary" type="button" disabled={loading} onClick={() => void start()}>{loading ? "Abrindo pagamento seguro..." : label}</button>{pixPayload ? <div className="success"><strong>Pix gerado.</strong><br /><small>{pixPayload}</small></div> : null}{error ? <small className="error">{error}</small> : null}
  </span>;
}
