-- 0011_cash_permissions.sql
-- Fecha a última lacuna de autorização da fundação:
-- operator pode operar a própria filial e fechar somente o caixa que abriu;
-- manager pode operar/fechar caixas das filiais permitidas;
-- owner/admin mantêm acesso organizacional.

BEGIN;

CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_branch_id uuid,
  p_opening_balance numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_register_id uuid;
  v_balance numeric(12,2) := round(coalesce(p_opening_balance, 0), 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'opening_balance_invalid';
  END IF;

  SELECT b.organization_id
    INTO v_org_id
  FROM public.branches b
  WHERE b.id = p_branch_id
    AND b.active = true;

  IF v_org_id IS NULL OR NOT public.can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cash_registers cr
    WHERE cr.branch_id = p_branch_id
      AND cr.status = 'open'
  ) THEN
    RAISE EXCEPTION 'cash_already_open';
  END IF;

  INSERT INTO public.cash_registers (
    organization_id,
    branch_id,
    opened_by,
    opened_at,
    opening_balance,
    terminal_number,
    terminal_name,
    status
  )
  VALUES (
    v_org_id,
    p_branch_id,
    auth.uid(),
    now(),
    v_balance,
    1,
    'Caixa 01',
    'open'
  )
  RETURNING id INTO v_register_id;

  RETURN v_register_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'cash_already_open';
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_cash_register(uuid, numeric)
TO authenticated;

CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_cash_register_id uuid,
  p_counted_balance numeric,
  p_observation text DEFAULT NULL
)
RETURNS TABLE (
  register_id uuid,
  expected_balance numeric,
  counted_balance numeric,
  difference numeric,
  closed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_register public.cash_registers%ROWTYPE;
  v_role public.member_role;
  v_expected numeric(12,2);
  v_counted numeric(12,2) := round(coalesce(p_counted_balance, 0), 2);
  v_difference numeric(12,2);
  v_observation text := NULLIF(trim(coalesce(p_observation, '')), '');
  v_closed_at timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_counted < 0 THEN
    RAISE EXCEPTION 'counted_balance_invalid';
  END IF;

  SELECT *
    INTO v_register
  FROM public.cash_registers cr
  WHERE cr.id = p_cash_register_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cash_not_found';
  END IF;

  IF v_register.status <> 'open' THEN
    RAISE EXCEPTION 'cash_already_closed';
  END IF;

  SELECT om.role
    INTO v_role
  FROM public.organization_members om
  WHERE om.organization_id = v_register.organization_id
    AND om.user_id = auth.uid()
    AND (
      om.branch_id IS NULL
      OR om.branch_id = v_register.branch_id
      OR om.role IN ('owner', 'admin')
    )
  ORDER BY
    CASE om.role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'manager' THEN 3
      ELSE 4
    END
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;

  IF v_role = 'operator' AND v_register.opened_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'cash_close_not_owner';
  END IF;

  SELECT round(
    v_register.opening_balance
    + COALESCE(sum(CASE WHEN cm.direction = 1 THEN cm.amount ELSE 0 END), 0)
    - COALESCE(sum(CASE WHEN cm.direction = -1 THEN cm.amount ELSE 0 END), 0),
    2
  )
  INTO v_expected
  FROM public.cash_movements cm
  WHERE cm.cash_register_id = v_register.id;

  v_difference := round(v_counted - v_expected, 2);

  IF v_difference <> 0 AND v_observation IS NULL THEN
    RAISE EXCEPTION 'closing_observation_required';
  END IF;

  UPDATE public.cash_registers
  SET status = 'closed',
      closed_at = v_closed_at,
      closed_by = auth.uid(),
      expected_balance = v_expected,
      counted_balance = v_counted,
      difference = v_difference,
      closing_balance = v_counted,
      closing_observation = v_observation
  WHERE id = v_register.id;

  RETURN QUERY
  SELECT v_register.id, v_expected, v_counted, v_difference, v_closed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_cash_register(uuid, numeric, text)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
