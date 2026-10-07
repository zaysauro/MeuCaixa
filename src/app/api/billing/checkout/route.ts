import { NextResponse } from "next/server";
import { isValidCpfCnpj, type AsaasPaymentMethod } from "@/lib/billing/asaas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidBillingAccess } from "@/lib/billing/access";
import { getPublicSiteUrl } from "@/lib/site-url";
import { startOrganizationBilling } from "@/lib/billing/checkout-service";

type CheckoutBody = { paymentMethod?: AsaasPaymentMethod; cpfCnpj?: string; billingBranchCount?: number; idempotencyKey?: string };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as CheckoutBody | null;
  const paymentMethod = body?.paymentMethod === "PIX" || body?.paymentMethod === "BOLETO" ? body.paymentMethod : "CREDIT_CARD";
  const idempotencyKey = String(body?.idempotencyKey || "").trim();
  const cpfCnpj = String(body?.cpfCnpj || "").replace(/\D/g, "");
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return NextResponse.json({ error: "Não foi possível identificar esta tentativa. Recarregue a página e tente novamente." }, { status: 400 });
  if (paymentMethod !== "CREDIT_CARD" && !isValidCpfCnpj(cpfCnpj)) return NextResponse.json({ error: "Informe um CPF ou CNPJ válido para Pix ou boleto." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: org } = await supabase.rpc("get_my_organization");
  const current = org?.[0];
  if (!current || !["owner", "admin"].includes(String(current.role))) return NextResponse.json({ error: "Sem permissão para contratar." }, { status: 403 });

  const admin = createAdminClient();
  const { data: entitlement, error: entitlementError } = await admin.from("organization_entitlements").select("*").eq("organization_id", current.organization_id).single();
  if (entitlementError || !entitlement) return NextResponse.json({ error: "Status de cobrança indisponível." }, { status: 503 });
  if (hasValidBillingAccess(entitlement)) return NextResponse.json({ error: "Esta assinatura já está ativa." }, { status: 409 });
  const { data: organization } = await admin.from("organizations").select("id,name,email,base_monthly_price,additional_branch_price,included_branches,billing_branch_count").eq("id", current.organization_id).single();
  if (!organization) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  try {
    const response = await startOrganizationBilling({ admin, organization, entitlement, userEmail: user.email || undefined, paymentMethod, cpfCnpj, billingBranchCount: body?.billingBranchCount, idempotencyKey, appUrl: getPublicSiteUrl(request.url).replace(/\/$/, "") });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a assinatura.";
    const status = message.includes("inválida") || message.includes("tentativa") ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
