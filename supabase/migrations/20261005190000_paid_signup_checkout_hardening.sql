BEGIN;

ALTER TABLE public.organization_entitlements
  ADD COLUMN IF NOT EXISTS asaas_checkout_id text;

CREATE UNIQUE INDEX IF NOT EXISTS organization_entitlements_asaas_checkout_idx
  ON public.organization_entitlements (asaas_checkout_id)
  WHERE asaas_checkout_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prepare_paid_signup(p_user_id uuid, p_company_name text, p_email text)
RETURNS TABLE(organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_branch uuid;
  v_slug text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) <> 'service_role'
    OR p_user_id IS NULL OR btrim(coalesce(p_company_name, '')) = '' OR btrim(coalesce(p_email, '')) = '' THEN
    RAISE EXCEPTION 'invalid_paid_signup';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RAISE EXCEPTION 'user_not_found'; END IF;
  SELECT om.organization_id INTO v_org FROM public.organization_members om WHERE om.user_id = p_user_id ORDER BY om.created_at LIMIT 1;
  IF v_org IS NULL THEN
    v_slug := lower(regexp_replace(btrim(p_company_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    IF v_slug = '' THEN v_slug := 'empresa'; END IF;
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    INSERT INTO public.organizations(name, slug, email, onboarding_completed)
    VALUES (btrim(p_company_name), v_slug, lower(btrim(p_email)), true)
    RETURNING id INTO v_org;
    INSERT INTO public.organization_members(organization_id, user_id, role, active, branch_access_mode) VALUES (v_org, p_user_id, 'owner', true, 'all');
    INSERT INTO public.branches(organization_id, name, is_headquarters) VALUES (v_org, 'Matriz', true) RETURNING id INTO v_branch;
    UPDATE public.organization_members SET branch_id = v_branch WHERE organization_id = v_org AND user_id = p_user_id;
    INSERT INTO public.organization_settings(organization_id) VALUES (v_org) ON CONFLICT (organization_id) DO NOTHING;
  END IF;
  INSERT INTO public.organization_entitlements(organization_id, branch_limit, payment_confirmed, status)
  VALUES (v_org, 1, false, 'pending')
  ON CONFLICT (organization_id) DO UPDATE SET status = CASE WHEN organization_entitlements.payment_confirmed THEN organization_entitlements.status ELSE 'pending' END, updated_at = now();
  RETURN QUERY SELECT v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_paid_signup(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_paid_signup(uuid, text, text) TO service_role;

COMMIT;
