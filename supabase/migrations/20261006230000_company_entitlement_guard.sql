BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_user_context (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_user_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_user_context FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.set_active_organization(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND active = true
  ) THEN
    RAISE EXCEPTION 'organization_access_denied';
  END IF;

  INSERT INTO public.organization_user_context(user_id, organization_id, updated_at)
  VALUES (auth.uid(), p_organization_id, now())
  ON CONFLICT (user_id) DO UPDATE SET organization_id = EXCLUDED.organization_id, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_organization(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_organization()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  branch_id uuid,
  branch_name text,
  role public.member_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id, o.name, b.id, b.name, om.role
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  LEFT JOIN LATERAL (
    SELECT id, name
    FROM public.branches
    WHERE organization_id = om.organization_id AND active = true
    ORDER BY is_headquarters DESC, created_at, id
    LIMIT 1
  ) b ON true
  LEFT JOIN public.organization_user_context ctx
    ON ctx.user_id = om.user_id AND ctx.organization_id = om.organization_id
  WHERE om.user_id = auth.uid() AND om.active = true
  ORDER BY (ctx.user_id IS NOT NULL) DESC, om.created_at, om.organization_id
  LIMIT 1;
$$;

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
  WITH selected AS (
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
    SELECT selected.*,
      (
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
      ) AS has_access
    FROM selected
  )
  SELECT organization_id, role, active, entitlement_exists, status, payment_confirmed,
    trial_ends_at, current_period_end, grace_until, cancel_at_period_end, canceled_at,
    access_until, has_access, role::text IN ('owner', 'admin'),
    CASE
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

CREATE OR REPLACE FUNCTION public.has_company_access(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT has_access FROM public.get_my_company_access(p_organization_id)), false);
$$;

REVOKE ALL ON FUNCTION public.get_my_company_access(uuid), public.has_company_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_company_access(uuid), public.has_company_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_key text,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.role_permissions rp ON rp.role::text = om.role::text AND rp.permission_key = p_permission_key
    WHERE om.user_id = auth.uid()
      AND om.active = true
      AND (p_organization_id IS NULL OR om.organization_id = p_organization_id)
      AND (
        p_permission_key IN ('billing.view', 'billing.manage', 'billing.cancel')
        OR public.has_company_access(om.organization_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_permission(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.team_accept_invite()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_invite public.team_invites%ROWTYPE; v_org uuid;
BEGIN
  SELECT i.* INTO v_invite
  FROM public.team_invites i
  JOIN auth.users u ON lower(u.email) = lower(i.email)
  WHERE u.id = auth.uid() AND i.status = 'pending' AND i.expires_at > now()
  ORDER BY i.created_at DESC LIMIT 1;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = v_invite.organization_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'already_member';
  END IF;
  INSERT INTO public.organization_members(organization_id, user_id, role, active, branch_access_mode)
  VALUES (v_invite.organization_id, auth.uid(), v_invite.role, true, v_invite.branch_access_mode);
  IF v_invite.branch_access_mode = 'restricted' THEN
    INSERT INTO public.organization_member_branches(organization_id, user_id, branch_id, created_by)
    SELECT v_invite.organization_id, auth.uid(), branch_id, v_invite.invited_by
    FROM public.team_invite_branches WHERE invite_id = v_invite.id;
  END IF;
  UPDATE public.team_invites
  SET status = 'accepted', auth_user_id = auth.uid(), accepted_at = now(), updated_at = now()
  WHERE id = v_invite.id;
  INSERT INTO public.organization_user_context(user_id, organization_id, updated_at)
  VALUES (auth.uid(), v_invite.organization_id, now())
  ON CONFLICT (user_id) DO UPDATE SET organization_id = EXCLUDED.organization_id, updated_at = now();
  RETURN v_invite.organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.team_accept_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_accept_invite() TO authenticated;

COMMIT;
