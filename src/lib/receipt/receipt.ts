import { createClient } from "@/lib/supabase/client";
import type { ReceiptLogType, SaleReceiptData } from "./types";

export { paymentMethodLabel } from "@/lib/presentation/labels";

export async function getSaleReceipt(saleId: string): Promise<SaleReceiptData> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_sale_receipt", {
    p_sale_id: saleId,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Comprovante não encontrado.");

  return data as SaleReceiptData;
}

export async function logReceiptAction(
  saleId: string,
  type: ReceiptLogType
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("log_receipt_action", {
    p_sale_id: saleId,
    p_type: type,
  });

  if (error) throw new Error(error.message);
}

export function formatSaleNumber(value: number): string {
  return String(value).padStart(6, "0");
}

export function formatReceiptDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatReceiptMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
