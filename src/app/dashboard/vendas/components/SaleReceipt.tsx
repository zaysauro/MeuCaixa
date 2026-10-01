"use client";

import type { PaymentInput } from "@/lib/pos/types";
type Props = { saleId: string; total: number; subtotal: number; discount: number; payments: PaymentInput[]; change: number; companyName: string; branchName: string; };
const money = (value: number) => "R$ " + value.toFixed(2).replace(".", ",");
export default function SaleReceipt({ saleId, total, subtotal, discount, payments, change, companyName, branchName }: Props) {
  return <div className="receipt-print">
    <div className="receipt-brand">{companyName}</div><div>{branchName}</div><div className="receipt-divider" />
    <div className="receipt-row"><span>Venda</span><strong>#{saleId.slice(0, 8).toUpperCase()}</strong></div>
    <div className="receipt-row"><span>Data</span><span>{new Date().toLocaleString("pt-BR")}</span></div><div className="receipt-divider" />
    <div className="receipt-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
    <div className="receipt-row"><span>Descontos</span><span>- {money(discount)}</span></div>
    <div className="receipt-row total"><span>TOTAL</span><strong>{money(total)}</strong></div><div className="receipt-divider" />
    {payments.map((payment, index) => <div className="receipt-row" key={index}><span>{payment.method}</span><span>{money(payment.amount)}</span></div>)}
    {change > 0 && <div className="receipt-row"><span>Troco</span><strong>{money(change)}</strong></div>}
    <div className="receipt-divider" /><div className="receipt-center">Obrigado pela preferência.</div><div className="receipt-center receipt-muted">Documento não fiscal</div>
  </div>;
}
