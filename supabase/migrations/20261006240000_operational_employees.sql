BEGIN;

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  title text NOT NULL DEFAULT 'Outro' CHECK (btrim(title) <> ''),
  email text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employees_org_active_name_idx
  ON public.employees(organization_id, active, lower(name));

CREATE INDEX IF NOT EXISTS employees_branch_active_idx
  ON public.employees(branch_id, active);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_view_same_organization ON public.employees;
CREATE POLICY employees_view_same_organization
  ON public.employees FOR SELECT TO authenticated
  USING (public.has_permission('users.view', organization_id));

DROP POLICY IF EXISTS employees_insert_same_organization ON public.employees;
CREATE POLICY employees_insert_same_organization
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('users.edit', organization_id));

DROP POLICY IF EXISTS employees_update_same_organization ON public.employees;
CREATE POLICY employees_update_same_organization
  ON public.employees FOR UPDATE TO authenticated
  USING (public.has_permission('users.edit', organization_id))
  WITH CHECK (public.has_permission('users.edit', organization_id));

DROP POLICY IF EXISTS employees_delete_same_organization ON public.employees;
CREATE POLICY employees_delete_same_organization
  ON public.employees FOR DELETE TO authenticated
  USING (public.has_permission('users.edit', organization_id));

CREATE OR REPLACE FUNCTION public.employee_list(p_organization_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  branch_id uuid,
  branch_name text,
  name text,
  title text,
  email text,
  phone text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.id, e.organization_id, e.branch_id, b.name, e.name, e.title,
    e.email, e.phone, e.active, e.created_at, e.updated_at
  FROM public.employees e
  LEFT JOIN public.branches b ON b.id = e.branch_id
  WHERE e.organization_id = p_organization_id
    AND public.has_permission('users.view', p_organization_id)
  ORDER BY e.active DESC, lower(e.name), e.created_at;
$$;

CREATE OR REPLACE FUNCTION public.employee_create(
  p_organization_id uuid,
  p_name text,
  p_title text DEFAULT 'Outro',
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_permission('users.edit', p_organization_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN RAISE EXCEPTION 'employee_name_required'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.organization_id = p_organization_id AND b.active
  ) THEN RAISE EXCEPTION 'invalid_employee_branch'; END IF;

  INSERT INTO public.employees(organization_id, branch_id, name, title, email, phone)
  VALUES (
    p_organization_id,
    p_branch_id,
    btrim(p_name),
    coalesce(nullif(btrim(p_title), ''), 'Outro'),
    nullif(btrim(p_email), ''),
    nullif(btrim(p_phone), '')
  )
  RETURNING employees.id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_update(
  p_employee_id uuid,
  p_name text,
  p_title text DEFAULT 'Outro',
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.employees WHERE id = p_employee_id;
  IF v_org_id IS NULL OR NOT public.has_permission('users.edit', v_org_id) THEN
    RAISE EXCEPTION 'employee_not_found';
  END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN RAISE EXCEPTION 'employee_name_required'; END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.organization_id = v_org_id AND b.active
  ) THEN RAISE EXCEPTION 'invalid_employee_branch'; END IF;

  UPDATE public.employees
  SET name = btrim(p_name),
      title = coalesce(nullif(btrim(p_title), ''), 'Outro'),
      email = nullif(btrim(p_email), ''),
      phone = nullif(btrim(p_phone), ''),
      branch_id = p_branch_id,
      updated_at = now()
  WHERE id = p_employee_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_set_active(p_employee_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.employees WHERE id = p_employee_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'employee_not_found'; END IF;
  IF NOT public.has_permission(CASE WHEN p_active THEN 'users.reactivate' ELSE 'users.deactivate' END, v_org_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE public.employees SET active = p_active, updated_at = now() WHERE id = p_employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.employee_list(uuid), public.employee_create(uuid,text,text,text,text,uuid), public.employee_update(uuid,text,text,text,text,uuid), public.employee_set_active(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_list(uuid), public.employee_create(uuid,text,text,text,text,uuid), public.employee_update(uuid,text,text,text,text,uuid), public.employee_set_active(uuid,boolean) TO authenticated;

ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cash_registers_employee_idx
  ON public.cash_registers(employee_id, opened_at DESC);

CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_branch_id uuid, p_opening_balance numeric DEFAULT 0, p_operator_user_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_role public.member_role;
  v_id uuid;
  v_employee_id uuid;
  v_opened_by uuid := auth.uid();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF coalesce(p_opening_balance, 0) < 0 THEN RAISE EXCEPTION 'opening_balance_invalid'; END IF;
  SELECT organization_id INTO v_org
  FROM public.branches
  WHERE id = p_branch_id AND active AND public.can_access_branch(id);
  IF v_org IS NULL THEN RAISE EXCEPTION 'invalid_branch'; END IF;
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = v_org AND user_id = auth.uid() AND active;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;

  IF p_operator_user_id IS NOT NULL THEN
    SELECT e.id INTO v_employee_id
    FROM public.employees e
    WHERE e.id = p_operator_user_id
      AND e.organization_id = v_org
      AND e.active = true
      AND (e.branch_id IS NULL OR e.branch_id = p_branch_id);
    IF v_employee_id IS NULL THEN
      IF p_operator_user_id <> auth.uid()
         AND v_role NOT IN ('owner', 'admin', 'manager') THEN
        RAISE EXCEPTION 'operator_selection_denied';
      END IF;
      IF p_operator_user_id <> auth.uid() AND NOT EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = v_org AND om.user_id = p_operator_user_id AND om.active
      ) THEN RAISE EXCEPTION 'operator_not_found'; END IF;
      v_opened_by := p_operator_user_id;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.cash_registers WHERE branch_id = p_branch_id AND status = 'open') THEN
    RAISE EXCEPTION 'cash_already_open';
  END IF;
  INSERT INTO public.cash_registers (
    organization_id, branch_id, opened_by, employee_id, opened_at,
    opening_balance, terminal_number, terminal_name, status
  ) VALUES (
    v_org, p_branch_id, v_opened_by, v_employee_id, now(),
    round(coalesce(p_opening_balance, 0), 2), 1, 'Caixa 01', 'open'
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'cash_already_open';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_current_summary_with_employee(p_branch_id uuid)
RETURNS TABLE(
  register_id uuid, branch_id uuid, status text, terminal_number integer,
  terminal_name text, opened_by uuid, employee_id uuid, employee_name text,
  employee_title text, opened_at timestamptz, opening_balance numeric,
  cash_sales numeric, cash_entries numeric, cash_withdrawals numeric,
  cash_refunds numeric, expected_balance numeric, pix_total numeric,
  debit_total numeric, credit_total numeric, other_total numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cr.id, cr.branch_id, cr.status, cr.terminal_number, cr.terminal_name,
    cr.opened_by, cr.employee_id, e.name, e.title, cr.opened_at, cr.opening_balance,
    coalesce(sum(CASE WHEN cm.type = 'sale' AND cm.direction = 1 THEN cm.amount ELSE 0 END), 0),
    coalesce(sum(CASE WHEN cm.type IN ('cash_in', 'supply', 'adjustment') AND cm.direction = 1 THEN cm.amount ELSE 0 END), 0),
    coalesce(sum(CASE WHEN cm.type IN ('cash_out', 'withdrawal', 'adjustment') AND cm.direction = -1 THEN cm.amount ELSE 0 END), 0),
    coalesce(sum(CASE WHEN cm.type = 'sale_reversal' AND cm.direction = -1 THEN cm.amount ELSE 0 END), 0),
    round(cr.opening_balance + coalesce(sum(CASE WHEN cm.direction = 1 THEN cm.amount ELSE 0 END), 0) - coalesce(sum(CASE WHEN cm.direction = -1 THEN cm.amount ELSE 0 END), 0), 2),
    coalesce((select sum(sp.amount) from public.sales s join public.sale_payments sp on sp.sale_id = s.id where s.cash_register_id = cr.id and s.status = 'completed' and sp.method = 'pix'), 0),
    coalesce((select sum(sp.amount) from public.sales s join public.sale_payments sp on sp.sale_id = s.id where s.cash_register_id = cr.id and s.status = 'completed' and sp.method = 'debit_card'), 0),
    coalesce((select sum(sp.amount) from public.sales s join public.sale_payments sp on sp.sale_id = s.id where s.cash_register_id = cr.id and s.status = 'completed' and sp.method = 'credit_card'), 0),
    coalesce((select sum(sp.amount) from public.sales s join public.sale_payments sp on sp.sale_id = s.id where s.cash_register_id = cr.id and s.status = 'completed' and sp.method = 'other'), 0)
  FROM public.cash_registers cr
  LEFT JOIN public.cash_movements cm ON cm.cash_register_id = cr.id
  LEFT JOIN public.employees e ON e.id = cr.employee_id
  WHERE cr.branch_id = p_branch_id AND public.can_access_branch(p_branch_id) AND cr.status = 'open'
  GROUP BY cr.id, e.name, e.title;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_register_history_with_employee(
  p_branch_id uuid DEFAULT NULL, p_status text DEFAULT NULL,
  p_start_date date DEFAULT NULL, p_end_date date DEFAULT NULL
)
RETURNS TABLE(
  register_id uuid, branch_id uuid, branch_name text, terminal_number integer,
  terminal_name text, status text, opened_by uuid, employee_id uuid,
  employee_name text, employee_title text, opened_at timestamptz,
  opening_balance numeric, closed_by uuid, closed_at timestamptz,
  expected_balance numeric, counted_balance numeric, difference numeric,
  closing_observation text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cr.id, cr.branch_id, b.name, cr.terminal_number, cr.terminal_name,
    cr.status, cr.opened_by, cr.employee_id, e.name, e.title, cr.opened_at,
    cr.opening_balance, cr.closed_by, cr.closed_at, cr.expected_balance,
    cr.counted_balance, cr.difference, cr.closing_observation
  FROM public.cash_registers cr
  JOIN public.branches b ON b.id = cr.branch_id
  LEFT JOIN public.employees e ON e.id = cr.employee_id
  WHERE public.can_access_branch(cr.branch_id)
    AND (p_branch_id IS NULL OR cr.branch_id = p_branch_id)
    AND (p_status IS NULL OR cr.status = p_status)
    AND (p_start_date IS NULL OR cr.opened_at::date >= p_start_date)
    AND (p_end_date IS NULL OR cr.opened_at::date <= p_end_date)
  ORDER BY cr.opened_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_cash_current_summary_with_employee(uuid), public.get_cash_register_history_with_employee(uuid,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_current_summary_with_employee(uuid), public.get_cash_register_history_with_employee(uuid,text,date,date) TO authenticated;

COMMIT;
