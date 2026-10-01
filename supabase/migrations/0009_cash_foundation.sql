-- 0009_cash_foundation.sql
-- Fechamento operacional de caixa: 1 caixa aberto por filial no plano básico,
-- com arquitetura preparada para até 5 terminais por filial no futuro.

BEGIN;

ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS terminal_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS terminal_name text,
  ADD COLUMN IF NOT EXISTS terminal_identifier text,
  ADD COLUMN IF NOT EXISTS expected_balance numeric(12,2),
  ADD COLUMN IF NOT EXISTS counted_balance numeric(12,2),
  ADD COLUMN IF NOT EXISTS difference numeric(12,2),
  ADD COLUMN IF NOT EXISTS closing_observation text;

ALTER TABLE public.cash_registers
  DROP CONSTRAINT IF EXISTS cash_registers_terminal_number_check;

ALTER TABLE public.cash_registers
  ADD CONSTRAINT cash_registers_terminal_number_check
  CHECK (terminal_number BETWEEN 1 AND 5);

ALTER TABLE public.cash_registers
  DROP CONSTRAINT IF EXISTS cash_registers_opening_balance_check;

ALTER TABLE public.cash_registers
  ADD CONSTRAINT cash_registers_opening_balance_check
  CHECK (opening_balance >= 0);

ALTER TABLE public.cash_registers
  DROP CONSTRAINT IF EXISTS cash_registers_counted_balance_check;

ALTER TABLE public.cash_registers
  ADD CONSTRAINT cash_registers_counted_balance_check
  CHECK (counted_balance IS NULL OR counted_balance >= 0);

