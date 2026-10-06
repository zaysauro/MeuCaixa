BEGIN;

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
  grace_until timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.organization_id, count(b.id), e.branch_limit, e.status, e.payment_confirmed,
    (e.branch_limit > 1 AND e.payment_confirmed), e.payment_method,
    e.current_period_end, e.grace_until, e.trial_started_at, e.trial_ends_at
  FROM public.organization_entitlements e
  JOIN public.organization_members om ON om.organization_id = e.organization_id
    AND om.user_id = auth.uid() AND om.active = true
  LEFT JOIN public.branches b ON b.organization_id = e.organization_id AND b.active = true
  GROUP BY e.organization_id, e.branch_limit, e.status, e.payment_confirmed,
    e.payment_method, e.current_period_end, e.grace_until,
    e.trial_started_at, e.trial_ends_at;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_billing_status() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_billing_status() TO authenticated;

COMMIT;
