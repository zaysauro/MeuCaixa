BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS base_monthly_price numeric(10,2) NOT NULL DEFAULT 79.99,
  ADD COLUMN IF NOT EXISTS additional_branch_price numeric(10,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS included_branches integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS billing_branch_count integer NOT NULL DEFAULT 1;

ALTER TABLE public.organizations ALTER COLUMN base_monthly_price SET DEFAULT 79.99;
UPDATE public.organizations SET base_monthly_price = 79.99
WHERE base_monthly_price IS NULL OR base_monthly_price = 59.90;

ALTER TABLE public.organization_entitlements
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

ALTER TABLE public.organization_entitlements
  DROP CONSTRAINT IF EXISTS organization_entitlements_status_check;
ALTER TABLE public.organization_entitlements
  ADD CONSTRAINT organization_entitlements_status_check
  CHECK (status IN ('base','trial','pending','active','past_due','grace_period','suspended','cancelled','canceled'));

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
  FROM public.organization_members om
  WHERE om.user_id = auth.uid() AND om.active = true
  ORDER BY om.created_at LIMIT 1;

  IF v_org IS NULL THEN RAISE EXCEPTION 'organization_required'; END IF;

  INSERT INTO public.organization_entitlements(
    organization_id, branch_limit, payment_confirmed, status, trial_started_at, trial_ends_at
  )
  VALUES(v_org, 1, false, 'trial', now(), now() + interval '7 days')
  ON CONFLICT(organization_id) DO UPDATE SET
    status = CASE WHEN organization_entitlements.status IN ('base','trial') THEN 'trial' ELSE organization_entitlements.status END,
    trial_started_at = COALESCE(organization_entitlements.trial_started_at, now()),
    trial_ends_at = COALESCE(organization_entitlements.trial_ends_at, now() + interval '7 days'),
    updated_at = now()
  RETURNING organization_entitlements.trial_ends_at INTO v_end;

  UPDATE public.branches
  SET is_headquarters = true
  WHERE id = (
    SELECT id FROM public.branches
    WHERE organization_id = v_org
    ORDER BY created_at, id LIMIT 1
  );

  RETURN QUERY SELECT v_org, v_end;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_my_trial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_my_trial() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