CREATE INDEX IF NOT EXISTS cash_registers_branch_status_idx
  ON public.cash_registers(branch_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS cash_registers_branch_terminal_idx
  ON public.cash_registers(branch_id, terminal_number, opened_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_one_open_per_branch_idx
  ON public.cash_registers(branch_id)
  WHERE status = 'open';

ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS direction smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.cash_movements
SET created_by = COALESCE(created_by, user_id)
WHERE created_by IS NULL;

UPDATE public.cash_movements
SET direction = CASE
  WHEN type IN ('cash_out', 'withdrawal') THEN -1
  ELSE 1
END
WHERE direction IS NULL OR direction NOT IN (-1, 1);

ALTER TABLE public.cash_movements
  DROP CONSTRAINT IF EXISTS cash_movements_direction_check;

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_direction_check
  CHECK (direction IN (-1, 1));

ALTER TABLE public.cash_movements
  DROP CONSTRAINT IF EXISTS cash_movements_type_check;

ALTER TABLE public.cash_movements
  ADD CONSTRAINT cash_movements_type_check
  CHECK (type IN (
    'sale',
    'sale_reversal',
    'cash_in',
    'cash_out',
    'withdrawal',
    'supply',
    'adjustment'
  ));

CREATE INDEX IF NOT EXISTS cash_movements_register_date_idx
  ON public.cash_movements(cash_register_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cash_movements_branch_type_date_idx
  ON public.cash_movements(branch_id, type, created_at DESC);

ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS received_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS change_amount numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_payments
  DROP CONSTRAINT IF EXISTS sale_payments_received_amount_check;

ALTER TABLE public.sale_payments
  ADD CONSTRAINT sale_payments_received_amount_check
  CHECK (
    received_amount IS NULL
    OR (
      received_amount >= 0
      AND method = 'cash'
      AND received_amount >= amount
    )
  );

ALTER TABLE public.sale_payments
  DROP CONSTRAINT IF EXISTS sale_payments_change_amount_check;

ALTER TABLE public.sale_payments
  ADD CONSTRAINT sale_payments_change_amount_check
  CHECK (change_amount >= 0);

DROP POLICY IF EXISTS "members manage registers" ON public.cash_registers;
DROP POLICY IF EXISTS "members manage cash movements" ON public.cash_movements;

CREATE POLICY "members view registers by branch"
ON public.cash_registers
FOR SELECT
TO authenticated
USING (public.can_access_branch(branch_id));

CREATE POLICY "members view cash movements by branch"
ON public.cash_movements
FOR SELECT
TO authenticated
USING (
  branch_id IS NOT NULL
  AND public.can_access_branch(branch_id)
);

CREATE OR REPLACE FUNCTION public.prevent_cash_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'cash_movement_immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_movements_immutable ON public.cash_movements;

CREATE TRIGGER trg_cash_movements_immutable
BEFORE UPDATE OR DELETE ON public.cash_movements
FOR EACH ROW
EXECUTE FUNCTION public.prevent_cash_movement_mutation();

CREATE OR REPLACE FUNCTION public.prevent_closed_cash_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'cash_closed_immutable';
  END IF;

  IF OLD.status = 'open' AND NEW.status = 'open' THEN
    IF NEW.opening_balance IS DISTINCT FROM OLD.opening_balance
       OR NEW.opened_by IS DISTINCT FROM OLD.opened_by
       OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.terminal_number IS DISTINCT FROM OLD.terminal_number THEN
      RAISE EXCEPTION 'cash_open_immutable';
    END IF;
  END IF;

  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
    IF NEW.closed_at IS NULL
       OR NEW.closed_by IS NULL
       OR NEW.expected_balance IS NULL
       OR NEW.counted_balance IS NULL
       OR NEW.difference IS NULL THEN
      RAISE EXCEPTION 'invalid_cash_close';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_registers_guard ON public.cash_registers;

CREATE TRIGGER trg_cash_registers_guard
BEFORE UPDATE ON public.cash_registers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_closed_cash_mutation();

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

  SELECT b.organization_id INTO v_org_id
  FROM public.branches b
  WHERE b.id = p_branch_id AND b.active = true;

  IF v_org_id IS NULL OR NOT public.can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cash_registers cr
    WHERE cr.branch_id = p_branch_id AND cr.status = 'open'
  ) THEN
    RAISE EXCEPTION 'cash_already_open';
  END IF;

  INSERT INTO public.cash_registers (
    organization_id, branch_id, opened_by, opened_at, opening_balance,
    terminal_number, terminal_name, status
  )
  VALUES (
    v_org_id, p_branch_id, auth.uid(), now(), v_balance,
    1, 'Caixa 01', 'open'
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

CREATE OR REPLACE FUNCTION public.register_cash_movement(
  p_cash_register_id uuid,
  p_type text,
  p_amount numeric,
  p_description text DEFAULT NULL,
  p_direction smallint DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_register public.cash_registers%ROWTYPE;
  v_movement_id uuid;
  v_direction smallint;
  v_amount numeric(12,2) := round(coalesce(p_amount, 0), 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'cash_movement_amount_invalid';
  END IF;

  IF p_type NOT IN ('cash_in', 'cash_out', 'withdrawal', 'supply', 'adjustment') THEN
    RAISE EXCEPTION 'cash_movement_type_invalid';
  END IF;

  SELECT * INTO v_register
  FROM public.cash_registers cr
  WHERE cr.id = p_cash_register_id
  FOR UPDATE;

  IF NOT FOUND OR v_register.status <> 'open' THEN
    RAISE EXCEPTION 'cash_not_open';
  END IF;

  IF NOT public.can_access_branch(v_register.branch_id) THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;

  v_direction := CASE
    WHEN p_type IN ('cash_out', 'withdrawal') THEN -1
    WHEN p_type IN ('cash_in', 'supply') THEN 1
    ELSE coalesce(p_direction, 1)
  END;

  IF v_direction NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'cash_movement_direction_invalid';
  END IF;

  IF p_type = 'withdrawal'
     AND NULLIF(trim(coalesce(p_description, '')), '') IS NULL THEN
    RAISE EXCEPTION 'withdrawal_reason_required';
  END IF;

  INSERT INTO public.cash_movements (
    organization_id, branch_id, cash_register_id, user_id, created_by,
    type, amount, direction, description
  )
  VALUES (
    v_register.organization_id, v_register.branch_id, v_register.id,
    auth.uid(), auth.uid(), p_type, v_amount, v_direction,
    NULLIF(trim(coalesce(p_description, '')), '')
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_cash_movement(uuid, text, numeric, text, smallint)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cash_current_summary(
  p_branch_id uuid
)
RETURNS TABLE (
  register_id uuid,
  branch_id uuid,
  status text,
  terminal_number integer,
  terminal_name text,
  opened_by uuid,
  opened_at timestamptz,
  opening_balance numeric,
  cash_sales numeric,
  cash_entries numeric,
  cash_withdrawals numeric,
  cash_refunds numeric,
  expected_balance numeric,
  pix_total numeric,
  debit_total numeric,
  credit_total numeric,
  other_total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cr.id, cr.branch_id, cr.status, cr.terminal_number, cr.terminal_name,
    cr.opened_by, cr.opened_at, cr.opening_balance,
    COALESCE(sum(CASE WHEN cm.type = 'sale' AND cm.direction = 1 THEN cm.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN cm.type IN ('cash_in', 'supply', 'adjustment') AND cm.direction = 1 THEN cm.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN cm.type IN ('cash_out', 'withdrawal', 'adjustment') AND cm.direction = -1 THEN cm.amount ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN cm.type = 'sale_reversal' AND cm.direction = -1 THEN cm.amount ELSE 0 END), 0),
    round(
      cr.opening_balance
      + COALESCE(sum(CASE WHEN cm.direction = 1 THEN cm.amount ELSE 0 END), 0)
      - COALESCE(sum(CASE WHEN cm.direction = -1 THEN cm.amount ELSE 0 END), 0),
      2
    ),
    COALESCE((SELECT sum(sp.amount) FROM public.sales s JOIN public.sale_payments sp ON sp.sale_id = s.id WHERE s.cash_register_id = cr.id AND s.status = 'completed' AND sp.method = 'pix'), 0),
    COALESCE((SELECT sum(sp.amount) FROM public.sales s JOIN public.sale_payments sp ON sp.sale_id = s.id WHERE s.cash_register_id = cr.id AND s.status = 'completed' AND sp.method = 'debit_card'), 0),
    COALESCE((SELECT sum(sp.amount) FROM public.sales s JOIN public.sale_payments sp ON sp.sale_id = s.id WHERE s.cash_register_id = cr.id AND s.status = 'completed' AND sp.method = 'credit_card'), 0),
    COALESCE((SELECT sum(sp.amount) FROM public.sales s JOIN public.sale_payments sp ON sp.sale_id = s.id WHERE s.cash_register_id = cr.id AND s.status = 'completed' AND sp.method = 'other'), 0)
  FROM public.cash_registers cr
  LEFT JOIN public.cash_movements cm ON cm.cash_register_id = cr.id
  WHERE cr.branch_id = p_branch_id
    AND public.can_access_branch(p_branch_id)
    AND cr.status = 'open'
  GROUP BY cr.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_current_summary(uuid)
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

  SELECT * INTO v_register
  FROM public.cash_registers cr
  WHERE cr.id = p_cash_register_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cash_not_found';
  END IF;

  IF v_register.status <> 'open' THEN
    RAISE EXCEPTION 'cash_already_closed';
  END IF;

  IF NOT public.can_access_branch(v_register.branch_id) THEN
    RAISE EXCEPTION 'invalid_branch';
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

CREATE OR REPLACE FUNCTION public.get_cash_register_history(
  p_branch_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  register_id uuid,
  branch_id uuid,
  branch_name text,
  terminal_number integer,
  terminal_name text,
  status text,
  opened_by uuid,
  opened_at timestamptz,
  opening_balance numeric,
  closed_by uuid,
  closed_at timestamptz,
  expected_balance numeric,
  counted_balance numeric,
  difference numeric,
  closing_observation text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cr.id, cr.branch_id, b.name, cr.terminal_number, cr.terminal_name,
         cr.status, cr.opened_by, cr.opened_at, cr.opening_balance,
         cr.closed_by, cr.closed_at, cr.expected_balance, cr.counted_balance,
         cr.difference, cr.closing_observation
  FROM public.cash_registers cr
  JOIN public.branches b ON b.id = cr.branch_id
  WHERE public.can_access_branch(cr.branch_id)
    AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    AND (p_status IS NULL OR cr.status = p_status)
    AND (p_start_date IS NULL OR cr.opened_at::date >= p_start_date)
    AND (p_end_date IS NULL OR cr.opened_at::date <= p_end_date)
  ORDER BY cr.opened_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_register_history(uuid, text, date, date)
TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cash_register_movements(
  p_cash_register_id uuid
)
RETURNS TABLE (
  movement_id uuid,
  cash_register_id uuid,
  branch_id uuid,
  type text,
  amount numeric,
  direction smallint,
  description text,
  reference_id uuid,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.id, cm.cash_register_id, cm.branch_id, cm.type, cm.amount,
         cm.direction, cm.description, cm.reference_id, cm.created_by, cm.created_at
  FROM public.cash_movements cm
  JOIN public.cash_registers cr ON cr.id = cm.cash_register_id
  WHERE cm.cash_register_id = p_cash_register_id
    AND public.can_access_branch(cr.branch_id)
  ORDER BY cm.created_at ASC, cm.id ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_register_movements(uuid)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
