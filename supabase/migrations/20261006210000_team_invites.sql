BEGIN;

CREATE TABLE IF NOT EXISTS public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role public.member_role NOT NULL DEFAULT 'operator',
  branch_access_mode text NOT NULL DEFAULT 'restricted' CHECK (branch_access_mode IN ('all', 'restricted')),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email, status)
);

CREATE TABLE IF NOT EXISTS public.team_invite_branches (
  invite_id uuid NOT NULL REFERENCES public.team_invites(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  PRIMARY KEY (invite_id, branch_id)
);

CREATE INDEX IF NOT EXISTS team_invites_org_status_idx ON public.team_invites(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS team_invites_email_idx ON public.team_invites(lower(email), status);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invite_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_invites_admin_read ON public.team_invites;
CREATE POLICY team_invites_admin_read ON public.team_invites FOR SELECT TO authenticated
USING (public.has_permission('users.view', organization_id));

DROP POLICY IF EXISTS team_invite_branches_admin_read ON public.team_invite_branches;
CREATE POLICY team_invite_branches_admin_read ON public.team_invite_branches FOR SELECT TO authenticated
USING (public.has_permission('users.view', organization_id));

DROP POLICY IF EXISTS team_invite_branches_admin_write ON public.team_invite_branches;
CREATE POLICY team_invite_branches_admin_write ON public.team_invite_branches FOR ALL TO authenticated
USING (public.has_permission('users.manage_branches', organization_id))
WITH CHECK (public.has_permission('users.manage_branches', organization_id));

CREATE OR REPLACE FUNCTION public.team_list_members(p_organization_id uuid)
RETURNS TABLE (user_id uuid, full_name text, email text, role public.member_role, active boolean, branch_access_mode text, branch_names text[], last_access timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT om.user_id, coalesce(nullif(p.full_name, ''), u.raw_user_meta_data->>'full_name', 'Usuário'), u.email,
    om.role, om.active, om.branch_access_mode,
    coalesce(array_agg(distinct b.name) FILTER (WHERE b.id IS NOT NULL), '{}'::text[]), u.last_sign_in_at
  FROM public.organization_members om
  JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN public.profiles p ON p.id = om.user_id
  LEFT JOIN public.organization_member_branches mb ON mb.organization_id = om.organization_id AND mb.user_id = om.user_id
  LEFT JOIN public.branches b ON b.id = mb.branch_id AND b.active
  WHERE om.organization_id = p_organization_id AND public.has_permission('users.view', p_organization_id)
  GROUP BY om.user_id, p.full_name, u.raw_user_meta_data, u.email, om.role, om.active, om.branch_access_mode, u.last_sign_in_at
  ORDER BY coalesce(nullif(p.full_name, ''), u.email);
$$;

CREATE OR REPLACE FUNCTION public.team_list_invites(p_organization_id uuid)
RETURNS TABLE (id uuid, email text, full_name text, role public.member_role, branch_access_mode text, status text, expires_at timestamptz, created_at timestamptz, branch_names text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.email, i.full_name, i.role, i.branch_access_mode, i.status, i.expires_at, i.created_at,
    coalesce(array_agg(distinct b.name) FILTER (WHERE b.id IS NOT NULL), '{}'::text[])
  FROM public.team_invites i
  LEFT JOIN public.team_invite_branches ib ON ib.invite_id = i.id
  LEFT JOIN public.branches b ON b.id = ib.branch_id
  WHERE i.organization_id = p_organization_id AND public.has_permission('users.view', p_organization_id)
  GROUP BY i.id ORDER BY i.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.team_create_invite(p_organization_id uuid, p_email text, p_full_name text, p_role public.member_role, p_branch_access_mode text DEFAULT 'restricted', p_branch_ids uuid[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_email text := lower(trim(p_email)); v_branch_count integer;
BEGIN
  IF NOT public.has_permission('users.invite', p_organization_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_role = 'owner' THEN RAISE EXCEPTION 'owner_invite_not_allowed'; END IF;
  IF v_email = '' OR p_full_name IS NULL OR trim(p_full_name) = '' THEN RAISE EXCEPTION 'invite_fields_required'; END IF;
  IF p_branch_access_mode NOT IN ('all', 'restricted') THEN RAISE EXCEPTION 'invalid_branch_access_mode'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members om JOIN auth.users u ON u.id = om.user_id WHERE om.organization_id = p_organization_id AND lower(u.email) = v_email AND om.active) THEN RAISE EXCEPTION 'user_already_member'; END IF;
  UPDATE public.team_invites SET status = 'expired', updated_at = now() WHERE organization_id = p_organization_id AND lower(email) = v_email AND status = 'pending';
  INSERT INTO public.team_invites (organization_id, email, full_name, role, branch_access_mode, invited_by) VALUES (p_organization_id, v_email, trim(p_full_name), p_role, p_branch_access_mode, auth.uid()) RETURNING id INTO v_id;
  IF p_branch_access_mode = 'restricted' THEN
    SELECT count(*) INTO v_branch_count FROM public.branches WHERE organization_id = p_organization_id AND active AND id = ANY(p_branch_ids);
    IF v_branch_count <> coalesce(array_length(p_branch_ids, 1), 0) OR v_branch_count = 0 THEN RAISE EXCEPTION 'invalid_branch_access'; END IF;
    INSERT INTO public.team_invite_branches (invite_id, organization_id, branch_id) SELECT v_id, p_organization_id, b.id FROM public.branches b WHERE b.organization_id = p_organization_id AND b.active AND b.id = ANY(p_branch_ids);
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_invite_delivery_data(p_invite_id uuid)
RETURNS TABLE (id uuid, email text, full_name text, role public.member_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT i.id, i.email, i.full_name, i.role FROM public.team_invites i WHERE i.id = p_invite_id AND public.has_permission('users.invite', i.organization_id) AND i.status = 'pending' AND i.expires_at > now(); $$;

CREATE OR REPLACE FUNCTION public.team_accept_invite()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_invite public.team_invites%ROWTYPE; v_org uuid;
BEGIN
  SELECT i.* INTO v_invite FROM public.team_invites i JOIN auth.users u ON lower(u.email) = lower(i.email) WHERE u.id = auth.uid() AND i.status = 'pending' AND i.expires_at > now() ORDER BY i.created_at DESC LIMIT 1;
  IF v_invite.id IS NULL THEN RAISE EXCEPTION 'invite_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = v_invite.organization_id AND user_id = auth.uid()) THEN RAISE EXCEPTION 'already_member'; END IF;
  INSERT INTO public.organization_members (organization_id, user_id, role, active, branch_access_mode) VALUES (v_invite.organization_id, auth.uid(), v_invite.role, true, v_invite.branch_access_mode);
  IF v_invite.branch_access_mode = 'restricted' THEN INSERT INTO public.organization_member_branches (organization_id, user_id, branch_id, created_by) SELECT v_invite.organization_id, auth.uid(), branch_id, v_invite.invited_by FROM public.team_invite_branches WHERE invite_id = v_invite.id; END IF;
  UPDATE public.team_invites SET status = 'accepted', auth_user_id = auth.uid(), accepted_at = now(), updated_at = now() WHERE id = v_invite.id;
  RETURN v_invite.organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_cancel_invite(p_invite_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN UPDATE public.team_invites SET status = 'cancelled', updated_at = now() WHERE id = p_invite_id AND status = 'pending' AND public.has_permission('users.cancel_invite', organization_id); IF NOT FOUND THEN RAISE EXCEPTION 'invite_not_found'; END IF; END; $$;

CREATE OR REPLACE FUNCTION public.team_set_member_active(p_organization_id uuid, p_user_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'cannot_change_self'; END IF; IF NOT public.has_permission(CASE WHEN p_active THEN 'users.reactivate' ELSE 'users.deactivate' END, p_organization_id) THEN RAISE EXCEPTION 'not_authorized'; END IF; UPDATE public.organization_members SET active = p_active, updated_at = now() WHERE organization_id = p_organization_id AND user_id = p_user_id AND role <> 'owner'; IF NOT FOUND THEN RAISE EXCEPTION 'member_not_found'; END IF; END; $$;

REVOKE ALL ON FUNCTION public.team_list_members(uuid), public.team_list_invites(uuid), public.team_create_invite(uuid,text,text,public.member_role,text,uuid[]), public.team_invite_delivery_data(uuid), public.team_accept_invite(), public.team_cancel_invite(uuid), public.team_set_member_active(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_list_members(uuid), public.team_list_invites(uuid), public.team_create_invite(uuid,text,text,public.member_role,text,uuid[]), public.team_invite_delivery_data(uuid), public.team_accept_invite(), public.team_cancel_invite(uuid), public.team_set_member_active(uuid,uuid,boolean) TO authenticated;

COMMIT;
