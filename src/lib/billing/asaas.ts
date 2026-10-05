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
  customerData?: { name?: string | null; email?: string | null; cpfCnpj?: string | null };
}) {
  const customerData = Object.fromEntries(Object.entries(input.customerData ?? {}).filter(([, value]) => Boolean(value)));
  return asaasRequest<AsaasCheckout>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      billingTypes: ["PIX", "CREDIT_CARD"],
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
      ...(Object.keys(customerData).length ? { customerData } : {}),
      subscription: {
        cycle: "MONTHLY",
        nextDueDate: new Date(Date.now() + 86_400_000).toISOString().replace("T", " ").slice(0, 19),
      },
    }),
  });
}

export function calculateMonthlyPrice(branchCount: number, basePrice = 79.99, additionalBranchPrice = 50) {
  const additional = Math.max(0, Math.trunc(branchCount) - 1);
  return Number((basePrice + additional * additionalBranchPrice).toFixed(2));
}
