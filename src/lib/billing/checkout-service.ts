import { calculateMonthlyPriceCents, createAsaasCustomer, createDirectSubscription, createRecurringCheckout, findAsaasCustomer, findAsaasSubscription, getAsaasCheckoutUrl, getPixQrCode, listSubscriptionPayments, type AsaasPaymentMethod } from "@/lib/billing/asaas";

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;
type BillingInput = {
  admin: Admin;
  organization: { id: string; name: string; email?: string | null; base_monthly_price: number; additional_branch_price: number; included_branches: number; billing_branch_count: number };
  entitlement: Record<string, any>;
  userEmail?: string;
  paymentMethod: AsaasPaymentMethod;
  cpfCnpj?: string;
  billingBranchCount?: number;
  idempotencyKey: string;
  appUrl: string;
};

function attemptResponse(attempt: Record<string, any>) {
  if (attempt.response) return attempt.response;
  if (attempt.asaas_checkout_id) return { checkoutUrl: getAsaasCheckoutUrl({ id: String(attempt.asaas_checkout_id) }) };
  return { error: "Esta tentativa já está sendo processada. Aguarde alguns instantes." };
}

export async function startOrganizationBilling(input: BillingInput) {
  const { admin, organization, entitlement, paymentMethod, cpfCnpj, userEmail, idempotencyKey, appUrl } = input;
  const requestedBranches = input.billingBranchCount === undefined ? Number(organization.billing_branch_count) : Math.trunc(Number(input.billingBranchCount));
  if (!Number.isInteger(requestedBranches) || requestedBranches < Number(organization.included_branches) || requestedBranches > 100) throw new Error("Quantidade de filiais inválida.");
  const monthlyPrice = calculateMonthlyPriceCents(requestedBranches, Number(organization.base_monthly_price), Number(organization.additional_branch_price), Number(organization.included_branches)) / 100;
  await admin.from("organizations").update({ billing_branch_count: requestedBranches }).eq("id", organization.id);

  const { data: claimed, error: claimError } = await admin.from("billing_attempts").insert({ idempotency_key: idempotencyKey, organization_id: organization.id, payment_method: paymentMethod, status: "processing" }).select("*").maybeSingle();
  if (claimError?.code === "23505") {
    const { data: existing } = await admin.from("billing_attempts").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing?.organization_id !== organization.id || existing?.payment_method !== paymentMethod) throw new Error("Esta tentativa pertence a outra modalidade ou empresa.");
    if (existing.status === "completed" || existing.asaas_checkout_id || existing.asaas_payment_id) return attemptResponse(existing);
    if (existing.status === "processing" || existing.status === "payment_created") return attemptResponse(existing);
    const { data: retry } = await admin.from("billing_attempts").update({ status: "processing", updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey).eq("status", "failed").select("*").maybeSingle();
    if (!retry) throw new Error("Esta tentativa já está sendo processada. Aguarde alguns instantes.");
  } else if (claimError || !claimed) throw new Error("Não foi possível iniciar esta tentativa.");

  const externalReference = `meucaixa:${organization.id}:billing:${idempotencyKey}`;
  try {
    if (paymentMethod === "CREDIT_CARD") {
      const checkout = await createRecurringCheckout({ externalReference, value: monthlyPrice, successUrl: `${appUrl}/dashboard/configuracoes/upgrade?checkout=success`, cancelUrl: `${appUrl}/dashboard/configuracoes/upgrade?checkout=cancelled`, expiredUrl: `${appUrl}/dashboard/configuracoes/upgrade?checkout=expired` });
      const response = { checkoutUrl: getAsaasCheckoutUrl(checkout), checkoutId: checkout.id, paymentMethod };
      await admin.from("billing_attempts").update({ asaas_checkout_id: checkout.id, status: "completed", response, updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
      await admin.from("organization_entitlements").update({ asaas_checkout_id: checkout.id, payment_method: paymentMethod, status: entitlement.status === "trial" ? "trial" : "pending", payment_confirmed: false, updated_at: new Date().toISOString() }).eq("organization_id", organization.id);
      return response;
    }

    let customerId = entitlement.asaas_customer_id as string | null;
    if (!customerId) customerId = (await findAsaasCustomer(`meucaixa:${organization.id}`)).data?.[0]?.id || null;
    if (!customerId) customerId = (await createAsaasCustomer({ name: organization.name, email: organization.email || userEmail || "", cpfCnpj: cpfCnpj || "", externalReference: `meucaixa:${organization.id}` })).id;
    await admin.from("billing_attempts").update({ asaas_customer_id: customerId, updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    const existingSubscription = (await findAsaasSubscription(externalReference)).data?.[0];
    const subscription = existingSubscription || await createDirectSubscription({ customer: customerId, externalReference, value: monthlyPrice, billingType: paymentMethod });
    await admin.from("billing_attempts").update({ asaas_subscription_id: subscription.id, status: "payment_created", updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    const firstPayment = (await listSubscriptionPayments(subscription.id)).data?.[0];
    if (!firstPayment?.id) throw new Error("A cobrança inicial não foi criada pelo Asaas.");
    const pix = paymentMethod === "PIX" ? await getPixQrCode(firstPayment.id) : null;
    const response = { paymentMethod, paymentId: firstPayment.id, subscriptionId: subscription.id, invoiceUrl: firstPayment.invoiceUrl || firstPayment.bankSlipUrl || null, pix, statusUrl: `${appUrl}/dashboard/configuracoes/upgrade` };
    await admin.from("billing_attempts").update({ asaas_payment_id: firstPayment.id, status: "completed", response, updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    await admin.from("organization_entitlements").update({ asaas_customer_id: customerId, asaas_subscription_id: subscription.id, payment_method: paymentMethod, status: "pending", payment_confirmed: false, updated_at: new Date().toISOString() }).eq("organization_id", organization.id);
    await admin.from("billing_payments").upsert({ asaas_payment_id: firstPayment.id, asaas_subscription_id: subscription.id, asaas_customer_id: customerId, organization_id: organization.id, status: firstPayment.status || "PENDING", value: firstPayment.value || monthlyPrice, billing_type: paymentMethod, due_date: firstPayment.dueDate || null, invoice_url: firstPayment.invoiceUrl || firstPayment.bankSlipUrl || null, payload: firstPayment, updated_at: new Date().toISOString() }, { onConflict: "asaas_payment_id" });
    return response;
  } catch (error) {
    await admin.from("billing_attempts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("idempotency_key", idempotencyKey);
    throw error;
  }
}
