const API_BASE = process.env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

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
      console.error("Asaas request failed", { path, status: response.status });
      throw new AsaasError(response.status, "Não foi possível processar a cobrança agora.");
    }
    return body as T;
  } catch (error) {
    if (error instanceof AsaasError) throw error;
    console.error("Asaas request error", { path });
    throw new AsaasError(502, "O serviço de cobrança está indisponível.");
  } finally { clearTimeout(timeout); }
}

export type AsaasCustomer = { id: string };
export type AsaasSubscription = { id: string; invoiceUrl?: string; status?: string; billingType?: string; nextDueDate?: string };

export function createAsaasCustomer(input: { name: string; cpfCnpj?: string | null; email?: string | null; externalReference: string }) {
  return asaasRequest<AsaasCustomer>("/customers", { method: "POST", body: JSON.stringify(input) });
}

export function findAsaasSubscriptions(externalReference: string) {
  return asaasRequest<{ data: AsaasSubscription[] }>(`/subscriptions?externalReference=${encodeURIComponent(externalReference)}&includeDeleted=false`);
}

export function createAsaasSubscription(input: { customer: string; externalReference: string }) {
  return asaasRequest<AsaasSubscription>("/subscriptions", { method: "POST", body: JSON.stringify({ ...input, billingType: "UNDEFINED", value: 79.99, cycle: "MONTHLY", nextDueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), description: "Assinatura MeuCaixa" }) });
}
