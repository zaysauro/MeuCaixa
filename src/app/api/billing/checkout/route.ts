import { NextResponse } from "next/server";
import { calculateMonthlyPrice, createRecurringCheckout, getAsaasCheckoutUrl } from "@/lib/billing/asaas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidBillingAccess } from "@/lib/billing/access";
import { getPublicSiteUrl } from "@/lib/site-url";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: org } = await supabase.rpc("get_my_organization");
  const current = org?.[0];
  if (!current || !["owner", "admin"].includes(String(current.role))) {
    return NextResponse.json({ error: "Sem permissão para contratar." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: entitlement, error: entitlementError } = await admin
    .from("organization_entitlements")
    .select("*")
    .eq("organization_id", current.organization_id)
    .single();
  if (entitlementError || !entitlement) {
    console.error("billing checkout unavailable: entitlement is missing or invalid", {
      organizationId: current.organization_id,
      code: entitlementError?.code,
    });
    return NextResponse.json({ error: "Não foi possível iniciar a regularização automática desta assinatura. Fale com o suporte para regularizar o acesso." }, { status: 503 });
  }
  if (hasValidBillingAccess(entitlement)) {
    console.info("checkout skipped: organization already has access", { organizationId: current.organization_id, status: entitlement.status });
    return NextResponse.json({ error: "Esta assinatura já está ativa." }, { status: 409 });
  }
  if (entitlement.status === "pending" && entitlement.asaas_checkout_id) {
    return NextResponse.json({ url: getAsaasCheckoutUrl({ id: entitlement.asaas_checkout_id }) });
  }

  const { data: organization } = await admin
    .from("organizations")
    .select("base_monthly_price,additional_branch_price")
    .eq("id", current.organization_id)
    .single();
  if (!organization) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const { count: branchCount } = await admin
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", current.organization_id)
    .eq("active", true);

  const monthlyPrice = calculateMonthlyPrice(
    branchCount ?? 1,
    Number(organization.base_monthly_price ?? 79.99),
    Number(organization.additional_branch_price ?? 50)
  );

  const siteUrl = getPublicSiteUrl(request.url);
  try {
    const checkout = await createRecurringCheckout({
      externalReference: current.organization_id,
      value: monthlyPrice,
      successUrl: `${siteUrl}/dashboard/configuracoes/upgrade?checkout=success`,
      cancelUrl: `${siteUrl}/dashboard/configuracoes/upgrade?checkout=cancelled`,
      expiredUrl: `${siteUrl}/dashboard/configuracoes/upgrade?checkout=expired`,
    });

    const checkoutUrl = getAsaasCheckoutUrl(checkout);

    await admin.from("organization_entitlements").update({
      asaas_checkout_id: checkout.id,
      status: entitlement.status === "trial" ? "trial" : "pending",
      payment_confirmed: false,
      cancel_at_period_end: false,
      canceled_at: null,
      access_until: null,
    }).eq("organization_id", current.organization_id);

    return NextResponse.json({ url: checkoutUrl, checkoutId: checkout.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a cobrança.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
