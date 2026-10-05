import { NextResponse } from "next/server";
import { calculateMonthlyPrice, createAsaasCustomer, createAsaasSubscription, findAsaasSubscriptions } from "@/lib/billing/asaas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: org } = await supabase.rpc("get_my_organization");
  const current = org?.[0];
  if (!current || !["owner", "admin"].includes(String(current.role))) return NextResponse.json({ error: "Sem permissão para contratar." }, { status: 403 });

  const admin = createAdminClient();
  const { data: entitlement, error: entitlementError } = await admin.from("organization_entitlements").select("*").eq("organization_id", current.organization_id).single();
  if (entitlementError) return NextResponse.json({ error: "Status de cobrança indisponível." }, { status: 500 });
  if (entitlement.asaas_subscription_id && ["active", "pending"].includes(entitlement.status)) return NextResponse.json({ error: "Já existe uma assinatura em andamento." }, { status: 409 });
  const { data: organization } = await admin.from("organizations").select("name,legal_name,document,email,base_monthly_price,additional_branch_price").eq("id", current.organization_id).single();
  if (!organization) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const { count: branchCount } = await admin.from("branches").select("id", { count: "exact", head: true }).eq("organization_id", current.organization_id).eq("active", true);
  const monthlyPrice = calculateMonthlyPrice(branchCount ?? 1, Number(organization.base_monthly_price ?? 79.99), Number(organization.additional_branch_price ?? 50));

  try {
    const existing = (await findAsaasSubscriptions(current.organization_id)).data.find((item) => ["ACTIVE", "PENDING"].includes(String(item.status)));
    if (existing) {
      await admin.from("organization_entitlements").update({ asaas_subscription_id: existing.id, status: "pending", payment_confirmed: false, current_period_end: existing.nextDueDate ?? null }).eq("organization_id", current.organization_id);
      return NextResponse.json({ url: existing.invoiceUrl ?? null });
    }
    const customer = entitlement.asaas_customer_id ? { id: entitlement.asaas_customer_id } : await createAsaasCustomer({ name: organization.legal_name || organization.name, cpfCnpj: organization.document, email: organization.email || user.email, externalReference: current.organization_id });
    const subscription = await createAsaasSubscription({ customer: customer.id, externalReference: current.organization_id, value: monthlyPrice });
    await admin.from("organization_entitlements").update({ asaas_customer_id: customer.id, asaas_subscription_id: subscription.id, status: "pending", payment_confirmed: false, current_period_end: subscription.nextDueDate ?? null }).eq("organization_id", current.organization_id);
    return NextResponse.json({ url: subscription.invoiceUrl ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a cobrança.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
