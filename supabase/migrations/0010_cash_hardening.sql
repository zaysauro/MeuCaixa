-- 0010_cash_hardening.sql
-- Fecha as últimas lacunas da fundação de caixa antes da integração com o PDV.

BEGIN;

-- Histórico antigo sem branch_id deve permanecer consultável por membros da organização.
-- Novas movimentações continuam obrigadas a informar a filial através dos RPCs.
DROP POLICY IF EXISTS "members view cash movements by branch" ON public.cash_movements;

CREATE POLICY "members view cash movements by branch"
ON public.cash_movements
FOR SELECT
TO authenticated
USING (
  (
    branch_id IS NOT NULL
    AND public.can_access_branch(branch_id)
  )
  OR (
    branch_id IS NULL
    AND public.is_organization_member(organization_id)
  )
);

-- Operadores/gerentes somente trabalham no caixa de uma filial que podem acessar.
-- Owner/admin continuam com acesso a todas as filiais da organização através de can_access_branch().
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

  SELECT *
    INTO v_register
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
    organization_id,
    branch_id,
    cash_register_id,
    user_id,
    created_by,
    type,
    amount,
    direction,
    description
  )
  VALUES (
    v_register.organization_id,
    v_register.branch_id,
    v_register.id,
    auth.uid(),
    auth.uid(),
    p_type,
    v_amount,
    v_direction,
    NULLIF(trim(coalesce(p_description, '')), '')
  )
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_cash_movement(uuid, text, numeric, text, smallint)
TO authenticated;

-- Regra explícita para impedir que um caixa aberto seja alterado para outro terminal.
-- O limite 1..5 já está no CHECK; o plano básico continua com apenas o terminal 01.
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
       OR NEW.terminal_number IS DISTINCT FROM OLD.terminal_number
       OR NEW.terminal_name IS DISTINCT FROM OLD.terminal_name
       OR NEW.terminal_identifier IS DISTINCT FROM OLD.terminal_identifier THEN
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

NOTIFY pgrst, 'reload schema';

COMMIT;
