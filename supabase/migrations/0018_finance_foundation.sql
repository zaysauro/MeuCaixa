BEGIN;

-- ============================================================
-- 0018 FINANCE FOUNDATION
-- Contas a pagar/receber, categorias, contas financeiras,
-- baixas imutáveis, saldo inicial e compatibilidade com legado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('expense','income','both')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cash','bank','digital_wallet','other')),
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  opening_balance_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  financial_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('payable','receivable')),
  origin_type text NOT NULL CHECK (origin_type IN ('manual','purchase','sale_credit','recurrence','other_income','other_expense','legacy')),
  origin_id uuid,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  due_date date,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partial','paid','overdue','received','cancelled')),
  notes text,
  legacy_transaction_id uuid UNIQUE REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  entry_id uuid NOT NULL REFERENCES public.finance_entries(id) ON DELETE RESTRICT,
  financial_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  settlement_type text NOT NULL CHECK (settlement_type IN ('payment','receipt','reversal')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  interest numeric(14,2) NOT NULL DEFAULT 0 CHECK (interest >= 0),
  fine numeric(14,2) NOT NULL DEFAULT 0 CHECK (fine >= 0),
  discount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  payment_method text,
  settled_at timestamptz NOT NULL DEFAULT now(),
  reversed_settlement_id uuid REFERENCES public.finance_settlements(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.finance_recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.finance_categories(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('payable','receivable')),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  frequency text NOT NULL CHECK (frequency IN ('monthly','weekly','yearly')),
  next_due_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_entries_org_branch_due_idx
  ON public.finance_entries (organization_id, branch_id, due_date);
CREATE INDEX IF NOT EXISTS finance_entries_org_status_idx
  ON public.finance_entries (organization_id, status);
CREATE INDEX IF NOT EXISTS finance_entries_origin_idx
  ON public.finance_entries (organization_id, origin_type, origin_id);
CREATE INDEX IF NOT EXISTS finance_settlements_entry_date_idx
  ON public.finance_settlements (entry_id, settled_at);
CREATE INDEX IF NOT EXISTS finance_settlements_org_branch_date_idx
  ON public.finance_settlements (organization_id, branch_id, settled_at);
CREATE INDEX IF NOT EXISTS financial_accounts_org_branch_idx
  ON public.financial_accounts (organization_id, branch_id);

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_recurring_templates ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS finance_categories_org_name_uidx
  ON public.finance_categories (organization_id, name);

-- Default categories. Idempotent and editable by the company later.
INSERT INTO public.finance_categories (organization_id, name, kind)
SELECT o.id, x.name, x.kind
FROM public.organizations o
CROSS JOIN (VALUES
  ('Aluguel','expense'),
  ('Energia','expense'),
  ('Água','expense'),
  ('Internet','expense'),
  ('Salários','expense'),
  ('Impostos e taxas','expense'),
  ('Fornecedores','expense'),
  ('Outras despesas','expense'),
  ('Outras receitas','income')
) AS x(name, kind)
ON CONFLICT (organization_id, name) DO NOTHING;

-- Migrate the legacy financial table without changing or deleting it.
INSERT INTO public.finance_entries (
  organization_id, branch_id, category_id, entry_type, origin_type,
  origin_id, description, amount, due_date, status,
  legacy_transaction_id, created_at, created_by, updated_at
)
SELECT
  ft.organization_id,
  ft.branch_id,
  fc.id,
  CASE WHEN ft.type = 'expense' THEN 'payable' ELSE 'receivable' END,
  'legacy',
  ft.id,
  ft.description,
  ft.amount,
  ft.due_date,
  CASE
    WHEN ft.paid_at IS NOT NULL
      THEN CASE WHEN ft.type = 'expense' THEN 'paid' ELSE 'received' END
    WHEN ft.due_date IS NOT NULL
         AND ft.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
      THEN 'overdue'
    ELSE 'open'
  END,
  ft.id,
  ft.created_at,
  ft.created_by,
  ft.created_at
FROM public.financial_transactions ft
LEFT JOIN public.finance_categories fc
  ON fc.organization_id = ft.organization_id
 AND lower(fc.name) = lower(trim(ft.category))
WHERE NOT EXISTS (
  SELECT 1 FROM public.finance_entries fe
  WHERE fe.legacy_transaction_id = ft.id
);

-- Helper: branch access + permission.
CREATE OR REPLACE FUNCTION public.finance_can_access_branch(
  p_organization_id uuid,
  p_branch_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_branches(p_organization_id, auth.uid()) ub
    WHERE p_branch_id IS NULL OR ub.branch_id = p_branch_id
  )
  OR (
    p_branch_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = p_organization_id
        AND om.user_id = auth.uid()
        AND om.active = true
    )
  );
$$;

-- RLS: reads require finance.view; writes are performed by RPCs.
DROP POLICY IF EXISTS finance_categories_select ON public.finance_categories;
CREATE POLICY finance_categories_select ON public.finance_categories
FOR SELECT TO authenticated
USING (
  public.has_permission('finance.view', organization_id)
  AND public.finance_can_access_branch(organization_id, NULL)
);

DROP POLICY IF EXISTS financial_accounts_select ON public.financial_accounts;
CREATE POLICY financial_accounts_select ON public.financial_accounts
FOR SELECT TO authenticated
USING (
  public.has_permission('finance.view', organization_id)
  AND public.finance_can_access_branch(organization_id, branch_id)
);

DROP POLICY IF EXISTS finance_entries_select ON public.finance_entries;
CREATE POLICY finance_entries_select ON public.finance_entries
FOR SELECT TO authenticated
USING (
  public.has_permission('finance.view', organization_id)
  AND public.finance_can_access_branch(organization_id, branch_id)
);

DROP POLICY IF EXISTS finance_settlements_select ON public.finance_settlements;
CREATE POLICY finance_settlements_select ON public.finance_settlements
FOR SELECT TO authenticated
USING (
  public.has_permission('finance.view', organization_id)
  AND public.finance_can_access_branch(organization_id, branch_id)
);

DROP POLICY IF EXISTS finance_recurring_select ON public.finance_recurring_templates;
CREATE POLICY finance_recurring_select ON public.finance_recurring_templates
FOR SELECT TO authenticated
USING (
  public.has_permission('finance.view', organization_id)
  AND public.finance_can_access_branch(organization_id, branch_id)
);

REVOKE INSERT, UPDATE, DELETE ON public.finance_categories,
  public.financial_accounts, public.finance_entries,
  public.finance_settlements, public.finance_recurring_templates
FROM authenticated;

GRANT SELECT ON public.finance_categories,
  public.financial_accounts, public.finance_entries,
  public.finance_settlements, public.finance_recurring_templates
TO authenticated;

-- Calculate effective settled amount without mutating settlement history.
CREATE OR REPLACE FUNCTION public.finance_entry_settled_amount(p_entry_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN settlement_type IN ('payment','receipt') THEN amount ELSE -amount END
  ), 0)
  FROM public.finance_settlements
  WHERE entry_id = p_entry_id;
