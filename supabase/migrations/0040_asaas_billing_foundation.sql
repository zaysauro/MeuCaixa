BEGIN;

ALTER TABLE public.organization_entitlements
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS grace_until timestamptz;

ALTER TABLE public.organization_entitlements DROP CONSTRAINT IF EXISTS organization_entitlements_status_check;
ALTER TABLE public.organization_entitlements
  ADD CONSTRAINT organization_entitlements_status_check
  CHECK (status IN ('base','trial','pending','active','past_due','canceled'));

CREATE UNIQUE INDEX IF NOT EXISTS organization_entitlements_asaas_subscription_idx
  ON public.organization_entitlements (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_events_no_client_access ON public.billing_events;
CREATE POLICY billing_events_no_client_access ON public.billing_events
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP FUNCTION IF EXISTS public.get_my_billing_status();
CREATE FUNCTION public.get_my_billing_status()
RETURNS TABLE (
  organization_id uuid,
  branch_count bigint,
  branch_limit integer,
  status text,
  payment_confirmed boolean,
  can_manage_branches boolean,
  payment_method text,
  current_period_end timestamptz,
  grace_until timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.organization_id, count(b.id), e.branch_limit, e.status, e.payment_confirmed,
    (e.branch_limit > 1 AND e.payment_confirmed), e.payment_method,
    e.current_period_end, e.grace_until
  FROM public.organization_entitlements e
  JOIN public.organization_members om ON om.organization_id = e.organization_id
    AND om.user_id = auth.uid() AND om.active = true
  LEFT JOIN public.branches b ON b.organization_id = e.organization_id AND b.active = true
  GROUP BY e.organization_id, e.branch_limit, e.status, e.payment_confirmed,
    e.payment_method, e.current_period_end, e.grace_until;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_billing_status() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_billing_status() TO authenticated;

COMMIT;
