const API_BASE = (process.env.ASAAS_BASE_URL || (process.env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3")).replace(/\/$/, "");

export class AsaasError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

async function asaasRequest<T>(path: string, init: RequestInit = {}) {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new AsaasError(503, "Cobrança não configurada.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", access_token: key, ...(init.headers ?? {}) },
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Asaas request failed", { path, status: response.status, body });
      const description = Array.isArray((body as { errors?: { description?: string }[] })?.errors)
        ? (body as { errors: { description?: string }[] }).errors.map((item) => item.description).filter(Boolean).join(" ")
        : "";
      throw new AsaasError(response.status, description || "Não foi possível processar a cobrança agora.");
    }
    return body as T;
  } catch (error) {
    if (error instanceof AsaasError) throw error;
    console.error("Asaas request error", { path, error });
    throw new AsaasError(502, "O serviço de cobrança está indisponível.");
  } finally { clearTimeout(timeout); }
}

export function cancelAsaasSubscription(subscriptionId: string) {
  return asaasRequest<{ id?: string }>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
}

export type AsaasCheckout = {
  id: string;
  link?: string;
  status?: string;
  externalReference?: string;
};

export function getAsaasCheckoutUrl(checkout: AsaasCheckout) {
  const host = API_BASE.includes("sandbox") ? "sandbox.asaas.com" : "asaas.com";
  return (
    checkout.link ||
    `https://${host}/checkoutSession/show?id=${encodeURIComponent(checkout.id)}`
  );
}

export function createRecurringCheckout(input: {
  externalReference: string;
  value: number;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
}) {
  return asaasRequest<AsaasCheckout>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      // Asaas only supports credit card for RECURRENT checkouts. PIX requires DETACHED.
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 60,
      externalReference: input.externalReference,
      callback: {
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiredUrl: input.expiredUrl,
      },
      items: [{
        name: "Assinatura MeuCaixa",
        description: "Plano mensal MeuCaixa",
        quantity: 1,
        value: input.value,
      }],
      subscription: {
        cycle: "MONTHLY",
        nextDueDate: new Date(Date.now() + 86_400_000).toISOString().replace("T", " ").slice(0, 19),
      },
    }),
  });
}

export type AsaasPaymentMethod = "CREDIT_CARD" | "PIX" | "BOLETO";
export type AsaasCustomer = { id: string };
export type AsaasSubscription = { id: string; customer?: string; billingType?: string; nextDueDate?: string };
export type AsaasPayment = { id: string; status?: string; billingType?: string; invoiceUrl?: string; bankSlipUrl?: string; dueDate?: string; value?: number; subscription?: string; customer?: string };

export function calculateMonthlyPriceCents(
  contractedBranches: number,
  basePrice = 79.99,
  additionalBranchPrice = 50,
  includedBranches = 1,
) {
  const toCents = (value: number) => Math.round(value * 100);
  const additional = Math.max(0, Math.trunc(contractedBranches) - Math.trunc(includedBranches));
  return toCents(basePrice) + additional * toCents(additionalBranchPrice);
}

export function calculateMonthlyPrice(branchCount: number, basePrice = 79.99, additionalBranchPrice = 50, includedBranches = 1) {
  return calculateMonthlyPriceCents(branchCount, basePrice, additionalBranchPrice, includedBranches) / 100;
}

export function normalizeDocument(value: string) { return value.replace(/\D/g, ""); }

export function isValidCpfCnpj(value: string) {
  const document = normalizeDocument(value);
  if (/^(\d)\1+$/.test(document)) return false;
  if (document.length === 11) {
    const check = (length: number) => {
      let sum = 0;
      for (let index = 0; index < length; index += 1) sum += Number(document[index]) * (length + 1 - index);
      const digit = (sum * 10) % 11;
      return digit === 10 ? 0 : digit;
    };
    return check(9) === Number(document[9]) && check(10) === Number(document[10]);
  }
  if (document.length === 14) {
    const check = (length: number) => {
      const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = weights.reduce((total, weight, index) => total + Number(document[index]) * weight, 0);
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return check(12) === Number(document[12]) && check(13) === Number(document[13]);
  }
  return false;
}

export function createAsaasCustomer(input: { name: string; email: string; cpfCnpj: string; externalReference: string }) {
  return asaasRequest<AsaasCustomer>("/customers", { method: "POST", body: JSON.stringify(input) });
}

export function findAsaasCustomer(externalReference: string) {
  return asaasRequest<{ data?: AsaasCustomer[] }>(`/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`);
}

export function createDirectSubscription(input: { customer: string; externalReference: string; value: number; billingType: Exclude<AsaasPaymentMethod, "CREDIT_CARD"> }) {
  return asaasRequest<AsaasSubscription>("/subscriptions", { method: "POST", body: JSON.stringify({
    customer: input.customer, billingType: input.billingType, value: input.value, cycle: "MONTHLY",
    nextDueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    description: "Assinatura mensal MeuCaixa", externalReference: input.externalReference,
  }) });
}

export function listSubscriptionPayments(subscriptionId: string) {
  return asaasRequest<{ data?: AsaasPayment[] }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=1`);
}

export function getPixQrCode(paymentId: string) {
  return asaasRequest<{ encodedImage?: string; payload?: string; expirationDate?: string }>(`/payments/${encodeURIComponent(paymentId)}/pixQrCode`);
}

export function findAsaasSubscription(externalReference: string) {
  return asaasRequest<{ data?: AsaasSubscription[] }>(`/subscriptions?externalReference=${encodeURIComponent(externalReference)}&limit=1`);
}
