import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRecurringCheckout, getAsaasCheckoutUrl } from "@/lib/billing/asaas";
import { getPublicSiteUrl } from "@/lib/site-url";

type SubscribeSignupBody = { userId?: string; email?: string; company?: string; acceptedTerms?: boolean };

function normalizeCompanyName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as SubscribeSignupBody | null;
  const userId = String(body?.userId || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const company = String(body?.company || "").trim();
  const acceptedTerms = body?.acceptedTerms === true;

  if (!userId || !email || !company || !acceptedTerms) {
    return NextResponse.json({ error: "Dados de assinatura incompletos." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  const user = userData?.user;
  if (userError || !user || user.email?.toLowerCase() !== email) {
    return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 400 });
  }

  const metadata = user.user_metadata ?? {};
  const metadataAllowsSubscription = metadata.signup_mode === "subscribe" && normalizeCompanyName(metadata.company_name) === normalizeCompanyName(company);
  const createdAt = Date.parse(user.created_at);
  const recentlyCreated = Number.isFinite(createdAt) && Date.now() - createdAt >= 0 && Date.now() - createdAt <= 15 * 60 * 1000;
  if (!metadataAllowsSubscription && !recentlyCreated) {
    console.error("subscribe-signup rejected", {
      hasSignupMode: typeof metadata.signup_mode === "string",
      hasCompanyName: typeof metadata.company_name === "string",
      recentlyCreated,
    });
    return NextResponse.json({ error: "Cadastro não autorizado para assinatura." }, { status: 403 });
  }

  const { data: prepared, error: prepareError } = await admin.rpc("prepare_paid_signup", {
    p_user_id: user.id,
    p_company_name: company,
    p_email: email,
  });
  const organizationId = prepared?.[0]?.organization_id;
  if (prepareError || !organizationId) {
    console.error("prepare_paid_signup failed", {
      code: prepareError?.code,
      details: prepareError?.details,
      hint: prepareError?.hint,
      message: prepareError?.message,
    });
    return NextResponse.json({ error: "Não foi possível preparar sua assinatura." }, { status: 500 });
  }
  await admin.from("legal_acceptances").upsert({ user_id: user.id, organization_id: organizationId, terms_version: "2026-10-06", privacy_version: "2026-10-06", source: "paid_signup" }, { onConflict: "user_id,terms_version,privacy_version" });

  const { data: entitlement } = await admin.from("organization_entitlements").select("status,asaas_checkout_id").eq("organization_id", organizationId).maybeSingle();
  if (entitlement?.status === "pending" && entitlement.asaas_checkout_id) {
    return NextResponse.json({ url: getAsaasCheckoutUrl({ id: entitlement.asaas_checkout_id }) });
  }

  const siteUrl = getPublicSiteUrl(request.url);
  try {
    const checkout = await createRecurringCheckout({
      externalReference: organizationId,
      value: 79.99,
      successUrl: `${siteUrl}/login?payment=success`,
      cancelUrl: `${siteUrl}/cadastro?mode=subscribe&checkout=cancelled`,
      expiredUrl: `${siteUrl}/cadastro?mode=subscribe&checkout=expired`,
    });
    const { error: entitlementError } = await admin.from("organization_entitlements").update({ asaas_checkout_id: checkout.id, status: "pending", payment_confirmed: false }).eq("organization_id", organizationId);
    if (entitlementError) return NextResponse.json({ error: "Não foi possível salvar o checkout." }, { status: 500 });
    return NextResponse.json({ url: getAsaasCheckoutUrl(checkout), checkoutId: checkout.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a cobrança.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
