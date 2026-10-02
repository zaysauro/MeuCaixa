"use client";

import { UserRound, UserRoundCheck } from "lucide-react";
import type { POSCustomer } from "@/lib/pos/types";

type Props = {
  subtotal: number;
  discount: number;
  total: number;
  customer: POSCustomer | null;
  sellerName: string;
  onCustomer: () => void;
  onSeller: () => void;
  onDiscount: () => void;
};

const money = (value: number) => "R$ " + value.toFixed(2).replace(".", ",");

export default function SaleSummary({
  subtotal,
  discount,
  total,
  customer,
  sellerName,
  onCustomer,
  onSeller,
  onDiscount,
}: Props) {
  return (
    <aside className="pos-summary">
      <div className="pos-summary-section">
        <div className="pos-summary-label">CLIENTE</div>

        <button
          type="button"
          className="pos-customer-button"
          onClick={onCustomer}
        >
          {customer ? <UserRoundCheck size={17} /> : <UserRound size={17} />}
          <span>
            <strong>{customer?.name ?? "Consumidor final"}</strong>
            <small>
              {customer?.document ?? "F4 para selecionar cliente"}
            </small>
          </span>
        </button>
      </div>

      <div className="pos-summary-section">
        <div className="pos-summary-label">VENDEDOR</div>

        <button
          type="button"
          className="pos-seller-button"
          onClick={onSeller}
        >
          {sellerName}
        </button>
      </div>

      <div className="pos-totals">
        <div>
          <span>Subtotal</span>
          <strong>{money(subtotal)}</strong>
        </div>

        <div>
          <span>Descontos</span>
          <button type="button" onClick={onDiscount}>
            {money(discount)}
          </button>
        </div>

        <div className="grand-total">
          <span>Total</span>
          <strong>{money(total)}</strong>
        </div>
      </div>
    </aside>
  );
}
