import { NextResponse } from "next/server";
import { calculateMonthlyPriceCents, createAsaasCustomer, createDirectSubscription, createRecurringCheckout, findAsaasCustomer, findAsaasSubscription, getAsaasCheckoutUrl, getPixQrCode, isValidCpfCnpj, listSubscriptionPayments, type AsaasPaymentMethod } from "@/lib/billing/asaas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasValidBillingAccess } from "@/lib/billing/access";
import { getPublicSiteUrl } from "@/lib/site-url";

type CheckoutBody = { paymentMethod?: AsaasPaymentMethod; cpfCnpj?: string; billingBranchCount?: number; idempotencyKey?: string };

function responseForAttempt(attempt: Record<string, any>) {
  if (attempt.response) return attempt.response;
  if (attempt.asaas_checkout_id) return { checkoutUrl: getAsaasCheckoutUrl({ id: String(attempt.asaas_checkout_id) }) };
  return { error: "Esta tentativa já está sendo processada. Aguarde alguns instantes." };
}

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
  const { data: organization } = await admin.from("organizations").select("name,email,base_monthly_price,additional_branch_price,included_branches,billing_branch_count").eq("id", current.organization_id).single();
  if (!organization) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const requestedBranches = body?.billingBranchCount === undefined ? Number(organization.billing_branch_count) : Math.trunc(Number(body.billingBranchCount));
  if (!Number.isInteger(requestedBranches) || requestedBranches < Number(organization.included_branches) || requestedBranches > 100) return NextResponse.json({ error: "Quantidade de filiais inválida." }, { status: 400 });
  const monthlyPrice = calculateMonthlyPriceCents(requestedBranches, Number(organization.base_monthly_price), Number(organization.additional_branch_price), Number(organization.included_branches)) / 100;
  await admin.from("organizations").update({ billing_branch_count: requestedBranches }).eq("id", current.organization_id);

  const { data: claimed, error: claimError } = await admin.from("billing_attempts").insert({ idempotency_key: idempotencyKey, organization_id: current.organization_id, payment_method: paymentMethod, status: "processing" }).select("*").maybeSingle();
  if (claimError?.code === "23505") {
    const { data: existing } = await admin.from("billing_attempts").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing?.organization_id !== current.organization_id || existing?.payment_method !== paymentMethod) return NextResponse.json({ error: "Esta tentativa pertence a outra modalidade ou empresa." }, { status: 409 });
    if (existing.status === "completed" || existing.asaas_checkout_id || existing.asaas_payment_id) return NextResponse.json(responseForAttempt(existing));
    if (existing.status === "processing" || existing.status === "payment_created") return NextResponse.json(responseForAttempt(existing), { status: 409 });
    const { data: retry } = await admin.from("billing_attempts").update({ status: "processing", updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey).eq("status", "failed").select("*").maybeSingle();
    if (!retry) return NextResponse.json({ error: "Esta tentativa já está sendo processada. Aguarde alguns instantes." }, { status: 409 });
  } else if (claimError || !claimed) return NextResponse.json({ error: "Não foi possível iniciar esta tentativa." }, { status: 409 });

  const externalReference = `meucaixa:${current.organization_id}:billing:${idempotencyKey}`;
  const appUrl = getPublicSiteUrl(request.url).replace(/\/$/, "");
  try {
    if (paymentMethod === "CREDIT_CARD") {
      const checkout = await createRecurringCheckout({ externalReference, value: monthlyPrice, successUrl: `${appUrl}/dashboard/configuracoes/upgrade?checkout=success`, cancelUrl: `${appUrl}/dashboard/configuracoes/upgrade?checkout=cancelled`, expiredUrl: `${appUrl}/dashboard/configuracoes/upgrade?checkout=expired` });
      const response = { checkoutUrl: getAsaasCheckoutUrl(checkout), checkoutId: checkout.id, paymentMethod };
      await admin.from("billing_attempts").update({ asaas_checkout_id: checkout.id, status: "completed", response, updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
      await admin.from("organization_entitlements").update({ asaas_checkout_id: checkout.id, payment_method: paymentMethod, status: entitlement.status === "trial" ? "trial" : "pending", payment_confirmed: false, updated_at: new Date().toISOString() }).eq("organization_id", current.organization_id);
      return NextResponse.json(response);
    }

    let customerId = entitlement.asaas_customer_id as string | null;
    if (!customerId) customerId = (await findAsaasCustomer(`meucaixa:${current.organization_id}`)).data?.[0]?.id || null;
    if (!customerId) customerId = (await createAsaasCustomer({ name: organization.name, email: organization.email || user.email || "", cpfCnpj, externalReference: `meucaixa:${current.organization_id}` })).id;
    await admin.from("billing_attempts").update({ asaas_customer_id: customerId, updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    const existingSubscription = (await findAsaasSubscription(externalReference)).data?.[0];
    const subscription = existingSubscription || await createDirectSubscription({ customer: customerId, externalReference, value: monthlyPrice, billingType: paymentMethod });
    await admin.from("billing_attempts").update({ asaas_subscription_id: subscription.id, status: "payment_created", updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    const firstPayment = (await listSubscriptionPayments(subscription.id)).data?.[0];
    if (!firstPayment?.id) throw new Error("A cobrança inicial não foi criada pelo Asaas.");
    const pix = paymentMethod === "PIX" ? await getPixQrCode(firstPayment.id) : null;
    const response = { paymentMethod, paymentId: firstPayment.id, subscriptionId: subscription.id, invoiceUrl: firstPayment.invoiceUrl || firstPayment.bankSlipUrl || null, pix, statusUrl: `${appUrl}/dashboard/configuracoes/upgrade` };
    await admin.from("billing_attempts").update({ asaas_payment_id: firstPayment.id, status: "completed", response, updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    await admin.from("organization_entitlements").update({ asaas_customer_id: customerId, asaas_subscription_id: subscription.id, payment_method: paymentMethod, status: "pending", payment_confirmed: false, updated_at: new Date().toISOString() }).eq("organization_id", current.organization_id);
    await admin.from("billing_payments").upsert({ asaas_payment_id: firstPayment.id, asaas_subscription_id: subscription.id, asaas_customer_id: customerId, organization_id: current.organization_id, status: firstPayment.status || "PENDING", value: firstPayment.value || monthlyPrice, billing_type: paymentMethod, due_date: firstPayment.dueDate || null, invoice_url: firstPayment.invoiceUrl || firstPayment.bankSlipUrl || null, payload: firstPayment, updated_at: new Date().toISOString() }, { onConflict: "asaas_payment_id" });
    return NextResponse.json(response);
  } catch (error) {
    await admin.from("billing_attempts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível iniciar a assinatura." }, { status: 502 });
  }
}
