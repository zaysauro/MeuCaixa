"use client";

import { useState } from "react";

export function CancelSubscriptionButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function cancel() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/billing/cancel", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || "Não foi possível cancelar a assinatura."); return; }
      setMessage(body.accessUntil ? `Cancelamento confirmado. Seu acesso permanece até ${new Intl.DateTimeFormat("pt-BR").format(new Date(body.accessUntil))}.` : "Cancelamento confirmado.");
      setOpen(false);
    } catch { setError("Não foi possível concluir o cancelamento agora."); }
    finally { setBusy(false); }
  }
  return <>
    <button className="button secondary" type="button" onClick={() => setOpen(true)}>Cancelar assinatura</button>
    {message && <small className="success" style={{ display: "block", marginTop: 10 }}>{message}</small>}
    {open && <div className="modal-backdrop" role="presentation" onMouseDown={() => !busy && setOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="cancel-title" onMouseDown={event => event.stopPropagation()}>
      <div className="modal-header"><div><span className="eyebrow">ASSINATURA</span><h2 id="cancel-title">Cancelar assinatura?</h2></div><button className="icon-btn" type="button" onClick={() => setOpen(false)} disabled={busy}>×</button></div>
      <p>Novas cobranças não serão geradas. O acesso continua disponível até o fim do período já pago. O cancelamento não exclui sua empresa nem seus dados.</p>
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      <div className="modal-actions"><button className="button secondary" type="button" onClick={() => setOpen(false)} disabled={busy}>Continuar com minha assinatura</button><button className="button danger" type="button" onClick={() => void cancel()} disabled={busy}>{busy ? "Cancelando..." : "Confirmar cancelamento"}</button></div>
    </div></div>}
  </>;
}
