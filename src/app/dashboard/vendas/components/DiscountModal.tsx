"use client";

import { useEffect, useState } from "react";
import type { DiscountType } from "@/lib/pos/types";
import { parseBRLMoneyInput, parseLocalizedDecimalInput } from "@/lib/money";

type Props = { title: string; initialType: DiscountType; initialValue: number; maxAmount: number; onClose: () => void; onConfirm: (type: DiscountType, value: number) => void; };

export default function DiscountModal({ title, initialType, initialValue, maxAmount, onClose, onConfirm }: Props) {
  const [type, setType] = useState<DiscountType>(initialType);
  const [value, setValue] = useState(initialValue ? String(initialValue).replace(".", ",") : "");
  useEffect(() => { const timer = window.setTimeout(() => document.getElementById("discount-value")?.focus(), 0); return () => window.clearTimeout(timer); }, []);

  function confirm() {
    const numeric = type === "percent" ? parseLocalizedDecimalInput(value) : parseBRLMoneyInput(value);
    if (type === "none") { onConfirm("none", 0); return; }
    if (numeric === null || numeric < 0) return;
    if (type === "percent" && numeric > 100) return;
    if (type === "amount" && numeric > maxAmount) return;
    onConfirm(type, numeric);
  }

  return (
    <div className="pos-modal-backdrop" onMouseDown={onClose}><div className="pos-modal" onMouseDown={(event) => event.stopPropagation()}>
      <div className="pos-modal-header"><div><span className="eyebrow">DESCONTO</span><h2>{title}</h2></div><button type="button" className="modal-close" onClick={onClose}>×</button></div>
      <div className="discount-type-grid">
        <button type="button" className={type === "percent" ? "active" : ""} onClick={() => setType("percent")}>Percentual</button>
        <button type="button" className={type === "amount" ? "active" : ""} onClick={() => setType("amount")}>Valor</button>
        <button type="button" className={type === "none" ? "active" : ""} onClick={() => setType("none")}>Sem desconto</button>
      </div>
      {type !== "none" && <label>Valor<input id="discount-value" className="field" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") confirm(); if (event.key === "Escape") onClose(); }} /></label>}
      <div className="actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="button" className="button primary" onClick={confirm}>Aplicar</button></div>
    </div></div>
  );
}
