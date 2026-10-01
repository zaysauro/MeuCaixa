"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Smartphone } from "lucide-react";
import type { PaymentInput, PaymentMethod } from "@/lib/pos/types";
import { validatePayments } from "@/lib/pos/sales";

type Props = { total: number; onClose: () => void; onConfirm: (payments: PaymentInput[]) => void; };
const methods: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Dinheiro" }, { id: "pix", label: "PIX" }, { id: "debit_card", label: "Débito" }, { id: "credit_card", label: "Crédito" }, { id: "other", label: "Outro" },
];
const money = (value: number) => "R$ " + value.toFixed(2).replace(".", ",");

export default function PaymentModal({ total, onClose, onConfirm }: Props) {
  const [payments, setPayments] = useState<PaymentInput[]>([{ method: "pix", amount: total }]);
  const [cashReceived, setCashReceived] = useState(""); const [error, setError] = useState("");
  const paid = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0), [payments]);
  const remaining = Math.max(total - paid, 0);
  const change = useMemo(() => {
    const cash = payments.filter((p) => p.method === "cash").reduce((s, p) => s + Number(p.amount), 0);
    if (!cash || !cashReceived) return 0;
    return Math.max(Number(cashReceived.replace(",", ".")) - cash, 0);
  }, [payments, cashReceived]);

  useEffect(() => { const timer = window.setTimeout(() => document.getElementById("payment-amount-0")?.focus(), 0); return () => window.clearTimeout(timer); }, []);

  function chooseMethod(method: PaymentMethod) {
    if (payments.length === 1 && payments[0].amount === total && payments[0].method === "pix") { setPayments([{ method, amount: total }]); return; }
    setPayments((current) => [...current, { method, amount: Math.max(total - current.reduce((s, p) => s + Number(p.amount), 0), 0) }]);
  }

  function updateAmount(index: number, value: string) {
    const numeric = Number(value.replace(",", "."));
    setPayments((current) => current.map((payment, i) => i === index ? { ...payment, amount: Number.isFinite(numeric) ? numeric : 0 } : payment));
  }

  function confirm() {
    const normalized = payments.map((payment) => payment.method === "cash" && cashReceived ? { ...payment, receivedAmount: Number(cashReceived.replace(",", ".")) } : payment);
    const result = validatePayments(normalized, total);
    if (!result.ok) { setError(result.message); return; }
    onConfirm(normalized);
  }

  return (
    <div className="pos-modal-backdrop" onMouseDown={onClose}><div className="pos-modal payment-modal" onMouseDown={(event) => event.stopPropagation()}>
      <div className="pos-modal-header"><div><span className="eyebrow">PAGAMENTO · F9</span><h2>Finalizar venda</h2></div><button type="button" className="modal-close" onClick={onClose}>×</button></div>
      <div className="payment-total">{money(total)}</div>
      <div className="payment-methods">{methods.map((method) => <button key={method.id} type="button" onClick={() => chooseMethod(method.id)} className="payment-method">
        {method.id === "cash" ? <Banknote size={17} /> : method.id === "pix" ? <Smartphone size={17} /> : <CreditCard size={17} />}{method.label}
      </button>)}</div>
      <div className="payment-list">{payments.map((payment, index) => <div className="payment-row" key={index}><strong>{methods.find((m) => m.id === payment.method)?.label}</strong>
        <input id={"payment-amount-" + index} className="field payment-input" inputMode="decimal" value={String(payment.amount).replace(".", ",")} onChange={(event) => updateAmount(index, event.target.value)} /></div>)}</div>
      {payments.some((payment) => payment.method === "cash") && <label>Dinheiro recebido<input className="field" inputMode="decimal" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder="Ex.: 100,00" /></label>}
      <div className="payment-status"><div><span>Falta</span><strong>{money(remaining)}</strong></div><div><span>Troco</span><strong>{money(change)}</strong></div></div>
      {error && <div className="error">{error}</div>}
      <div className="actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="button" className="button primary" onClick={confirm}>Confirmar pagamento · Enter</button></div>
    </div></div>
  );
}
