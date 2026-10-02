BEGIN;

-- Backfill existing PDV payment timestamps from the source sale.
-- The column is made nullable during the migration so the backfill can
-- actually happen before the NOT NULL/default constraints are restored.
ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE public.sale_payments sp
SET created_at = s.created_at
FROM public.sales s
WHERE s.id = sp.sale_id
  AND sp.created_at IS NULL;

ALTER TABLE public.sale_payments
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS sale_payments_sale_created_idx
  ON public.sale_payments (sale_id, created_at);

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
  v_opening numeric := 0;
  v_result jsonb;
BEGIN
  IF NOT public.has_permission('finance.cashflow.view', p_organization_id) THEN
    RAISE EXCEPTION 'finance_permission_denied';
  END IF;
  IF v_end < v_start THEN RAISE EXCEPTION 'invalid_period'; END IF;
  IF p_mode NOT IN ('realized','projected') THEN RAISE EXCEPTION 'invalid_cashflow_mode'; END IF;

  SELECT COALESCE(SUM(a.opening_balance),0)
  INTO v_opening
  FROM public.financial_accounts a
  WHERE a.organization_id = p_organization_id
    AND a.active = true
    AND a.opening_balance_date <= v_start
    AND (p_branch_id IS NULL OR a.branch_id = p_branch_id OR a.branch_id IS NULL)
    AND (
      a.branch_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.user_branches(p_organization_id, auth.uid()) ub
        WHERE ub.branch_id = a.branch_id
      )
    );

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
        CASE
          WHEN fs.settlement_type IN ('payment','receipt') THEN
            CASE WHEN fe.entry_type='receivable'
              THEN fs.amount + fs.interest + fs.fine - fs.discount
              ELSE -(fs.amount + fs.interest + fs.fine - fs.discount)
            END
          ELSE
            CASE WHEN fe.entry_type='receivable'
              THEN -(fs.amount + fs.interest + fs.fine - fs.discount)
              ELSE (fs.amount + fs.interest + fs.fine - fs.discount)
            END
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
  base AS (
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
      sales + CASE
        WHEN p_mode='realized' THEN settlements
        ELSE settlements + projected_receipts - projected_payables
      END AS net
    FROM base
  ),
  accumulated AS (
    SELECT *,
      v_opening + SUM(net) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS accumulated_balance
    FROM normalized
  )
  SELECT jsonb_build_object(
    'mode', p_mode,
    'start_date', v_start,
    'end_date', v_end,
    'opening_balance', v_opening,
    'ending_balance', v_opening + COALESCE((SELECT SUM(net) FROM normalized),0),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.day) FROM accumulated a),'[]'::jsonb),
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

GRANT EXECUTE ON FUNCTION public.get_cashflow_report(uuid,uuid,date,date,text) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;