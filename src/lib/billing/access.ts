export type BillingAccess = {
  status?: string | null;
  payment_confirmed?: boolean | null;
  trial_ends_at?: string | null;
};

export function hasValidBillingAccess(billing: BillingAccess | null | undefined, now = Date.now()) {
  if (!billing) return false;
  if (billing.status === "active" && billing.payment_confirmed === true) return true;
  return billing.status === "trial" && Boolean(billing.trial_ends_at) && Date.parse(billing.trial_ends_at as string) > now;
}

export function sanitizeLoginNext(value: string | null | undefined, hasAccess: boolean) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  const parsed = new URL(value, "https://internal.kumo");
  const isCommercial = parsed.pathname === "/dashboard/configuracoes/upgrade" || parsed.searchParams.get("autocheckout") === "1";
  if (hasAccess && isCommercial) return "/dashboard";
  if (!hasAccess && parsed.pathname.startsWith("/dashboard") && !isCommercial) return "/dashboard/configuracoes/upgrade";
  return value;
}
