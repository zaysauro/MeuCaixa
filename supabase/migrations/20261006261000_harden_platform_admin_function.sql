BEGIN;

CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.platform_admins
    WHERE user_id = auth.uid()
      AND active = true
  );
$$;

REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.is_platform_admin();

CREATE OR REPLACE FUNCTION public.get_my_company_access(p_organization_id uuid DEFAULT NULL)
RETURNS TABLE (
  organization_id uuid,
  role public.member_role,
  membership_active boolean,
  entitlement_exists boolean,
  status text,
  payment_confirmed boolean,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  grace_until timestamptz,
  cancel_at_period_end boolean,
  canceled_at timestamptz,
  access_until timestamptz,
  has_access boolean,
  can_manage_billing boolean,
  access_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH platform AS (
    SELECT private.is_platform_admin() AS is_platform_admin
  ), selected AS (
    SELECT om.organization_id, om.role, om.active,
      e.status, e.payment_confirmed, e.trial_ends_at, e.current_period_end,
      e.grace_until, e.cancel_at_period_end, e.canceled_at, e.access_until,
      (e.organization_id IS NOT NULL) AS entitlement_exists,
      (ctx.user_id IS NOT NULL) AS is_selected
    FROM public.organization_members om
    LEFT JOIN public.organization_entitlements e ON e.organization_id = om.organization_id
    LEFT JOIN public.organization_user_context ctx
      ON ctx.user_id = om.user_id AND ctx.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND om.active = true
      AND (p_organization_id IS NULL OR om.organization_id = p_organization_id)
    ORDER BY CASE WHEN p_organization_id IS NULL AND ctx.user_id IS NOT NULL THEN 0 ELSE 1 END,
      om.created_at, om.organization_id
    LIMIT 1
  ), evaluated AS (
    SELECT selected.*, platform.is_platform_admin,
      COALESCE((
        platform.is_platform_admin
        OR (
          selected.active
          AND (
            (selected.status = 'trial' AND selected.trial_ends_at IS NOT NULL AND selected.trial_ends_at > now())
            OR (selected.status = 'active' AND selected.payment_confirmed
              AND (selected.access_until IS NULL OR selected.access_until > now())
              AND (selected.current_period_end IS NULL OR selected.current_period_end > now()))
            OR (selected.status IN ('canceled', 'cancelled') AND selected.cancel_at_period_end
              AND coalesce(selected.access_until, selected.current_period_end) > now())
            OR (selected.status = 'past_due' AND selected.grace_until IS NOT NULL AND selected.grace_until > now())
          )
        )
      ), false) AS has_access
    FROM selected CROSS JOIN platform
  )
  SELECT organization_id, role, active, entitlement_exists, status, payment_confirmed,
    trial_ends_at, current_period_end, grace_until, cancel_at_period_end, canceled_at,
    access_until, has_access,
    is_platform_admin OR role::text IN ('owner', 'admin'),
    CASE
      WHEN is_platform_admin THEN 'platform_admin'
      WHEN NOT active THEN 'membership_inactive'
      WHEN NOT entitlement_exists THEN 'entitlement_missing'
      WHEN has_access THEN 'granted'
      WHEN status = 'trial' THEN 'trial_expired'
      WHEN status = 'past_due' THEN 'payment_overdue'
      WHEN status IN ('canceled', 'cancelled') THEN 'subscription_expired'
      ELSE 'entitlement_invalid'
    END
  FROM evaluated;
$$;

REVOKE ALL ON FUNCTION public.get_my_company_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_company_access(uuid) TO authenticated;

COMMIT;
