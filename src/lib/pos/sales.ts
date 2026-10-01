import { createClient } from "@/lib/supabase/client";
import type {
  CartItem,
  PaymentInput,
  POSCustomer,
  SaleItemInput,
  SaleResult,
} from "./types";

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getCartItemSubtotal(item: CartItem): number {
  return roundMoney(item.product.sale_price * item.quantity);
}

export function getCartItemDiscount(item: CartItem): number {
  const subtotal = getCartItemSubtotal(item);

  if (item.discountType === "percent") {
    return roundMoney(subtotal * Math.min(Math.max(item.discountValue, 0), 100) / 100);
  }

  if (item.discountType === "amount") {
    return roundMoney(Math.min(Math.max(item.discountValue, 0), subtotal));
  }

  return 0;
}

export function getCartItemTotal(item: CartItem): number {
  return roundMoney(
    Math.max(getCartItemSubtotal(item) - getCartItemDiscount(item), 0)
  );
}

export function getCartTotals(items: CartItem[], globalDiscount = 0) {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + getCartItemSubtotal(item), 0)
  );

  const itemDiscount = roundMoney(
    items.reduce((sum, item) => sum + getCartItemDiscount(item), 0)
  );

  const safeGlobalDiscount = roundMoney(
    Math.min(Math.max(globalDiscount, 0), Math.max(subtotal - itemDiscount, 0))
  );

  const total = roundMoney(
    Math.max(subtotal - itemDiscount - safeGlobalDiscount, 0)
  );

  return {
    subtotal,
    itemDiscount,
    globalDiscount: safeGlobalDiscount,
    discount: roundMoney(itemDiscount + safeGlobalDiscount),
    total,
  };
}

export function validatePayments(
  payments: PaymentInput[],
  total: number
): { ok: true; change: number } | { ok: false; message: string } {
  if (!payments.length) {
    return { ok: false, message: "Informe pelo menos uma forma de pagamento." };
  }

  const normalizedTotal = roundMoney(total);
  let paid = 0;
  let cashReceived = 0;

  for (const payment of payments) {
    const amount = roundMoney(Number(payment.amount));

    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Existe um pagamento com valor inválido." };
    }

    if (payment.method === "cash" && payment.receivedAmount !== undefined) {
      const received = roundMoney(Number(payment.receivedAmount));

      if (!Number.isFinite(received) || received < amount) {
        return { ok: false, message: "O valor recebido em dinheiro é insuficiente." };
      }

      cashReceived += received;
    }

    paid += amount;
  }

  const difference = roundMoney(normalizedTotal - paid);

  if (difference > 0.01) {
    return {
      ok: false,
      message: `Pagamento insuficiente. Faltam R$ ${difference.toFixed(2).replace(".", ",")}.`,
    };
  }

  if (difference < -0.01) {
    return {
      ok: false,
      message: "Os pagamentos não podem ultrapassar o total da venda.",
    };
  }

  const cashPayments = payments.filter((payment) => payment.method === "cash");
  const cashAmount = roundMoney(
    cashPayments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  );
  const hasCashReceived = cashPayments.some(
    (payment) => payment.receivedAmount !== undefined
  );
  const change = hasCashReceived
    ? roundMoney(Math.max(cashReceived - cashAmount, 0))
    : 0;

  return { ok: true, change };
}

function toSaleItems(items: CartItem[]): SaleItemInput[] {
  return items.map((item) => ({
    product_id: item.product.id,
    quantity: item.quantity,
    discount_type: item.discountType,
    discount_value: roundMoney(Math.max(item.discountValue, 0)),
  }));
}

export async function completePOSSale(params: {
  branchId: string;
  items: CartItem[];
  payments: PaymentInput[];
  customer?: POSCustomer | null;
  sellerUserId?: string | null;
  globalDiscount?: number;
}): Promise<SaleResult> {
  const totals = getCartTotals(params.items, params.globalDiscount ?? 0);

  if (!params.items.length) {
    throw new Error("Adicione pelo menos um produto à venda.");
  }

  const productIds = new Set<string>();

  for (const item of params.items) {
    if (productIds.has(item.product.id)) {
      throw new Error(
        "O produto \"" + item.product.name + "\" apareceu mais de uma vez no carrinho. " +
          "Concentre a quantidade em uma única linha."
      );
    }

    productIds.add(item.product.id);

    if (item.quantity <= 0) {
      throw new Error(`Quantidade inválida para ${item.product.name}.`);
    }

    if (item.quantity > item.product.stock_quantity) {
      throw new Error(`Estoque insuficiente para ${item.product.name}.`);
    }
  }

  const paymentValidation = validatePayments(params.payments, totals.total);

  if (!paymentValidation.ok) {
    throw new Error(paymentValidation.message);
  }

  const supabase = createClient();

  const { data, error } = await supabase.rpc("complete_sale", {
    p_branch_id: params.branchId,
    p_discount: totals.globalDiscount,
    p_items: toSaleItems(params.items),
    p_payments: params.payments.map((payment) => ({
      method: payment.method,
      amount: roundMoney(payment.amount),
    })),
    p_customer_id: params.customer?.id ?? null,
    p_seller_user_id: params.sellerUserId ?? null,
  });

  if (error) {
    throw new Error(mapSaleError(error.message));
  }

  if (!data) {
    throw new Error("A venda foi processada, mas o sistema não retornou o identificador.");
  }

  return {
    saleId: String(data),
    total: totals.total,
    subtotal: totals.subtotal,
    discount: totals.discount,
    change: paymentValidation.change,
  };
}

function mapSaleError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("cash_not_open")) {
    return "Não existe caixa aberto para esta filial.";
  }

  if (normalized.includes("product_not_found")) {
    return "Um dos produtos não está mais disponível.";
  }

  if (normalized.includes("product_not_available_in_branch")) {
    return "Um dos produtos não possui estoque configurado nesta filial.";
  }

  if (normalized.includes("insufficient_stock")) {
    const match = message.match(/insufficient_stock:([^"]+)/i);
    return match?.[1]
      ? `Estoque insuficiente para ${match[1]}.`
      : "Estoque insuficiente para um dos produtos.";
  }

  if (normalized.includes("invalid_item_discount")) {
    return "Existe um desconto de item inválido.";
  }

  if (normalized.includes("invalid_sale_discount")) {
    return "O desconto da venda não pode ultrapassar o valor disponível.";
  }

  if (normalized.includes("payment_total_mismatch")) {
    return "A soma dos pagamentos precisa ser exatamente igual ao total.";
  }

  if (normalized.includes("invalid_seller")) {
    return "O vendedor selecionado não pertence a esta empresa.";
  }

  if (normalized.includes("duplicate_product_line")) {
    return "O mesmo produto apareceu mais de uma vez na venda. Ajuste a quantidade em uma única linha.";
  }

  if (normalized.includes("invalid_customer")) {
    return "O cliente selecionado não pertence a esta empresa.";
  }

  return message;
}
