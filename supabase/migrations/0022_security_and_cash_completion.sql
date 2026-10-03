-- 0022_security_and_cash_completion.sql
-- Fecha execução pública acidental de SECURITY DEFINER e completa o contrato
-- usado pelo módulo de caixa.

BEGIN;

DO $$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
      v_function.nspname,
      v_function.proname,
      v_function.args
    );
  END LOOP;
END;
$$;

ALTER FUNCTION public.normalize_inventory_movement() SET search_path = public;
ALTER FUNCTION public.apply_branch_average_cost_to_sale_item() SET search_path = public;
ALTER FUNCTION public.recalculate_sale_cost() SET search_path = public;
ALTER FUNCTION public.prevent_inventory_movement_mutation() SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_cash_current_summary(
  p_branch_id uuid
)
RETURNS TABLE (
  register_id uuid, branch_id uuid, status text, terminal_number integer,
  terminal_name text, opened_by uuid, opened_at timestamptz,
  opening_balance numeric, cash_sales numeric, cash_entries numeric,
  cash_withdrawals numeric, cash_refunds numeric, expected_balance numeric,
  pix_total numeric, debit_total numeric, credit_total numeric, other_total numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cr.id, cr.branch_id, cr.status, cr.terminal_number, cr.terminal_name,
    cr.opened_by, cr.opened_at, cr.opening_balance,
    COALESCE(sum(CASE WHEN cm.type = 'sale' AND cm.direction = 1 THEN cm.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN cm.type IN ('cash_in', 'supply', 'adjustment') AND cm.direction = 1 THEN cm.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN cm.type IN ('cash_out', 'withdrawal', 'adjustment') AND cm.direction = -1 THEN cm.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN cm.type = 'sale_reversal' AND cm.direction = -1 THEN cm.amount ELSE 0 END), 0),
    round(cr.opening_balance + COALESCE(sum(CASE WHEN cm.direction = 1 THEN cm.amount ELSE 0 END), 0)
      - COALESCE(sum(CASE WHEN cm.direction = -1 THEN cm.amount ELSE 0 END), 0), 2),
    COALESCE((SELECT sum(sp.amount) FROM public.sales s JOIN public.sale_payments sp ON sp.sale_id = s.id WHERE s.cash_register_id = cr.id AND s.status = 'completed' AND sp.method = 'pix'), 0),
    COALESCE((SELECT sum(sp.amount) FROM public.sales s JOIN public.sale_payments sp ON sp.sale_id = s.id WHERE s.cash_register_id = cr.id AND s.status = 'completed' AND sp.method = 'debit_card'), 0),
    COALESCE((SELECT sum(sp.amount) FROM public.sales s JOIN public.sale_payments sp ON sp.sale_id = s.id WHERE s.cash_register_id = cr.id AND s.status = 'completed' AND sp.method = 'credit_card'), 0),
    COALESCE((SELECT sum(sp.amount) FROM public.sales s JOIN public.sale_payments sp ON sp.sale_id = s.id WHERE s.cash_register_id = cr.id AND s.status = 'completed' AND sp.method = 'other'), 0)
  FROM public.cash_registers cr
  LEFT JOIN public.cash_movements cm ON cm.cash_register_id = cr.id
  WHERE cr.branch_id = p_branch_id AND public.can_access_branch(p_branch_id) AND cr.status = 'open'
  GROUP BY cr.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_current_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cash_register_history(
  p_branch_id uuid DEFAULT NULL, p_status text DEFAULT NULL,
  p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  register_id uuid, branch_id uuid, branch_name text, terminal_number integer,
  terminal_name text, status text, opened_by uuid, opened_at timestamptz,
  opening_balance numeric, closed_by uuid, closed_at timestamptz,
  expected_balance numeric, counted_balance numeric, difference numeric,
  closing_observation text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cr.id, cr.branch_id, b.name, cr.terminal_number, cr.terminal_name,
    cr.status, cr.opened_by, cr.opened_at, cr.opening_balance,
    cr.closed_by, cr.closed_at, cr.expected_balance, cr.counted_balance,
    cr.difference, cr.closing_observation
  FROM public.cash_registers cr JOIN public.branches b ON b.id = cr.branch_id
  WHERE public.can_access_branch(cr.branch_id)
    AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    AND (p_status IS NULL OR cr.status = p_status)
    AND (p_start_date IS NULL OR cr.opened_at::date >= p_start_date)
    AND (p_end_date IS NULL OR cr.opened_at::date <= p_end_date)
  ORDER BY cr.opened_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_register_history(uuid, text, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cash_register_movements(p_cash_register_id uuid)
RETURNS TABLE (
  movement_id uuid, cash_register_id uuid, branch_id uuid, type text,
  amount numeric, direction smallint, description text, reference_id uuid,
  created_by uuid, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cm.id, cm.cash_register_id, cm.branch_id, cm.type, cm.amount,
    cm.direction, cm.description, cm.reference_id, cm.created_by, cm.created_at
  FROM public.cash_movements cm JOIN public.cash_registers cr ON cr.id = cm.cash_register_id
  WHERE cm.cash_register_id = p_cash_register_id AND public.can_access_branch(cr.branch_id)
  ORDER BY cm.created_at ASC, cm.id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_register_movements(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
