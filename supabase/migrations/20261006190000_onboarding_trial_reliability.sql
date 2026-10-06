BEGIN;

CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_company_name text,
  p_branch_name text
)
RETURNS TABLE(
  created_organization_id uuid,
  created_branch_id uuid,
  organization_name text,
  branch_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_organization_id uuid;
  v_branch_id uuid;
  v_slug text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF btrim(coalesce(p_company_name, '')) = '' THEN
    RAISE EXCEPTION 'company_name_required';
  END IF;
  IF btrim(coalesce(p_branch_name, '')) = '' THEN
    RAISE EXCEPTION 'branch_name_required';
  END IF;

  -- Serializa o onboarding do mesmo usuário para impedir duas empresas em retries concorrentes.
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  SELECT om.organization_id
    INTO v_organization_id
  FROM public.organization_members AS om
  WHERE om.user_id = v_user_id
  ORDER BY om.created_at, om.organization_id
  LIMIT 1;

  IF v_organization_id IS NULL THEN
    v_slug := lower(regexp_replace(btrim(p_company_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
    IF v_slug = '' THEN v_slug := 'empresa'; END IF;
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

    INSERT INTO public.organizations(name, slug)
    VALUES (btrim(p_company_name), v_slug)
    RETURNING id INTO v_organization_id;

    INSERT INTO public.organization_members(organization_id, user_id, role, active, branch_access_mode)
    VALUES (v_organization_id, v_user_id, 'owner', true, 'all');
  END IF;

  SELECT b.id
    INTO v_branch_id
  FROM public.branches AS b
  WHERE b.organization_id = v_organization_id
    AND b.active = true
  ORDER BY b.is_headquarters DESC, b.created_at, b.id
  LIMIT 1;

  IF v_branch_id IS NULL THEN
    INSERT INTO public.branches(organization_id, name, is_headquarters, active)
    VALUES (v_organization_id, btrim(p_branch_name), true, true)
    RETURNING id INTO v_branch_id;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.branches AS b
    WHERE b.organization_id = v_organization_id
      AND b.is_headquarters = true
      AND b.active = true
  ) THEN
    UPDATE public.branches AS b
    SET is_headquarters = true
    WHERE b.id = v_branch_id;
  END IF;

  INSERT INTO public.organization_settings(organization_id)
  VALUES (v_organization_id)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT o.name INTO organization_name
  FROM public.organizations AS o WHERE o.id = v_organization_id;
  SELECT b.name INTO branch_name
  FROM public.branches AS b WHERE b.id = v_branch_id;

  created_organization_id := v_organization_id;
  created_branch_id := v_branch_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_my_trial()
RETURNS TABLE(organization_id uuid, trial_ends_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_end timestamptz;
BEGIN
  SELECT om.organization_id INTO v_org
  FROM public.organization_members AS om
  WHERE om.user_id = auth.uid() AND om.active = true
  ORDER BY om.created_at, om.organization_id
  LIMIT 1;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'organization_required';
  END IF;

  INSERT INTO public.organization_entitlements(
    organization_id,
    branch_limit,
    payment_confirmed,
    status,
    trial_started_at,
    trial_ends_at
  )
  VALUES (v_org, 1, false, 'trial', now(), now() + interval '7 days')
  ON CONFLICT ON CONSTRAINT organization_entitlements_pkey DO UPDATE SET
    status = CASE
      WHEN organization_entitlements.status = 'base'
        AND organization_entitlements.trial_started_at IS NULL
        AND organization_entitlements.trial_ends_at IS NULL
      THEN 'trial'
      ELSE organization_entitlements.status
    END,
    trial_started_at = COALESCE(organization_entitlements.trial_started_at, EXCLUDED.trial_started_at),
    trial_ends_at = COALESCE(organization_entitlements.trial_ends_at, EXCLUDED.trial_ends_at),
    updated_at = now()
  RETURNING organization_entitlements.trial_ends_at INTO v_end;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches AS b
    WHERE b.organization_id = v_org
      AND b.is_headquarters = true
      AND b.active = true
  ) THEN
    UPDATE public.branches AS b
    SET is_headquarters = true
    WHERE b.id = (
      SELECT b2.id FROM public.branches AS b2
      WHERE b2.organization_id = v_org AND b2.active = true
      ORDER BY b2.created_at, b2.id LIMIT 1
    );
  END IF;

  RETURN QUERY SELECT v_org, v_end;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.start_my_trial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_my_trial() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
