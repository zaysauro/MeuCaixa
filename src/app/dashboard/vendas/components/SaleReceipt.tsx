"use client";

import type { SaleReceiptData } from "@/lib/receipt/types";
import {
  formatReceiptDate,
  formatReceiptMoney,
  formatSaleNumber,
  paymentMethodLabel,
} from "@/lib/receipt/receipt";

type Props = {
  receipt: SaleReceiptData;
  copyLabel?: "ORIGINAL" | "2ª VIA";
};

function joinAddress(receipt: SaleReceiptData) {
  const parts = [
    receipt.sale.address_line,
    receipt.sale.city,
    receipt.sale.state,
    receipt.sale.zip_code,
  ].filter(Boolean);

  return parts.join(" · ");
}

export default function SaleReceipt({
  receipt,
  copyLabel = "ORIGINAL",
}: Props) {
  const { sale, items, payments, settings } = receipt;
  const address = joinAddress(receipt);

  return (
    <article
      className={"receipt-print receipt-width-" + settings.width.replace("mm", "")}
      aria-label="Comprovante não fiscal"
    >
      <header className="receipt-header">
        {sale.organization_name && <strong className="receipt-store-name">{sale.organization_name}</strong>}
        {sale.branch_name && <div>{sale.branch_name}</div>}
        {sale.branch_code && <div>Unidade {sale.branch_code}</div>}
        {settings.show_address && address && <div>{address}</div>}
        {sale.phone && <div>{sale.phone}</div>}
      </header>

      <div className="receipt-divider" />

      {sale.status === "cancelled" && (
        <>
          <div className="receipt-cancelled">VENDA CANCELADA</div>
          <div className="receipt-divider" />
        </>
      )}

      <div className="receipt-copy-label">{copyLabel}</div>

      <div className="receipt-row">
        <span>Venda</span>
        <strong>#{formatSaleNumber(sale.sale_number)}</strong>
      </div>
      <div className="receipt-row">
        <span>Data</span>
        <span>{formatReceiptDate(sale.created_at)}</span>
      </div>

      <div className="receipt-divider" />

      <div className="receipt-items">
        {items.map((item) => (
          <div className="receipt-item" key={item.id}>
            <div className="receipt-item-name">{item.product_name}</div>
            <div className="receipt-row">
              <span>
                {item.quantity} × {formatReceiptMoney(item.unit_price)}
              </span>
              <strong>{formatReceiptMoney(item.total)}</strong>
            </div>
            {item.discount > 0 && (
              <div className="receipt-item-discount">
                Desconto: - {formatReceiptMoney(item.discount)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="receipt-divider" />

      <div className="receipt-row">
        <span>Subtotal</span>
        <span>{formatReceiptMoney(sale.subtotal)}</span>
      </div>
      <div className="receipt-row">
        <span>Descontos</span>
        <span>- {formatReceiptMoney(sale.discount)}</span>
      </div>
      <div className="receipt-row total">
        <span>TOTAL</span>
        <strong>{formatReceiptMoney(sale.total)}</strong>
      </div>

      <div className="receipt-divider" />

      <div className="receipt-section-title">PAGAMENTO</div>
      {payments.map((payment) => (
        <div className="receipt-payment" key={payment.id}>
          <div className="receipt-row">
            <span>{paymentMethodLabel(payment.method)}</span>
            <span>{formatReceiptMoney(payment.amount)}</span>
          </div>
          {payment.method === "cash" && payment.received_amount !== null && (
            <>
              <div className="receipt-row receipt-muted">
                <span>Recebido</span>
                <span>{formatReceiptMoney(payment.received_amount)}</span>
              </div>
              {payment.change_amount > 0 && (
                <div className="receipt-row">
                  <span>Troco</span>
                  <strong>{formatReceiptMoney(payment.change_amount)}</strong>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {settings.show_customer && sale.customer_name && (
        <>
          <div className="receipt-divider" />
          <div className="receipt-section-title">CLIENTE</div>
          <div>{sale.customer_name}</div>
          {sale.customer_document && <div>{sale.customer_document}</div>}
          {sale.customer_phone && <div>{sale.customer_phone}</div>}
        </>
      )}

      {settings.show_seller && sale.seller_name && (
        <>
          <div className="receipt-divider" />
          <div className="receipt-row">
            <span>Operador</span>
            <span>{sale.seller_name}</span>
          </div>
        </>
      )}

      <div className="receipt-divider" />

      <div className="receipt-kumo-signature">
        <div className="receipt-kumo-lockup"><img src="/kumo-logo.svg" alt="Kumo" /><div><strong>MEUCAIXA</strong><span>por Kumo</span></div></div>
        <div className="receipt-kumo-site">www.sistemakumo.com.br</div>
      </div>

      <div className="receipt-divider" />

      <footer className="receipt-footer">
        <div>{settings.footer_text || "Obrigado pela preferência!"}</div>
        <div className="receipt-muted">Documento sem valor fiscal</div>
      </footer>
    </article>
  );
}
