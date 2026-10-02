BEGIN;

-- ============================================================
-- 0020 FINANCE COMPLETION
-- Final operational RPCs for the V1 finance experience.
-- ============================================================

CREATE INDEX IF NOT EXISTS finance_entries_supplier_idx
  ON public.finance_entries (organization_id, supplier_id, due_date);

CREATE INDEX IF NOT EXISTS finance_entries_customer_idx
  ON public.finance_entries (organization_id, customer_id, due_date);

CREATE INDEX IF NOT EXISTS finance_recurring_due_idx
  ON public.finance_recurring_templates (organization_id, active, next_due_date);

-- Keep status derived from date/settlements. This is safe to call before
-- displaying lists because it never changes settlement history.
CREATE OR REPLACE FUNCTION public.finance_refresh_overdue(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_permission('finance.view', p_organization_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;

  UPDATE public.finance_entries fe
  SET status = 'overdue', updated_at = now()
  WHERE fe.organization_id = p_organization_id
    AND fe.status IN ('open','partial')
    AND fe.due_date IS NOT NULL
    AND fe.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND (p_branch_id IS NULL OR fe.branch_id = p_branch_id)
    AND (
      fe.branch_id IS NULL
      OR public.finance_can_access_branch(fe.organization_id, fe.branch_id)
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Manual cancellation is only allowed when nothing has been settled.
-- Purchase-origin entries remain controlled by the purchase workflow.
CREATE OR REPLACE FUNCTION public.finance_cancel_entry(
  p_entry_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.finance_entries%ROWTYPE;
  v_settled numeric;
BEGIN
  SELECT * INTO e
  FROM public.finance_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'entry_not_found'; END IF;
  IF e.origin_type = 'purchase' THEN
    RAISE EXCEPTION 'purchase_entry_must_be_cancelled_at_source';
  END IF;

  IF NOT public.has_permission(
    CASE WHEN e.entry_type='payable'
      THEN 'finance.payable.cancel'
      ELSE 'finance.receivable.cancel'
    END,
    e.organization_id
  ) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;

  IF NOT public.finance_can_access_branch(e.organization_id, e.branch_id) THEN
    RAISE EXCEPTION 'branch_access_denied';
  END IF;

  IF e.status = 'cancelled' THEN RETURN true; END IF;

  v_settled := public.finance_entry_settled_amount(e.id);
  IF v_settled > 0 THEN
    RAISE EXCEPTION 'entry_has_settlements_use_reversal';
  END IF;

  UPDATE public.finance_entries
  SET status='cancelled',
      notes=CASE
        WHEN NULLIF(trim(p_reason),'') IS NULL THEN notes
        WHEN NULLIF(trim(notes),'') IS NULL THEN 'Cancelamento: '||trim(p_reason)
        ELSE notes||E'\nCancelamento: '||trim(p_reason)
      END,
      updated_at=now()
  WHERE id=e.id;

  RETURN true;
END;
$$;

-- Recurring template creation. Generated entries keep origin_type=recurrence
-- and are therefore distinguishable from manual financial facts.
CREATE OR REPLACE FUNCTION public.finance_create_recurring(
  p_organization_id uuid,
  p_branch_id uuid,
  p_entry_type text,
  p_description text,
  p_amount numeric,
  p_frequency text,
  p_next_due_date date,
  p_category_id uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_permission('finance.recurring.manage', p_organization_id)
     OR NOT public.finance_can_access_branch(p_organization_id,p_branch_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;

  IF p_entry_type NOT IN ('payable','receivable') THEN RAISE EXCEPTION 'invalid_entry_type'; END IF;
  IF p_frequency NOT IN ('weekly','monthly','yearly') THEN RAISE EXCEPTION 'invalid_frequency'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_next_due_date IS NULL THEN RAISE EXCEPTION 'invalid_due_date'; END IF;

  INSERT INTO public.finance_recurring_templates (
    organization_id, branch_id, category_id, supplier_id, customer_id,
    entry_type, description, amount, frequency, next_due_date, created_by
  )
  VALUES (
    p_organization_id, p_branch_id, p_category_id, p_supplier_id, p_customer_id,
    p_entry_type, trim(p_description), p_amount, p_frequency, p_next_due_date, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_set_recurring_active(
  p_template_id uuid,
  p_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.finance_recurring_templates%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.finance_recurring_templates WHERE id=p_template_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recurring_not_found'; END IF;

  IF NOT public.has_permission('finance.recurring.manage',t.organization_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;

  IF NOT public.finance_can_access_branch(t.organization_id,t.branch_id) THEN
    RAISE EXCEPTION 'branch_access_denied';
  END IF;

  UPDATE public.finance_recurring_templates
  SET active=p_active, updated_at=now()
  WHERE id=p_template_id;

  RETURN true;
END;
$$;

-- Centralized financial summary used by the page and future reports.
CREATE OR REPLACE FUNCTION public.get_finance_summary(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := COALESCE(p_start,(now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_end date := COALESCE(p_end,v_start);
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_result jsonb;
BEGIN
  IF NOT public.has_permission('finance.view',p_organization_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  IF v_end<v_start THEN RAISE EXCEPTION 'invalid_period'; END IF;

  WITH allowed AS (
    SELECT branch_id
    FROM public.user_branches(p_organization_id,auth.uid())
    WHERE p_branch_id IS NULL OR branch_id=p_branch_id
  ),
  e AS (
    SELECT fe.*,
      GREATEST(fe.amount-public.finance_entry_settled_amount(fe.id),0) AS remaining
    FROM public.finance_entries fe
    WHERE fe.organization_id=p_organization_id
      AND fe.branch_id IN (SELECT branch_id FROM allowed)
      AND fe.status<>'cancelled'
  ),
  settled_period AS (
    SELECT
      COALESCE(SUM(CASE WHEN fs.settlement_type IN ('payment','receipt')
        THEN CASE WHEN fe.entry_type='receivable'
          THEN fs.amount+fs.interest+fs.fine-fs.discount
          ELSE 0 END ELSE 0 END),0) AS received,
      COALESCE(SUM(CASE WHEN fs.settlement_type IN ('payment','receipt')
        THEN CASE WHEN fe.entry_type='payable'
          THEN fs.amount+fs.interest+fs.fine-fs.discount
          ELSE 0 END ELSE 0 END),0) AS paid
    FROM public.finance_settlements fs
    JOIN public.finance_entries fe ON fe.id=fs.entry_id
    WHERE fs.organization_id=p_organization_id
      AND fs.branch_id IN (SELECT branch_id FROM allowed)
      AND (fs.settled_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_start AND v_end
  )
  SELECT jsonb_build_object(
    'payable_open',COALESCE((SELECT SUM(remaining) FROM e WHERE entry_type='payable' AND status IN ('open','partial','overdue')),0),
    'receivable_open',COALESCE((SELECT SUM(remaining) FROM e WHERE entry_type='receivable' AND status IN ('open','partial','overdue')),0),
    'overdue_payable',COALESCE((SELECT SUM(remaining) FROM e WHERE entry_type='payable' AND due_date<v_today AND status IN ('open','partial','overdue')),0),
    'overdue_receivable',COALESCE((SELECT SUM(remaining) FROM e WHERE entry_type='receivable' AND due_date<v_today AND status IN ('open','partial','overdue')),0),
    'received_period',(SELECT received FROM settled_period),
    'paid_period',(SELECT paid FROM settled_period),
    'net_period',(SELECT received-paid FROM settled_period)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finance_refresh_overdue(uuid,uuid),
  public.finance_cancel_entry(uuid,text),
  public.finance_create_recurring(uuid,uuid,text,text,numeric,text,date,uuid,uuid,uuid),
  public.finance_set_recurring_active(uuid,boolean),
  public.get_finance_summary(uuid,uuid,date,date)
TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;