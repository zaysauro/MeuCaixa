-- Restore the cash closing RPC that the Meu Caixa frontend already calls.
-- The function is intentionally scoped to the authenticated member's tenant
-- and preserves the existing physical-cash movement calculation.

BEGIN;

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_register public.cash_registers%ROWTYPE;
  v_role public.member_role;
  v_expected numeric(12, 2);
  v_counted numeric(12, 2) := round(coalesce(p_counted_balance, 0), 2);
  v_difference numeric(12, 2);
  v_observation text := NULLIF(trim(coalesce(p_observation, '')), '');
  v_closed_at timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_counted < 0 THEN
    RAISE EXCEPTION 'counted_balance_invalid';
  END IF;

  SELECT cr.*
    INTO v_register
  FROM public.cash_registers AS cr
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
  FROM public.organization_members AS om
  WHERE om.organization_id = v_register.organization_id
    AND om.user_id = auth.uid()
    AND om.active = true
    AND (
      om.branch_id IS NULL
      OR om.branch_id = v_register.branch_id
      OR om.role IN ('owner', 'admin')
    )
  ORDER BY CASE om.role
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

  -- cash_movements contains only physical cash effects. complete_sale adds
  -- movements for cash payments after change; PIX/card payments add none.
  SELECT round(
    v_register.opening_balance
      + coalesce(sum(CASE WHEN cm.direction = 1 THEN cm.amount ELSE 0 END), 0)
      - coalesce(sum(CASE WHEN cm.direction = -1 THEN cm.amount ELSE 0 END), 0),
    2
  )
    INTO v_expected
  FROM public.cash_movements AS cm
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
  WHERE id = v_register.id
    AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cash_already_closed';
  END IF;

  RETURN QUERY
  SELECT v_register.id, v_expected, v_counted, v_difference, v_closed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_register(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_register(uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_cash_register(uuid, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
