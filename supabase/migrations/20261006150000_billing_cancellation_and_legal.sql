BEGIN;

ALTER TABLE public.organization_entitlements
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_until timestamptz;

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'signup',
  UNIQUE (user_id, terms_version, privacy_version)
);
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legal_acceptances_insert_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_insert_own ON public.legal_acceptances FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS legal_acceptances_read_own ON public.legal_acceptances;
CREATE POLICY legal_acceptances_read_own ON public.legal_acceptances FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
REVOKE UPDATE, DELETE ON public.legal_acceptances FROM authenticated, anon, PUBLIC;

DROP FUNCTION IF EXISTS public.get_my_billing_status();
CREATE FUNCTION public.get_my_billing_status()
RETURNS TABLE (organization_id uuid, branch_count bigint, branch_limit integer, status text, payment_confirmed boolean, can_manage_branches boolean, payment_method text, current_period_end timestamptz, grace_until timestamptz, trial_started_at timestamptz, trial_ends_at timestamptz, cancel_at_period_end boolean, canceled_at timestamptz, access_until timestamptz, asaas_subscription_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.organization_id, count(b.id), e.branch_limit, e.status, e.payment_confirmed, (e.branch_limit > 1 AND e.payment_confirmed), e.payment_method, e.current_period_end, e.grace_until, e.trial_started_at, e.trial_ends_at, e.cancel_at_period_end, e.canceled_at, e.access_until, e.asaas_subscription_id
  FROM public.organization_entitlements e
  JOIN public.organization_members om ON om.organization_id=e.organization_id AND om.user_id=auth.uid() AND om.active=true
  LEFT JOIN public.branches b ON b.organization_id=e.organization_id AND b.active=true
  GROUP BY e.organization_id,e.branch_limit,e.status,e.payment_confirmed,e.payment_method,e.current_period_end,e.grace_until,e.trial_started_at,e.trial_ends_at,e.cancel_at_period_end,e.canceled_at,e.access_until,e.asaas_subscription_id;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_billing_status() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_billing_status() TO authenticated;

COMMIT;
