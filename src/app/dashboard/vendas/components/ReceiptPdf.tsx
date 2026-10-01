"use client";

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { SaleReceiptData } from "@/lib/receipt/types";
import {
  formatReceiptDate,
  formatReceiptMoney,
  formatSaleNumber,
  paymentMethodLabel,
} from "@/lib/receipt/receipt";

const styles = StyleSheet.create({
  page: {
    padding: 10,
    fontFamily: "Courier",
    fontSize: 8,
    color: "#111",
  },
  center: { textAlign: "center" },
  brand: { fontSize: 12, fontWeight: 700, marginBottom: 3 },
  small: { fontSize: 7 },
  divider: {
    borderBottomWidth: 1,
    borderBottomStyle: "dashed",
    borderBottomColor: "#111",
    marginVertical: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 5,
    marginVertical: 2,
  },
  item: { marginBottom: 5 },
  itemName: { fontWeight: 700, marginBottom: 2 },
  total: { fontSize: 10, fontWeight: 700, marginTop: 4 },
  cancelled: {
    textAlign: "center",
    borderWidth: 1,
    padding: 4,
    fontWeight: 700,
    marginBottom: 5,
  },
  title: { fontSize: 7, fontWeight: 700, marginBottom: 3 },
});

function address(data: SaleReceiptData) {
  return [
    data.sale.address_line,
    data.sale.city,
    data.sale.state,
    data.sale.zip_code,
  ].filter(Boolean).join(" · ");
}

function ReceiptPdfDocument({
  receipt,
  size,
  copyLabel,
}: {
  receipt: SaleReceiptData;
  size: "80mm" | "58mm" | "A4";
  copyLabel: "ORIGINAL" | "2ª VIA";
}) {
  const pageSize = size === "A4" ? "A4" : size === "80mm" ? [226.77, 1000] : [164.41, 1000];
  const a = address(receipt);

  return (
    <Document title={"Comprovante #" + formatSaleNumber(receipt.sale.sale_number)}>
      <Page size={pageSize as never} style={styles}>
        <View style={styles.center}>
          <Text style={styles.brand}>MEUCAIXA</Text>
          {receipt.sale.organization_name && <Text>{receipt.sale.organization_name}</Text>}
          {receipt.sale.branch_name && <Text>{receipt.sale.branch_name}</Text>}
          {receipt.sale.branch_code && <Text>Unidade {receipt.sale.branch_code}</Text>}
          {receipt.settings.show_address && a && <Text>{a}</Text>}
          {receipt.sale.phone && <Text>{receipt.sale.phone}</Text>}
        </View>

        <View style={styles.divider} />

        {receipt.sale.status === "cancelled" && (
          <Text style={styles.cancelled}>VENDA CANCELADA</Text>
        )}

        <Text style={[styles.center, styles.small]}>{copyLabel}</Text>
        <View style={styles.row}>
          <Text>Venda</Text>
          <Text>#{formatSaleNumber(receipt.sale.sale_number)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Data</Text>
          <Text>{formatReceiptDate(receipt.sale.created_at)}</Text>
        </View>

        <View style={styles.divider} />

        {receipt.items.map((item) => (
          <View style={styles.item} key={item.id}>
            <Text style={styles.itemName}>{item.product_name}</Text>
            <View style={styles.row}>
              <Text>{item.quantity} x {formatReceiptMoney(item.unit_price)}</Text>
              <Text>{formatReceiptMoney(item.total)}</Text>
            </View>
            {item.discount > 0 && (
              <Text style={styles.small}>
                Desconto: - {formatReceiptMoney(item.discount)}
              </Text>
            )}
          </View>
        ))}

        <View style={styles.divider} />
        <View style={styles.row}>
          <Text>Subtotal</Text>
          <Text>{formatReceiptMoney(receipt.sale.subtotal)}</Text>
        </View>
        <View style={styles.row}>
          <Text>Descontos</Text>
          <Text>- {formatReceiptMoney(receipt.sale.discount)}</Text>
        </View>
        <View style={[styles.row, styles.total]}>
          <Text>TOTAL</Text>
          <Text>{formatReceiptMoney(receipt.sale.total)}</Text>
        </View>

        <View style={styles.divider} />
        <Text style={styles.title}>PAGAMENTO</Text>
        {receipt.payments.map((payment) => (
          <View key={payment.id}>
            <View style={styles.row}>
              <Text>{paymentMethodLabel(payment.method)}</Text>
              <Text>{formatReceiptMoney(payment.amount)}</Text>
            </View>
            {payment.method === "cash" && payment.received_amount !== null && (
              <>
                <View style={styles.row}>
                  <Text>Recebido</Text>
                  <Text>{formatReceiptMoney(payment.received_amount)}</Text>
                </View>
                {payment.change_amount > 0 && (
                  <View style={styles.row}>
                    <Text>Troco</Text>
                    <Text>{formatReceiptMoney(payment.change_amount)}</Text>
                  </View>
                )}
              </>
            )}
          </View>
        ))}

        {receipt.settings.show_customer && receipt.sale.customer_name && (
          <>
            <View style={styles.divider} />
            <Text style={styles.title}>CLIENTE</Text>
            <Text>{receipt.sale.customer_name}</Text>
            {receipt.sale.customer_document && <Text>{receipt.sale.customer_document}</Text>}
            {receipt.sale.customer_phone && <Text>{receipt.sale.customer_phone}</Text>}
          </>
        )}

        {receipt.settings.show_seller && receipt.sale.seller_name && (
          <>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text>Operador</Text>
              <Text>{receipt.sale.seller_name}</Text>
            </View>
          </>
        )}

        <View style={styles.divider} />
        <Text style={styles.center}>{receipt.settings.footer_text || "Obrigado pela preferência!"}</Text>
        <Text style={[styles.center, styles.small]}>Documento sem valor fiscal</Text>
      </Page>
    </Document>
  );
}

export async function createReceiptPdf(
  receipt: SaleReceiptData,
  size: "80mm" | "58mm" | "A4",
  copyLabel: "ORIGINAL" | "2ª VIA" = "ORIGINAL"
): Promise<Blob> {
  return pdf(
    <ReceiptPdfDocument receipt={receipt} size={size} copyLabel={copyLabel} />
  ).toBlob();
}
