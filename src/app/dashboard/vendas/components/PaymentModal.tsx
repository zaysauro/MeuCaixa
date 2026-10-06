"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Smartphone, X } from "lucide-react";
import type { PaymentInput, PaymentMethod } from "@/lib/pos/types";
import { validatePayments } from "@/lib/pos/sales";
import { formatBRL, formatMoneyInput, parseBRLMoneyInput } from "@/lib/money";

type Props = { total: number; onClose: () => void; onConfirm: (payments: PaymentInput[]) => void; };
const methods: Array<{ id: PaymentMethod; label: string }> = [
  { id: "cash", label: "Dinheiro" }, { id: "pix", label: "PIX" }, { id: "debit_card", label: "Débito" }, { id: "credit_card", label: "Crédito" }, { id: "other", label: "Outro" },
];
const money = (value: number) => formatBRL(value);

export default function PaymentModal({ total, onClose, onConfirm }: Props) {
  const [payments, setPayments] = useState<PaymentInput[]>([{ method: "pix", amount: total }]);
  const [cashReceived, setCashReceived] = useState(""); const [error, setError] = useState("");
  const paid = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0), [payments]);
  const remaining = Math.max(total - paid, 0);
  const change = useMemo(() => {
    const cash = payments.filter((p) => p.method === "cash").reduce((s, p) => s + Number(p.amount), 0);
    if (!cash || !cashReceived) return 0;
    return Math.max((parseBRLMoneyInput(cashReceived) ?? 0) - cash, 0);
  }, [payments, cashReceived]);

  useEffect(() => { const timer = window.setTimeout(() => document.getElementById("payment-amount-0")?.focus(), 0); return () => window.clearTimeout(timer); }, []);

  function chooseMethod(method: PaymentMethod) {
    setError("");
    if (payments.some((payment) => payment.method === method)) return;
    if (payments.length === 1 && payments[0].amount === total && payments[0].method === "pix") { setPayments([{ method, amount: total }]); return; }
    setPayments((current) => [...current, { method, amount: Math.max(total - current.reduce((s, p) => s + Number(p.amount), 0), 0) }]);
  }

  function removePayment(index: number) {
    setError("");
    setPayments((current) => {
      const removed = current[index];
      const next = current.filter((_, i) => i !== index);
      if (removed?.method === "cash") setCashReceived("");
      if (!next.length) return [];
      const paidNow = next.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const missing = Math.max(total - paidNow, 0);
      if (missing > 0) {
        const last = next.length - 1;
        return next.map((payment, i) => i === last ? { ...payment, amount: Number(payment.amount || 0) + missing } : payment);
      }
      return next;
    });
  }

  function updateAmount(index: number, value: string) {
    const numeric = parseBRLMoneyInput(value);
    setPayments((current) => current.map((payment, i) => i === index ? { ...payment, amount: numeric ?? 0 } : payment));
  }

  function confirm() {
    const activePayments = payments.filter((payment) => Number(payment.amount || 0) > 0);
    if (!activePayments.length) { setError("Adicione uma forma de pagamento."); return; }
    const received = cashReceived ? parseBRLMoneyInput(cashReceived) : null;
    if (payments.some((payment) => payment.method === "cash") && (received === null || received === undefined)) { setError("Informe um valor recebido válido."); return; }
    const normalized = activePayments.map((payment) => payment.method === "cash" && received !== null && received !== undefined ? { ...payment, receivedAmount: received } : payment);
    const result = validatePayments(normalized, total);
    if (!result.ok) { setError(result.message); return; }
    onConfirm(normalized);
  }

  return (
    <div className="pos-modal-backdrop" onMouseDown={onClose}><div className="pos-modal payment-modal" onMouseDown={(event) => event.stopPropagation()}>
      <div className="pos-modal-header"><div><span className="eyebrow">PAGAMENTO · F9</span><h2>Finalizar venda</h2></div><button type="button" className="modal-close" onClick={onClose}>×</button></div>
      <div className="payment-total">{money(total)}</div>
      <div className="payment-methods">{methods.map((method) => <button key={method.id} type="button" onClick={() => chooseMethod(method.id)} className={"payment-method "+(payments.some((payment)=>payment.method===method.id)?"payment-method-selected":"")}>
        {method.id === "cash" ? <Banknote size={17} /> : method.id === "pix" ? <Smartphone size={17} /> : <CreditCard size={17} />}{method.label}
      </button>)}</div>
      <div className="payment-list">{payments.map((payment, index) => <div className="payment-row" key={index}><strong>{methods.find((m) => m.id === payment.method)?.label}</strong>
        <input id={"payment-amount-" + index} className="field payment-input" inputMode="decimal" value={formatMoneyInput(payment.amount)} onChange={(event) => updateAmount(index, event.target.value)} />
        <button type="button" className="payment-remove" onClick={()=>removePayment(index)} aria-label={"Remover pagamento "+(methods.find((m)=>m.id===payment.method)?.label??"")} title="Remover forma de pagamento"><X size={16}/></button></div>)}</div>
      {payments.some((payment) => payment.method === "cash") && <label>Dinheiro recebido<input className="field" inputMode="decimal" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} placeholder="Ex.: 100,00" /></label>}
      <div className="payment-status"><div><span>Falta</span><strong>{money(remaining)}</strong></div><div><span>Troco</span><strong>{money(change)}</strong></div></div>
      {error && <div className="error">{error}</div>}
      <div className="actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button type="button" className="button primary" onClick={confirm}>Confirmar pagamento · Enter</button></div>
    </div></div>
  );
}