$$;

CREATE OR REPLACE FUNCTION public.refresh_finance_entry_status(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.finance_entries%ROWTYPE;
  paid numeric;
  new_status text;
BEGIN
  SELECT * INTO e FROM public.finance_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR e.status = 'cancelled' THEN RETURN; END IF;

  paid := public.finance_entry_settled_amount(p_entry_id);

  IF paid >= e.amount THEN
    new_status := CASE WHEN e.entry_type = 'payable' THEN 'paid' ELSE 'received' END;
  ELSIF paid > 0 THEN
    new_status := 'partial';
  ELSIF e.due_date IS NOT NULL
    AND e.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    new_status := 'overdue';
  ELSE
    new_status := 'open';
  END IF;

  UPDATE public.finance_entries
  SET status = new_status, updated_at = now()
  WHERE id = p_entry_id;
END;
$$;

-- Create a manual payable/receivable. Idempotency is supported by origin_type/origin_id
-- for external origins; manual entries receive a unique UUID naturally.
CREATE OR REPLACE FUNCTION public.finance_create_entry(
  p_organization_id uuid,
  p_branch_id uuid,
  p_entry_type text,
  p_description text,
  p_amount numeric,
  p_due_date date DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_origin_type text DEFAULT 'manual',
  p_origin_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_entry_type NOT IN ('payable','receivable') THEN RAISE EXCEPTION 'invalid_entry_type'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_origin_type <> 'manual' AND p_origin_id IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.finance_entries
    WHERE organization_id = p_organization_id
      AND origin_type = p_origin_type
      AND origin_id = p_origin_id
    LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF NOT public.has_permission('finance.create', p_organization_id)
     OR NOT public.finance_can_access_branch(p_organization_id, p_branch_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_categories
    WHERE id = p_category_id AND organization_id = p_organization_id AND active = true
  ) THEN RAISE EXCEPTION 'invalid_category'; END IF;

  INSERT INTO public.finance_entries (
    organization_id, branch_id, category_id, supplier_id, customer_id,
    entry_type, origin_type, origin_id, description, amount, due_date, created_by
  )
  VALUES (
    p_organization_id, p_branch_id, p_category_id, p_supplier_id, p_customer_id,
    p_entry_type, p_origin_type, p_origin_id, trim(p_description), p_amount, p_due_date, auth.uid()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Atomic settlement. Original settlement rows are immutable.
CREATE OR REPLACE FUNCTION public.finance_settle(
  p_entry_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT NULL,
  p_financial_account_id uuid DEFAULT NULL,
  p_interest numeric DEFAULT 0,
  p_fine numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_idempotency_key uuid DEFAULT NULL,
  p_settled_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.finance_entries%ROWTYPE;
  v_id uuid;
  v_paid numeric;
  v_remaining numeric;
  v_total numeric;
BEGIN
  SELECT * INTO e FROM public.finance_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entry_not_found'; END IF;
  IF e.status = 'cancelled' THEN RAISE EXCEPTION 'entry_cancelled'; END IF;
  IF NOT public.has_permission(
      CASE WHEN e.entry_type = 'payable' THEN 'finance.payable.pay' ELSE 'finance.receivable.receive' END,
      e.organization_id
    ) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  IF NOT public.finance_can_access_branch(e.organization_id, e.branch_id) THEN
    RAISE EXCEPTION 'branch_access_denied';
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_interest < 0 OR p_fine < 0 OR p_discount < 0 THEN RAISE EXCEPTION 'invalid_adjustment'; END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.finance_settlements
    WHERE organization_id = e.organization_id AND idempotency_key = p_idempotency_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  v_paid := public.finance_entry_settled_amount(e.id);
  v_remaining := e.amount - v_paid;
  IF p_amount > v_remaining THEN RAISE EXCEPTION 'settlement_exceeds_balance'; END IF;

  v_total := p_amount + p_interest + p_fine - p_discount;
  IF v_total <= 0 THEN RAISE EXCEPTION 'invalid_settlement_total'; END IF;

  INSERT INTO public.finance_settlements (
    organization_id, branch_id, entry_id, financial_account_id,
    settlement_type, amount, interest, fine, discount,
    payment_method, settled_at, idempotency_key, notes, created_by
  )
  VALUES (
    e.organization_id, e.branch_id, e.id, p_financial_account_id,
    CASE WHEN e.entry_type = 'payable' THEN 'payment' ELSE 'receipt' END,
    p_amount, p_interest, p_fine, p_discount,
    p_payment_method, COALESCE(p_settled_at, now()),
    COALESCE(p_idempotency_key, gen_random_uuid()), p_notes, auth.uid()
  )
  RETURNING id INTO v_id;

  PERFORM public.refresh_finance_entry_status(e.id);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_reverse_settlement(
  p_settlement_id uuid,
  p_idempotency_key uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.finance_settlements%ROWTYPE;
  e public.finance_entries%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO s FROM public.finance_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'settlement_not_found'; END IF;
  IF s.settlement_type = 'reversal' THEN RAISE EXCEPTION 'cannot_reverse_reversal'; END IF;

  SELECT * INTO e FROM public.finance_entries WHERE id = s.entry_id FOR UPDATE;
  IF NOT public.has_permission(
      CASE WHEN e.entry_type = 'payable' THEN 'finance.payable.reverse' ELSE 'finance.receivable.reverse' END,
      e.organization_id
    ) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.finance_settlements
    WHERE reversed_settlement_id = s.id
  ) THEN
    RAISE EXCEPTION 'settlement_already_reversed';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.finance_settlements
    WHERE organization_id = e.organization_id AND idempotency_key = p_idempotency_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO public.finance_settlements (
    organization_id, branch_id, entry_id, financial_account_id,
    settlement_type, amount, payment_method, settled_at,
    reversed_settlement_id, idempotency_key, notes, created_by
  )
  VALUES (
    s.organization_id, s.branch_id, s.entry_id, s.financial_account_id,
    'reversal', s.amount, s.payment_method, now(),
    s.id, COALESCE(p_idempotency_key, gen_random_uuid()),
    COALESCE(p_reason, 'Estorno de baixa'), auth.uid()
  )
  RETURNING id INTO v_id;

  PERFORM public.refresh_finance_entry_status(e.id);
  RETURN v_id;
END;
$$;

-- Category management through RPC.
CREATE OR REPLACE FUNCTION public.finance_create_category(
  p_organization_id uuid,
  p_name text,
  p_kind text DEFAULT 'both'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_permission('finance.categories.manage', p_organization_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  INSERT INTO public.finance_categories (organization_id, name, kind, created_by)
  VALUES (p_organization_id, trim(p_name), p_kind, auth.uid())
  ON CONFLICT (organization_id, name) DO UPDATE
    SET active = true
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Financial accounts / opening balance.
CREATE OR REPLACE FUNCTION public.finance_create_account(
  p_organization_id uuid,
  p_branch_id uuid,
  p_name text,
  p_kind text,
  p_opening_balance numeric DEFAULT 0,
  p_opening_balance_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_permission('finance.accounts.manage', p_organization_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  IF NOT public.finance_can_access_branch(p_organization_id, p_branch_id) THEN
    RAISE EXCEPTION 'branch_access_denied';
  END IF;
  INSERT INTO public.financial_accounts (
    organization_id, branch_id, name, kind,
    opening_balance, opening_balance_date, created_by
  )
  VALUES (
    p_organization_id, p_branch_id, trim(p_name), p_kind,
    COALESCE(p_opening_balance,0),
    COALESCE(p_opening_balance_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    auth.uid()
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Recurring generation is on-demand for V1.
CREATE OR REPLACE FUNCTION public.finance_generate_recurring(
  p_organization_id uuid,
  p_until date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.finance_recurring_templates%ROWTYPE;
  d date;
  v_until date := COALESCE(p_until, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 90);
  v_count integer := 0;
  v_existing boolean;
BEGIN
  IF NOT public.has_permission('finance.recurring.manage', p_organization_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;

  FOR t IN
    SELECT * FROM public.finance_recurring_templates
    WHERE organization_id = p_organization_id AND active = true
  LOOP
    d := t.next_due_date;
    WHILE d <= v_until LOOP
      SELECT EXISTS (
        SELECT 1 FROM public.finance_entries
        WHERE organization_id = t.organization_id
          AND origin_type = 'recurrence'
          AND origin_id = t.id
          AND due_date = d
      ) INTO v_existing;

      IF NOT v_existing THEN
        PERFORM public.finance_create_entry(
          t.organization_id, t.branch_id, t.entry_type, t.description,
          t.amount, d, t.category_id, t.supplier_id, t.customer_id,
          'recurrence', t.id
        );
        v_count := v_count + 1;
      END IF;

      d := CASE
        WHEN t.frequency = 'weekly' THEN d + interval '7 days'
        WHEN t.frequency = 'yearly' THEN d + interval '1 year'
        ELSE d + interval '1 month'
      END;
    END LOOP;

    UPDATE public.finance_recurring_templates
    SET next_due_date = d, updated_at = now()
    WHERE id = t.id;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Cash-flow aggregation. Sales are read from sale_payments, never copied.
CREATE OR REPLACE FUNCTION public.get_cashflow_report(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_mode text DEFAULT 'realized'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := COALESCE(p_start, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_end date := COALESCE(p_end, v_start);
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_result jsonb;
BEGIN
  IF NOT public.has_permission('finance.cashflow.view', p_organization_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  IF v_end < v_start THEN RAISE EXCEPTION 'invalid_period'; END IF;
  IF p_mode NOT IN ('realized','projected') THEN RAISE EXCEPTION 'invalid_cashflow_mode'; END IF;

  WITH allowed AS (
    SELECT branch_id
    FROM public.user_branches(p_organization_id, auth.uid())
    WHERE p_branch_id IS NULL OR branch_id = p_branch_id
  ),
  sales_daily AS (
    SELECT
      (sp.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      COALESCE(SUM(sp.amount),0) AS amount
    FROM public.sale_payments sp
    JOIN public.sales s ON s.id = sp.sale_id
    WHERE s.organization_id = p_organization_id
      AND s.status = 'completed'
      AND s.branch_id IN (SELECT branch_id FROM allowed)
      AND (sp.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_start AND v_end
    GROUP BY 1
  ),
  settlements_daily AS (
    SELECT
      (fs.settled_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      COALESCE(SUM(
        CASE WHEN fs.settlement_type IN ('payment','receipt')
             THEN CASE WHEN fe.entry_type='receivable' THEN fs.amount + fs.interest + fs.fine - fs.discount
                       ELSE -(fs.amount + fs.interest + fs.fine - fs.discount) END
             ELSE CASE WHEN fe.entry_type='receivable' THEN -(fs.amount + fs.interest + fs.fine - fs.discount)
                       ELSE (fs.amount + fs.interest + fs.fine - fs.discount) END
        END
      ),0) AS net
    FROM public.finance_settlements fs
    JOIN public.finance_entries fe ON fe.id = fs.entry_id
    WHERE fs.organization_id = p_organization_id
      AND fs.branch_id IN (SELECT branch_id FROM allowed)
      AND (fs.settled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_start AND v_end
    GROUP BY 1
  ),
  open_daily AS (
    SELECT
      fe.due_date AS day,
      COALESCE(SUM(CASE WHEN fe.entry_type='receivable' THEN fe.amount - public.finance_entry_settled_amount(fe.id) ELSE 0 END),0) AS receivable,
      COALESCE(SUM(CASE WHEN fe.entry_type='payable' THEN fe.amount - public.finance_entry_settled_amount(fe.id) ELSE 0 END),0) AS payable
    FROM public.finance_entries fe
    WHERE fe.organization_id = p_organization_id
      AND fe.branch_id IN (SELECT branch_id FROM allowed)
      AND fe.status <> 'cancelled'
      AND fe.due_date BETWEEN v_start AND v_end
    GROUP BY 1
  ),
  days AS (
    SELECT generate_series(v_start, v_end, interval '1 day')::date AS day
  ),
  rows AS (
    SELECT
      d.day,
      COALESCE(sd.amount,0) AS sales,
      COALESCE(sd2.net,0) AS settlements,
      CASE WHEN p_mode='projected' THEN COALESCE(od.receivable,0) ELSE 0 END AS projected_receipts,
      CASE WHEN p_mode='projected' THEN COALESCE(od.payable,0) ELSE 0 END AS projected_payables
    FROM days d
    LEFT JOIN sales_daily sd ON sd.day=d.day
    LEFT JOIN settlements_daily sd2 ON sd2.day=d.day
    LEFT JOIN open_daily od ON od.day=d.day
  ),
  normalized AS (
    SELECT *,
      sales + CASE WHEN p_mode='realized' THEN settlements ELSE settlements + projected_receipts - projected_payables END AS net
    FROM rows
  )
  SELECT jsonb_build_object(
    'mode', p_mode,
    'start_date', v_start,
    'end_date', v_end,
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.day) FROM normalized n),'[]'::jsonb),
    'totals', (
      SELECT jsonb_build_object(
        'sales', COALESCE(sum(sales),0),
        'settlements', COALESCE(sum(settlements),0),
        'projected_receipts', COALESCE(sum(projected_receipts),0),
        'projected_payables', COALESCE(sum(projected_payables),0),
        'net', COALESCE(sum(net),0)
      ) FROM normalized
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- New granular permissions. Keep old finance.* permissions intact.
ALTER TABLE public.permissions
  ALTER COLUMN name SET DEFAULT '';

INSERT INTO public.permissions (key,module,description) VALUES
  ('finance.payable.create','finance','Criar conta a pagar'),
  ('finance.payable.pay','finance','Baixar conta a pagar'),
  ('finance.payable.cancel','finance','Cancelar conta a pagar'),
  ('finance.payable.reverse','finance','Estornar pagamento de conta a pagar'),
  ('finance.receivable.create','finance','Criar conta a receber'),
  ('finance.receivable.receive','finance','Registrar recebimento'),
  ('finance.receivable.cancel','finance','Cancelar conta a receber'),
  ('finance.receivable.reverse','finance','Estornar recebimento'),
  ('finance.cashflow.view','finance','Visualizar fluxo de caixa'),
  ('finance.categories.manage','finance','Gerenciar categorias financeiras'),
  ('finance.accounts.manage','finance','Gerenciar contas financeiras'),
  ('finance.recurring.manage','finance','Gerenciar lançamentos recorrentes')
ON CONFLICT (key) DO UPDATE SET description=EXCLUDED.description,module=EXCLUDED.module;

UPDATE public.permissions
SET name = key
WHERE name IS NULL OR name = '';

ALTER TABLE public.permissions
  ALTER COLUMN name DROP DEFAULT;

-- Owner/admin inherit all new finance permissions. Manager gets operational finance.
INSERT INTO public.role_permissions(role,permission_key)
SELECT r.role::public.member_role, p.key
FROM (VALUES ('owner'),('admin')) r(role)
CROSS JOIN public.permissions p
WHERE p.key LIKE 'finance.%'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role,permission_key)
SELECT 'manager'::public.member_role, p.key
FROM public.permissions p
WHERE p.key IN (
  'finance.view','finance.create','finance.pay','finance.export',
  'finance.payable.create','finance.payable.pay',
  'finance.payable.reverse','finance.receivable.create',
  'finance.receivable.receive','finance.receivable.reverse',
  'finance.cashflow.view'
)
ON CONFLICT DO NOTHING;

GRANT EXECUTE ON FUNCTION public.finance_can_access_branch(uuid,uuid),
  public.finance_entry_settled_amount(uuid),
  public.refresh_finance_entry_status(uuid),
  public.finance_create_entry(uuid,uuid,text,text,numeric,date,uuid,uuid,uuid,text,uuid),
  public.finance_settle(uuid,numeric,text,uuid,numeric,numeric,numeric,uuid,timestamptz,text),
  public.finance_reverse_settlement(uuid,uuid,text),
  public.finance_create_category(uuid,text,text),
  public.finance_create_account(uuid,uuid,text,text,numeric,date),
  public.finance_generate_recurring(uuid,date),
  public.get_cashflow_report(uuid,uuid,date,date,text)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
