-- 0015_reports_foundation.sql
-- Relatórios gerenciais do MeuCaixa/Kumo.
-- Fonte única de métricas, agregação no PostgreSQL e segurança por filial.

BEGIN;

-- Compatibility: the live project may have the basic cash schema without
-- the hardening columns from 0009-0011. Reports need these fields.
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS terminal_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS terminal_name text NOT NULL DEFAULT 'Caixa 01',
  ADD COLUMN IF NOT EXISTS terminal_identifier text,
  ADD COLUMN IF NOT EXISTS expected_balance numeric(12,2),
  ADD COLUMN IF NOT EXISTS counted_balance numeric(12,2),
  ADD COLUMN IF NOT EXISTS difference numeric(12,2),
  ADD COLUMN IF NOT EXISTS closing_observation text;

ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS direction smallint NOT NULL DEFAULT 1;

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

-- ============================================================
-- 1. ÍNDICES PARA CONSULTAS DE RELATÓRIOS
-- ============================================================

CREATE INDEX IF NOT EXISTS sales_org_branch_created_idx
  ON public.sales (organization_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sales_org_status_created_idx
  ON public.sales (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS sale_items_sale_product_idx
  ON public.sale_items (sale_id, product_id);

CREATE INDEX IF NOT EXISTS sale_payments_sale_method_idx
  ON public.sale_payments (sale_id, method);

CREATE INDEX IF NOT EXISTS sale_payments_method_idx
  ON public.sale_payments (method);

CREATE INDEX IF NOT EXISTS cash_registers_org_branch_opened_idx
  ON public.cash_registers (organization_id, branch_id, opened_at DESC);

CREATE INDEX IF NOT EXISTS cash_registers_status_opened_idx
  ON public.cash_registers (status, opened_at DESC);

CREATE INDEX IF NOT EXISTS cash_movements_org_branch_created_idx
  ON public.cash_movements (organization_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cash_movements_register_created_idx
  ON public.cash_movements (cash_register_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_movements_org_branch_created_idx
  ON public.inventory_movements (organization_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS branch_product_stock_org_branch_idx
  ON public.branch_product_stock (organization_id, branch_id);

CREATE INDEX IF NOT EXISTS branch_product_stock_branch_min_idx
  ON public.branch_product_stock (branch_id, stock_quantity, minimum_stock);

CREATE INDEX IF NOT EXISTS financial_transactions_org_branch_created_idx
  ON public.financial_transactions (organization_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS financial_transactions_org_branch_due_idx
  ON public.financial_transactions (organization_id, branch_id, due_date);

CREATE INDEX IF NOT EXISTS financial_transactions_paid_idx
  ON public.financial_transactions (organization_id, branch_id, paid_at);

-- ============================================================
-- 2. HELPER: FILIAIS QUE O USUÁRIO REALMENTE PODE VER
-- ============================================================

CREATE OR REPLACE FUNCTION public.report_allowed_branches(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  is_headquarters boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_my_branches() mb
    WHERE mb.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'invalid_organization';
  END IF;

  IF p_branch_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.get_my_branches() mb
       WHERE mb.organization_id = p_organization_id
         AND mb.branch_id = p_branch_id
     ) THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;

  RETURN QUERY
  SELECT
    mb.branch_id,
    mb.branch_name,
    mb.is_headquarters
  FROM public.get_my_branches() mb
  WHERE mb.organization_id = p_organization_id
    AND (p_branch_id IS NULL OR mb.branch_id = p_branch_id)
  ORDER BY mb.is_headquarters DESC, mb.branch_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_allowed_branches(uuid, uuid)
TO authenticated;

-- ============================================================
-- 3. RELATÓRIO DE VENDAS
--
-- DEFINIÇÕES OFICIAIS:
-- completed = faturamento e ticket
-- cancelled = somente cancelamentos
-- faturamento = SUM(sales.total)
-- desconto = SUM(sales.subtotal - sales.total)
-- ticket = faturamento / vendas
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_sales_report(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_compare_start timestamptz DEFAULT NULL,
  p_compare_end timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, now() - interval '1 day');
  v_end timestamptz := COALESCE(p_end, now());
  v_compare_start timestamptz := p_compare_start;
  v_compare_end timestamptz := p_compare_end;
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_offset integer;
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.report_allowed_branches(p_organization_id, p_branch_id);

  IF v_end <= v_start THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'sales_count', COALESCE((
        SELECT count(*)
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_start
          AND s.created_at < v_end
      ), 0),

      'revenue', COALESCE((
        SELECT sum(s.total)
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_start
          AND s.created_at < v_end
      ), 0),

      'gross_before_discount', COALESCE((
        SELECT sum(s.subtotal)
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_start
          AND s.created_at < v_end
      ), 0),

      'discount', COALESCE((
        SELECT sum(GREATEST(s.subtotal - s.total, 0))
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_start
          AND s.created_at < v_end
      ), 0),

      'average_ticket', COALESCE((
        SELECT
          CASE
            WHEN count(*) = 0 THEN 0
            ELSE sum(s.total) / count(*)
          END
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_start
          AND s.created_at < v_end
      ), 0),

      'cancelled_count', COALESCE((
        SELECT count(*)
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'cancelled'
          AND s.created_at >= v_start
          AND s.created_at < v_end
      ), 0),

      'cancelled_value', COALESCE((
        SELECT sum(s.total)
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'cancelled'
          AND s.created_at >= v_start
          AND s.created_at < v_end
      ), 0)
    ),

    'comparison', jsonb_build_object(
      'sales_count', COALESCE((
        SELECT count(*)
        FROM public.sales s
        WHERE v_compare_start IS NOT NULL
          AND v_compare_end IS NOT NULL
          AND s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_compare_start
          AND s.created_at < v_compare_end
      ), 0),
      'revenue', COALESCE((
        SELECT sum(s.total)
        FROM public.sales s
        WHERE v_compare_start IS NOT NULL
          AND v_compare_end IS NOT NULL
          AND s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_compare_start
          AND s.created_at < v_compare_end
      ), 0),
      'discount', COALESCE((
        SELECT sum(GREATEST(s.subtotal - s.total, 0))
        FROM public.sales s
        WHERE v_compare_start IS NOT NULL
          AND v_compare_end IS NOT NULL
          AND s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_compare_start
          AND s.created_at < v_compare_end
      ), 0)
    ),

    'payment_breakdown', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'method', x.method,
          'amount', x.amount
        )
        ORDER BY x.amount DESC
      )
      FROM (
        SELECT
          sp.method,
          sum(sp.amount) AS amount
        FROM public.sale_payments sp
        JOIN public.sales s ON s.id = sp.sale_id
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_start
          AND s.created_at < v_end
        GROUP BY sp.method
      ) x
    ), '[]'::jsonb),

    'trend', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'bucket', x.bucket,
          'label', x.label,
          'revenue', x.revenue,
          'sales_count', x.sales_count
        )
        ORDER BY x.bucket
      )
      FROM (
        SELECT
          CASE
            WHEN v_end - v_start <= interval '2 days'
              THEN date_trunc('hour', s.created_at AT TIME ZONE 'America/Sao_Paulo')
            ELSE date_trunc('day', s.created_at AT TIME ZONE 'America/Sao_Paulo')
          END AS bucket,
          CASE
            WHEN v_end - v_start <= interval '2 days'
              THEN to_char(
                date_trunc('hour', s.created_at AT TIME ZONE 'America/Sao_Paulo'),
                'HH24:00'
              )
            ELSE to_char(
              date_trunc('day', s.created_at AT TIME ZONE 'America/Sao_Paulo'),
              'DD/MM'
            )
          END AS label,
          sum(s.total) AS revenue,
          count(*) AS sales_count
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.status = 'completed'
          AND s.created_at >= v_start
          AND s.created_at < v_end
        GROUP BY 1, 2
      ) x
    ), '[]'::jsonb),

    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          s.id,
          s.sale_number,
          s.branch_id,
          b.name AS branch_name,
          s.status,
          s.subtotal,
          s.discount,
          s.total,
          GREATEST(s.subtotal - s.total, 0) AS total_discount,
          s.created_at,
          c.name AS customer_name,
          p.full_name AS seller_name
        FROM public.sales s
        JOIN public.branches b ON b.id = s.branch_id
        LEFT JOIN public.customers c ON c.id = s.customer_id
        LEFT JOIN public.profiles p ON p.id = s.created_by
        WHERE s.organization_id = p_organization_id
          AND s.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND s.created_at >= v_start
          AND s.created_at < v_end
        ORDER BY s.created_at DESC
        LIMIT v_page_size
        OFFSET v_offset
      ) x
    ), '[]'::jsonb),

    'total_rows', (
      SELECT count(*)
      FROM public.sales s
      WHERE s.organization_id = p_organization_id
        AND s.branch_id IN (
          SELECT ab.branch_id
          FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
        )
        AND s.created_at >= v_start
        AND s.created_at < v_end
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_report(uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz, integer, integer)
TO authenticated;

-- ============================================================
-- 4. RELATÓRIO DE PRODUTOS
--
-- CUSTO:
-- custo > 0 = custo histórico disponível.
-- custo = 0 = sem custo informado para fins de margem/lucro.
-- Não tratamos zero como lucro.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_products_report(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_top_n integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, now() - interval '1 day');
  v_end timestamptz := COALESCE(p_end, now());
  v_top_n integer := LEAST(GREATEST(COALESCE(p_top_n, 10), 1), 100);
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.report_allowed_branches(p_organization_id, p_branch_id);

  IF v_end <= v_start THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;

  WITH allowed AS (
    SELECT branch_id
    FROM public.report_allowed_branches(p_organization_id, p_branch_id)
  ),
  sales_agg AS (
    SELECT
      si.product_id,
      COALESCE(NULLIF(max(si.product_name), ''), max(pr.name), 'Produto') AS product_name,
      max(si.unit) AS unit,
      sum(si.quantity) AS quantity,
      sum(si.total) AS revenue,
      sum(
        CASE
          WHEN COALESCE(si.unit_cost, 0) > 0
            THEN COALESCE(si.total_cost, 0)
          ELSE 0
        END
      ) AS known_cost,
      sum(
        CASE
          WHEN COALESCE(si.unit_cost, 0) > 0
            THEN COALESCE(si.profit, si.total - si.total_cost, 0)
          ELSE 0
        END
      ) AS known_profit,
      sum(
        CASE
          WHEN COALESCE(si.unit_cost, 0) > 0 THEN si.quantity
          ELSE 0
        END
      ) AS quantity_with_cost,
      sum(
        CASE
          WHEN COALESCE(si.unit_cost, 0) <= 0 THEN si.quantity
          ELSE 0
        END
      ) AS quantity_without_cost
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    LEFT JOIN public.products pr ON pr.id = si.product_id
    WHERE s.organization_id = p_organization_id
      AND s.branch_id IN (SELECT branch_id FROM allowed)
      AND s.status = 'completed'
      AND s.created_at >= v_start
      AND s.created_at < v_end
    GROUP BY si.product_id
  ),
  stock_agg AS (
    SELECT
      ps.product_id,
      sum(ps.stock_quantity) AS stock_quantity,
      sum(ps.minimum_stock) AS minimum_stock
    FROM public.branch_product_stock ps
    WHERE ps.organization_id = p_organization_id
      AND ps.branch_id IN (SELECT branch_id FROM allowed)
    GROUP BY ps.product_id
  ),
  low_stock AS (
    SELECT
      ps.product_id,
      p.name AS product_name,
      b.name AS branch_name,
      ps.stock_quantity,
      ps.minimum_stock
    FROM public.branch_product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    JOIN public.branches b ON b.id = ps.branch_id
    WHERE ps.organization_id = p_organization_id
      AND ps.branch_id IN (SELECT branch_id FROM allowed)
      AND p.active = true
      AND ps.stock_quantity <= ps.minimum_stock
      AND ps.minimum_stock > 0
  ),
  zero_stock AS (
    SELECT
      ps.product_id,
      p.name AS product_name,
      b.name AS branch_name,
      ps.stock_quantity,
      ps.minimum_stock
    FROM public.branch_product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    JOIN public.branches b ON b.id = ps.branch_id
    WHERE ps.organization_id = p_organization_id
      AND ps.branch_id IN (SELECT branch_id FROM allowed)
      AND p.active = true
      AND ps.stock_quantity <= 0
  ),
  no_sales AS (
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sale_price,
      p.unit,
      sa.stock_quantity
    FROM public.products p
    LEFT JOIN stock_agg sa ON sa.product_id = p.id
    LEFT JOIN sales_agg x ON x.product_id = p.id
    WHERE p.organization_id = p_organization_id
      AND p.active = true
      AND x.product_id IS NULL
    ORDER BY p.name
    LIMIT 200
  )
  SELECT jsonb_build_object(
    'top_by_quantity', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT
          sa.product_id,
          sa.product_name,
          sa.unit,
          sa.quantity,
          sa.revenue,
          sa.known_cost,
          sa.known_profit,
          CASE
            WHEN sa.revenue = 0 OR sa.quantity_without_cost > 0 THEN NULL
            ELSE sa.known_profit / sa.revenue
          END AS margin,
          sa.quantity_without_cost
        FROM sales_agg sa
        ORDER BY sa.quantity DESC, sa.revenue DESC
        LIMIT v_top_n
      ) x
    ), '[]'::jsonb),

    'top_by_revenue', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT
          sa.product_id,
          sa.product_name,
          sa.unit,
          sa.quantity,
          sa.revenue,
          sa.known_cost,
          sa.known_profit,
          CASE
            WHEN sa.revenue = 0 OR sa.quantity_without_cost > 0 THEN NULL
            ELSE sa.known_profit / sa.revenue
          END AS margin,
          sa.quantity_without_cost
        FROM sales_agg sa
        ORDER BY sa.revenue DESC, sa.quantity DESC
        LIMIT v_top_n
      ) x
    ), '[]'::jsonb),

    'low_stock', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT *
        FROM low_stock
        ORDER BY stock_quantity ASC, product_name
        LIMIT 200
      ) x
    ), '[]'::jsonb),

    'zero_stock', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM (
        SELECT *
        FROM zero_stock
        ORDER BY product_name
        LIMIT 200
      ) x
    ), '[]'::jsonb),

    'no_sales', COALESCE((
      SELECT jsonb_agg(to_jsonb(x))
      FROM no_sales x
    ), '[]'::jsonb),

    'summary', jsonb_build_object(
      'active_products', (
        SELECT count(*)
        FROM public.products p
        WHERE p.organization_id = p_organization_id
          AND p.active = true
      ),
      'products_sold', (SELECT count(*) FROM sales_agg),
      'products_without_cost', (
        SELECT count(*)
        FROM sales_agg sa
        WHERE sa.quantity_without_cost > 0
      ),
      'items_without_cost', (
        SELECT COALESCE(sum(sa.quantity_without_cost), 0)
        FROM sales_agg sa
      ),
      'low_stock_count', (SELECT count(*) FROM low_stock),
      'zero_stock_count', (SELECT count(*) FROM zero_stock)
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_products_report(uuid, uuid, timestamptz, timestamptz, integer)
TO authenticated;

-- ============================================================
-- 5. RELATÓRIO DE CAIXA
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_cash_report(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, now() - interval '1 day');
  v_end timestamptz := COALESCE(p_end, now());
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.report_allowed_branches(p_organization_id, p_branch_id);

  IF v_end <= v_start THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;

  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'register_count', (
        SELECT count(*)
        FROM public.cash_registers cr
        WHERE cr.organization_id = p_organization_id
          AND cr.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND cr.opened_at >= v_start
          AND cr.opened_at < v_end
      ),
      'open_count', (
        SELECT count(*)
        FROM public.cash_registers cr
        WHERE cr.organization_id = p_organization_id
          AND cr.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND cr.status = 'open'
      ),
      'difference_total', COALESCE((
        SELECT sum(cr.difference)
        FROM public.cash_registers cr
        WHERE cr.organization_id = p_organization_id
          AND cr.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND cr.status = 'closed'
          AND cr.closed_at >= v_start
          AND cr.closed_at < v_end
      ), 0),
      'cash_out_total', COALESCE((
        SELECT sum(cm.amount)
        FROM public.cash_movements cm
        WHERE cm.organization_id = p_organization_id
          AND cm.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND cm.direction = -1
          AND cm.type IN ('cash_out', 'withdrawal')
          AND cm.created_at >= v_start
          AND cm.created_at < v_end
      ), 0),
      'cash_in_total', COALESCE((
        SELECT sum(cm.amount)
        FROM public.cash_movements cm
        WHERE cm.organization_id = p_organization_id
          AND cm.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND cm.direction = 1
          AND cm.type IN ('cash_in', 'supply')
          AND cm.created_at >= v_start
          AND cm.created_at < v_end
      ), 0)
    ),

    'registers', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.opened_at DESC)
      FROM (
        SELECT
          cr.id AS register_id,
          cr.branch_id,
          b.name AS branch_name,
          cr.terminal_number,
          cr.terminal_name,
          cr.status,
          cr.opened_at,
          cr.closed_at,
          cr.opening_balance,
          cr.expected_balance,
          cr.counted_balance,
          cr.difference,
          cr.closing_observation,
          op.full_name AS opened_by_name,
          cl.full_name AS closed_by_name
        FROM public.cash_registers cr
        JOIN public.branches b ON b.id = cr.branch_id
        LEFT JOIN public.profiles op ON op.id = cr.opened_by
        LEFT JOIN public.profiles cl ON cl.id = cr.closed_by
        WHERE cr.organization_id = p_organization_id
          AND cr.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND cr.opened_at >= v_start
          AND cr.opened_at < v_end
      ) x
    ), '[]'::jsonb),

    'operator_summary', COALESCE((
      SELECT jsonb_agg(to_jsonb(x) ORDER BY x.operator_name)
      FROM (
        SELECT
          COALESCE(p.full_name, 'Operador') AS operator_name,
          count(*) AS register_count,
          COALESCE(sum(cr.difference) FILTER (WHERE cr.status = 'closed'), 0) AS difference_total,
          COALESCE((
            SELECT sum(cm.amount)
            FROM public.cash_movements cm
            WHERE cm.created_by = cr.closed_by
              AND cm.branch_id IN (
                SELECT ab.branch_id
                FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
              )
              AND cm.type IN ('cash_out', 'withdrawal')
              AND cm.created_at >= v_start
              AND cm.created_at < v_end
          ), 0) AS cash_out_total
        FROM public.cash_registers cr
        LEFT JOIN public.profiles p ON p.id = cr.opened_by
        WHERE cr.organization_id = p_organization_id
          AND cr.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND cr.opened_at >= v_start
          AND cr.opened_at < v_end
        GROUP BY p.full_name
      ) x
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_report(uuid, uuid, timestamptz, timestamptz)
TO authenticated;

-- ============================================================
-- 6. RELATÓRIO DE FILIAIS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_branch_report(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, now() - interval '1 day');
  v_end timestamptz := COALESCE(p_end, now());
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.report_allowed_branches(p_organization_id, p_branch_id);

  IF v_end <= v_start THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;

  WITH allowed AS (
    SELECT * FROM public.report_allowed_branches(p_organization_id, p_branch_id)
  ),
  branch_sales AS (
    SELECT
      s.branch_id,
      count(*) FILTER (WHERE s.status = 'completed') AS sales_count,
      COALESCE(sum(s.total) FILTER (WHERE s.status = 'completed'), 0) AS revenue,
      COALESCE(sum(GREATEST(s.subtotal - s.total, 0)) FILTER (WHERE s.status = 'completed'), 0) AS discount,
      count(*) FILTER (WHERE s.status = 'cancelled') AS cancelled_count,
      COALESCE(sum(s.total) FILTER (WHERE s.status = 'cancelled'), 0) AS cancelled_value
    FROM public.sales s
    WHERE s.organization_id = p_organization_id
      AND s.branch_id IN (SELECT branch_id FROM allowed)
      AND s.created_at >= v_start
      AND s.created_at < v_end
    GROUP BY s.branch_id
  ),
  branch_stock AS (
    SELECT
      ps.branch_id,
      count(*) FILTER (
        WHERE p.active = true
          AND ps.minimum_stock > 0
          AND ps.stock_quantity <= ps.minimum_stock
      ) AS low_stock_count
    FROM public.branch_product_stock ps
    JOIN public.products p ON p.id = ps.product_id
    WHERE ps.organization_id = p_organization_id
      AND ps.branch_id IN (SELECT branch_id FROM allowed)
    GROUP BY ps.branch_id
  ),
  branch_cash AS (
    SELECT
      cr.branch_id,
      COALESCE(sum(cr.difference) FILTER (
        WHERE cr.status = 'closed'
          AND cr.closed_at >= v_start
          AND cr.closed_at < v_end
      ), 0) AS cash_difference
    FROM public.cash_registers cr
    WHERE cr.organization_id = p_organization_id
      AND cr.branch_id IN (SELECT branch_id FROM allowed)
    GROUP BY cr.branch_id
  ),
  rows AS (
    SELECT
      a.branch_id,
      a.branch_name,
      a.is_headquarters,
      COALESCE(bs.sales_count, 0) AS sales_count,
      COALESCE(bs.revenue, 0) AS revenue,
      COALESCE(bs.discount, 0) AS discount,
      CASE
        WHEN COALESCE(bs.sales_count, 0) = 0 THEN 0
        ELSE bs.revenue / bs.sales_count
      END AS average_ticket,
      COALESCE(bs.cancelled_count, 0) AS cancelled_count,
      COALESCE(bs.cancelled_value, 0) AS cancelled_value,
      COALESCE(bc.cash_difference, 0) AS cash_difference,
      COALESCE(bst.low_stock_count, 0) AS low_stock_count
    FROM allowed a
    LEFT JOIN branch_sales bs ON bs.branch_id = a.branch_id
    LEFT JOIN branch_cash bc ON bc.branch_id = a.branch_id
    LEFT JOIN branch_stock bst ON bst.branch_id = a.branch_id
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(r) ||
        jsonb_build_object(
          'participation',
          CASE
            WHEN (SELECT COALESCE(sum(revenue), 0) FROM rows) = 0 THEN 0
            ELSE r.revenue / (SELECT sum(revenue) FROM rows)
          END
        )
        ORDER BY r.is_headquarters DESC, r.branch_name
      )
      FROM rows r
    ), '[]'::jsonb),
    'total', jsonb_build_object(
      'sales_count', (SELECT COALESCE(sum(sales_count), 0) FROM rows),
      'revenue', (SELECT COALESCE(sum(revenue), 0) FROM rows),
      'discount', (SELECT COALESCE(sum(discount), 0) FROM rows),
      'cancelled_count', (SELECT COALESCE(sum(cancelled_count), 0) FROM rows),
      'cancelled_value', (SELECT COALESCE(sum(cancelled_value), 0) FROM rows),
      'cash_difference', (SELECT COALESCE(sum(cash_difference), 0) FROM rows),
      'low_stock_count', (SELECT COALESCE(sum(low_stock_count), 0) FROM rows)
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_branch_report(uuid, uuid, timestamptz, timestamptz)
TO authenticated;

-- ============================================================
-- 7. RELATÓRIO FINANCEIRO
--
-- COMPETÊNCIA = created_at
-- CAIXA = paid_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_financial_report(
  p_organization_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := COALESCE(p_start, now() - interval '1 day');
  v_end timestamptz := COALESCE(p_end, now());
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.report_allowed_branches(p_organization_id, p_branch_id);

  IF v_end <= v_start THEN
    RAISE EXCEPTION 'invalid_period';
  END IF;

  SELECT jsonb_build_object(
    'basis', jsonb_build_object(
      'competence', 'created_at',
      'cash', 'paid_at'
    ),

    'competence', jsonb_build_object(
      'income', COALESCE((
        SELECT sum(ft.amount)
        FROM public.financial_transactions ft
        WHERE ft.organization_id = p_organization_id
          AND ft.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND ft.type = 'income'
          AND ft.created_at >= v_start
          AND ft.created_at < v_end
      ), 0),
      'expense', COALESCE((
        SELECT sum(ft.amount)
        FROM public.financial_transactions ft
        WHERE ft.organization_id = p_organization_id
          AND ft.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND ft.type = 'expense'
          AND ft.created_at >= v_start
          AND ft.created_at < v_end
      ), 0)
    ),

    'cash', jsonb_build_object(
      'income', COALESCE((
        SELECT sum(ft.amount)
        FROM public.financial_transactions ft
        WHERE ft.organization_id = p_organization_id
          AND ft.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND ft.type = 'income'
          AND ft.paid_at IS NOT NULL
          AND ft.paid_at >= v_start
          AND ft.paid_at < v_end
      ), 0),
      'expense', COALESCE((
        SELECT sum(ft.amount)
        FROM public.financial_transactions ft
        WHERE ft.organization_id = p_organization_id
          AND ft.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND ft.type = 'expense'
          AND ft.paid_at IS NOT NULL
          AND ft.paid_at >= v_start
          AND ft.paid_at < v_end
      ), 0)
    ),

    'open_payables', COALESCE((
      SELECT sum(ft.amount)
      FROM public.financial_transactions ft
      WHERE ft.organization_id = p_organization_id
        AND ft.branch_id IN (
          SELECT ab.branch_id
          FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
        )
        AND ft.type = 'expense'
        AND ft.paid_at IS NULL
    ), 0),

    'open_receivables', COALESCE((
      SELECT sum(ft.amount)
      FROM public.financial_transactions ft
      WHERE ft.organization_id = p_organization_id
        AND ft.branch_id IN (
          SELECT ab.branch_id
          FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
        )
        AND ft.type = 'income'
        AND ft.paid_at IS NULL
    ), 0),

    'overdue_payables', COALESCE((
      SELECT sum(ft.amount)
      FROM public.financial_transactions ft
      WHERE ft.organization_id = p_organization_id
        AND ft.branch_id IN (
          SELECT ab.branch_id
          FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
        )
        AND ft.type = 'expense'
        AND ft.paid_at IS NULL
        AND ft.due_date IS NOT NULL
        AND ft.due_date < (v_end AT TIME ZONE 'America/Sao_Paulo')::date
    ), 0),

    'overdue_receivables', COALESCE((
      SELECT sum(ft.amount)
      FROM public.financial_transactions ft
      WHERE ft.organization_id = p_organization_id
        AND ft.branch_id IN (
          SELECT ab.branch_id
          FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
        )
        AND ft.type = 'income'
        AND ft.paid_at IS NULL
        AND ft.due_date IS NOT NULL
        AND ft.due_date < (v_end AT TIME ZONE 'America/Sao_Paulo')::date
    ), 0),

    'categories', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'category', x.category,
          'income', x.income,
          'expense', x.expense
        )
        ORDER BY (x.income + x.expense) DESC
      )
      FROM (
        SELECT
          COALESCE(NULLIF(trim(ft.category), ''), 'Sem categoria') AS category,
          COALESCE(sum(ft.amount) FILTER (WHERE ft.type = 'income'), 0) AS income,
          COALESCE(sum(ft.amount) FILTER (WHERE ft.type = 'expense'), 0) AS expense
        FROM public.financial_transactions ft
        WHERE ft.organization_id = p_organization_id
          AND ft.branch_id IN (
            SELECT ab.branch_id
            FROM public.report_allowed_branches(p_organization_id, p_branch_id) ab
          )
          AND ft.created_at >= v_start
          AND ft.created_at < v_end
        GROUP BY 1
      ) x
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_report(uuid, uuid, timestamptz, timestamptz)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
