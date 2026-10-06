export type BillingAccess = {
  status?: string | null;
  payment_confirmed?: boolean | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  grace_until?: string | null;
  cancel_at_period_end?: boolean | null;
  access_until?: string | null;
};

export function hasValidBillingAccess(billing: BillingAccess | null | undefined, now = Date.now()) {
  if (!billing) return false;
  const isFuture = (value?: string | null) => !value || Date.parse(value) > now;

  if (billing.status === "trial") {
    return Boolean(billing.trial_ends_at) && isFuture(billing.trial_ends_at);
  }

  if (billing.status === "active" && billing.payment_confirmed === true) {
    return isFuture(billing.access_until) && isFuture(billing.current_period_end);
  }

  if ((billing.status === "canceled" || billing.status === "cancelled") && billing.cancel_at_period_end) {
    const accessUntil = billing.access_until || billing.current_period_end;
    return Boolean(accessUntil) && isFuture(accessUntil);
  }

  return billing.status === "past_due" && Boolean(billing.grace_until) && isFuture(billing.grace_until);
}

export function sanitizeLoginNext(value: string | null | undefined, hasAccess: boolean) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  const parsed = new URL(value, "https://internal.kumo");
  const isCommercial = parsed.pathname === "/dashboard/configuracoes/upgrade" || parsed.searchParams.get("autocheckout") === "1";
  if (hasAccess && isCommercial) return "/dashboard";
  if (!hasAccess && parsed.pathname.startsWith("/dashboard") && !isCommercial) return "/dashboard/configuracoes/upgrade";
  return value;
}
