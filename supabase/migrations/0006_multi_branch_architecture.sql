-- 0006_multi_branch_architecture.sql
-- Matriz + filiais + estoque por filial + permissões por unidade + preparação de cobrança.

BEGIN;

-- ============================================================
-- 1. ORGANIZAÇÃO: regras comerciais do plano
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS base_monthly_price numeric(12,2) NOT NULL DEFAULT 59.90,
  ADD COLUMN IF NOT EXISTS additional_branch_price numeric(12,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS included_branches integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS billing_branch_count integer NOT NULL DEFAULT 1;

UPDATE public.organizations
SET
  base_monthly_price = COALESCE(base_monthly_price, 59.90),
  additional_branch_price = COALESCE(additional_branch_price, 50.00),
  included_branches = COALESCE(included_branches, 1),
  billing_branch_count = GREATEST(
    COALESCE(billing_branch_count, 1),
    1
  );

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_included_branches_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_included_branches_check
  CHECK (included_branches >= 1);

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_billing_branch_count_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_billing_branch_count_check
  CHECK (billing_branch_count >= 1);

-- ============================================================
-- 2. FILIAIS: matriz é apenas uma filial marcada como sede
-- ============================================================

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS is_headquarters boolean NOT NULL DEFAULT false;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS address_line text;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS state text;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS zip_code text;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS phone text;

CREATE UNIQUE INDEX IF NOT EXISTS branches_one_headquarters_per_org
  ON public.branches(organization_id)
  WHERE is_headquarters = true;

-- A primeira unidade existente de cada organização vira a matriz.
WITH first_branch AS (
  SELECT DISTINCT ON (organization_id)
    id,
    organization_id
  FROM public.branches
  WHERE active = true
  ORDER BY organization_id, created_at, id
)
UPDATE public.branches b
SET is_headquarters = true
FROM first_branch f
WHERE b.id = f.id
  AND NOT EXISTS (
    SELECT 1
    FROM public.branches existing
    WHERE existing.organization_id = b.organization_id
      AND existing.is_headquarters = true
      AND existing.id <> b.id
  );

-- ============================================================
-- 3. MEMBROS: usuário pode ser vinculado a uma filial
-- NULL = acesso a todas as filiais (owner/admin legado).
-- ============================================================

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS branch_id uuid
  REFERENCES public.branches(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organization_members_branch_idx
  ON public.organization_members(organization_id, branch_id);

-- ============================================================
-- 4. ESTOQUE POR FILIAL
-- ============================================================

CREATE TABLE IF NOT EXISTS public.branch_product_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL
    REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL
    REFERENCES public.products(id) ON DELETE CASCADE,
  stock_quantity numeric(14,3) NOT NULL DEFAULT 0
    CHECK (stock_quantity >= 0),
  minimum_stock numeric(14,3) NOT NULL DEFAULT 0
    CHECK (minimum_stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS branch_product_stock_org_idx
  ON public.branch_product_stock(organization_id);

CREATE INDEX IF NOT EXISTS branch_product_stock_branch_idx
  ON public.branch_product_stock(branch_id);

CREATE INDEX IF NOT EXISTS branch_product_stock_product_idx
  ON public.branch_product_stock(product_id);

ALTER TABLE public.branch_product_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members manage branch product stock"
  ON public.branch_product_stock;

CREATE POLICY "members manage branch product stock"
ON public.branch_product_stock
FOR ALL
TO authenticated
USING (public.is_organization_member(organization_id))
WITH CHECK (public.is_organization_member(organization_id));

-- Migra o estoque atual para a matriz.
INSERT INTO public.branch_product_stock (
  organization_id,
  branch_id,
  product_id,
  stock_quantity,
  minimum_stock
)
SELECT
  p.organization_id,
  b.id,
  p.id,
  p.stock_quantity,
  p.minimum_stock
FROM public.products p
JOIN LATERAL (
  SELECT id
  FROM public.branches
  WHERE organization_id = p.organization_id
    AND active = true
  ORDER BY is_headquarters DESC, created_at, id
  LIMIT 1
) b ON true
ON CONFLICT (branch_id, product_id)
DO NOTHING;

-- ============================================================
-- 5. FUNÇÃO DE ACESSO À FILIAL
-- ============================================================

CREATE OR REPLACE FUNCTION public.can_access_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.branches b
      ON b.id = p_branch_id
     AND b.organization_id = om.organization_id
     AND b.active = true
    WHERE om.user_id = auth.uid()
      AND (
        om.branch_id IS NULL
        OR om.branch_id = p_branch_id
        OR om.role IN ('owner', 'admin')
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid)
TO authenticated;

-- ============================================================
-- 6. LISTAGEM DAS FILIAIS DO USUÁRIO
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_branches()
RETURNS TABLE (
  branch_id uuid,
  organization_id uuid,
  branch_name text,
  branch_code text,
  is_headquarters boolean,
  active boolean,
  role public.member_role,
  can_manage boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.organization_id,
    b.name,
    b.code,
    b.is_headquarters,
    b.active,
    om.role,
    (om.role IN ('owner', 'admin')) AS can_manage
  FROM public.branches b
  JOIN public.organization_members om
    ON om.organization_id = b.organization_id
  WHERE om.user_id = auth.uid()
    AND b.active = true
    AND (
      om.branch_id IS NULL
      OR om.branch_id = b.id
      OR om.role IN ('owner', 'admin')
    )
  ORDER BY
    b.is_headquarters DESC,
    b.created_at,
    b.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_branches()
TO authenticated;

-- ============================================================
-- 7. CRIAÇÃO DE FILIAL
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_branch(
  p_name text,
  p_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_branch_id uuid;
  v_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT om.organization_id
    INTO v_org_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ORDER BY om.created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF trim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'branch_name_required';
  END IF;

  v_code := NULLIF(trim(coalesce(p_code, '')), '');

  IF v_code IS NULL THEN
    SELECT lpad(
      (COALESCE(max(NULLIF(regexp_replace(code, '[^0-9]', '', 'g'), '')::integer), 0) + 1)::text,
      3,
      '0'
    )
    INTO v_code
    FROM public.branches
    WHERE organization_id = v_org_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.branches
    WHERE organization_id = v_org_id
      AND lower(code) = lower(v_code)
  ) THEN
    RAISE EXCEPTION 'branch_code_already_exists';
  END IF;

  INSERT INTO public.branches (
    organization_id,
    name,
    code,
    is_headquarters,
    active
  )
  VALUES (
    v_org_id,
    trim(p_name),
    v_code,
    false,
    true
  )
  RETURNING id INTO v_branch_id;

  -- Todo produto passa a existir no estoque da nova filial com saldo zero.
  INSERT INTO public.branch_product_stock (
    organization_id,
    branch_id,
    product_id,
    stock_quantity,
    minimum_stock
  )
  SELECT
    v_org_id,
    v_branch_id,
    p.id,
    0,
    p.minimum_stock
  FROM public.products p
  WHERE p.organization_id = v_org_id
    AND p.active = true
  ON CONFLICT (branch_id, product_id)
  DO NOTHING;

  UPDATE public.organizations
  SET billing_branch_count = (
    SELECT count(*)
    FROM public.branches
    WHERE organization_id = v_org_id
      AND active = true
  )
  WHERE id = v_org_id;

  RETURN v_branch_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_branch(text, text)
TO authenticated;

-- ============================================================
-- 8. RESUMO CONSOLIDADO POR FILIAL
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_branch_dashboard_summary(
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  is_headquarters boolean,
  sales_today numeric,
  gross_profit_today numeric,
  open_cash_count bigint,
  stock_value numeric,
  low_stock_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.name,
    b.is_headquarters,

    COALESCE((
      SELECT sum(s.total)
      FROM public.sales s
      WHERE s.branch_id = b.id
        AND s.status = 'completed'
        AND s.created_at >= date_trunc('day', now())
    ), 0),

    COALESCE((
      SELECT sum(s.gross_profit)
      FROM public.sales s
      WHERE s.branch_id = b.id
        AND s.status = 'completed'
        AND s.created_at >= date_trunc('day', now())
    ), 0),

    (
      SELECT count(*)
      FROM public.cash_registers cr
      WHERE cr.branch_id = b.id
        AND cr.status = 'open'
    ),

    COALESCE((
      SELECT sum(ps.stock_quantity * p.cost_price)
      FROM public.branch_product_stock ps
      JOIN public.products p ON p.id = ps.product_id
      WHERE ps.branch_id = b.id
        AND p.active = true
    ), 0),

    (
      SELECT count(*)
      FROM public.branch_product_stock ps
      JOIN public.products p ON p.id = ps.product_id
      WHERE ps.branch_id = b.id
        AND p.active = true
        AND ps.stock_quantity <= ps.minimum_stock
    )

  FROM public.branches b
  WHERE b.active = true
    AND (
      p_branch_id IS NULL
      OR b.id = p_branch_id
    )
    AND public.can_access_branch(b.id)
  ORDER BY b.is_headquarters DESC, b.created_at, b.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_branch_dashboard_summary(uuid)
TO authenticated;

-- ============================================================
-- 9. ATUALIZA O "MEU ORGANIZATION" PARA MANTER COMPATIBILIDADE
--    e continuar retornando a matriz como unidade padrão.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_organization()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  branch_id uuid,
  branch_name text,
  role public.member_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    om.organization_id,
    o.name,
    b.id,
    b.name,
    om.role
  FROM public.organization_members om
  JOIN public.organizations o
    ON o.id = om.organization_id
  LEFT JOIN LATERAL (
    SELECT id, name
    FROM public.branches
    WHERE organization_id = om.organization_id
      AND active = true
    ORDER BY is_headquarters DESC, created_at, id
    LIMIT 1
  ) b ON true
  WHERE om.user_id = auth.uid()
  ORDER BY om.created_at
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization()
TO authenticated;

-- ============================================================
-- 10. COMPLETE SALE: estoque passa a ser da FILIAL
-- ============================================================

DROP FUNCTION IF EXISTS public.complete_sale(uuid, jsonb, jsonb, numeric);

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_branch_id uuid,
  p_discount numeric DEFAULT 0,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_register_id uuid;
  v_sale_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_product public.products%ROWTYPE;
  v_stock public.branch_product_stock%ROWTYPE;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := round(greatest(coalesce(p_discount, 0), 0), 2);
  v_total numeric(12,2) := 0;
  v_total_cost numeric(12,2) := 0;
  v_gross_profit numeric(12,2) := 0;
  v_qty numeric(14,3);
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2);
  v_item_total numeric(12,2);
  v_item_cost numeric(12,2);
  v_item_profit numeric(12,2);
  v_payment_total numeric(12,2) := 0;
BEGIN
  SELECT b.organization_id
    INTO v_org_id
  FROM public.branches b
  WHERE b.id = p_branch_id
    AND b.active = true;

  IF v_org_id IS NULL OR NOT public.can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;

  SELECT cr.id
    INTO v_register_id
  FROM public.cash_registers cr
  WHERE cr.branch_id = p_branch_id
    AND cr.status = 'open'
  ORDER BY cr.opened_at DESC
  LIMIT 1;

  IF v_register_id IS NULL THEN
    RAISE EXCEPTION 'cash_not_open';
  END IF;

  IF jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'empty_sale';
  END IF;

  -- Validação + custo + estoque da filial.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT p.*
      INTO v_product
    FROM public.products p
    WHERE p.id = (v_item->>'product_id')::uuid
      AND p.organization_id = v_org_id
      AND p.active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found';
    END IF;

    SELECT ps.*
      INTO v_stock
    FROM public.branch_product_stock ps
    WHERE ps.branch_id = p_branch_id
      AND ps.product_id = v_product.id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.branch_product_stock (
        organization_id,
        branch_id,
        product_id,
        stock_quantity,
        minimum_stock
      )
      VALUES (
        v_org_id,
        p_branch_id,
        v_product.id,
        0,
        v_product.minimum_stock
      )
      RETURNING * INTO v_stock;
    END IF;

    v_qty := (v_item->>'quantity')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    IF v_stock.stock_quantity < v_qty THEN
      RAISE EXCEPTION
        'insufficient_stock:%',
        v_product.name;
    END IF;

    v_unit_price := round(v_product.sale_price, 2);
    v_unit_cost := round(v_product.cost_price, 2);
    v_item_total := round(v_qty * v_unit_price, 2);
    v_item_cost := round(v_qty * v_unit_cost, 2);

    v_subtotal := round(v_subtotal + v_item_total, 2);
    v_total_cost := round(v_total_cost + v_item_cost, 2);
  END LOOP;

  v_total := round(greatest(v_subtotal - v_discount, 0), 2);
  v_gross_profit := round(v_total - v_total_cost, 2);

  FOR v_payment IN
    SELECT value FROM jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
  LOOP
    v_payment_total := round(
      v_payment_total + coalesce((v_payment->>'amount')::numeric, 0),
      2
    );
  END LOOP;

  IF abs(v_payment_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'payment_total_mismatch';
  END IF;

  INSERT INTO public.sales (
    organization_id,
    branch_id,
    customer_id,
    cash_register_id,
    subtotal,
    discount,
    total,
    total_cost,
    gross_profit,
    status,
    created_by
  )
  VALUES (
    v_org_id,
    p_branch_id,
    NULLIF(p_items->0->>'customer_id', '')::uuid,
    v_register_id,
    v_subtotal,
    v_discount,
    v_total,
    v_total_cost,
    v_gross_profit,
    'completed',
    auth.uid()
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT p.*
      INTO v_product
    FROM public.products p
    WHERE p.id = (v_item->>'product_id')::uuid
      AND p.organization_id = v_org_id
      AND p.active = true
    FOR UPDATE;

    SELECT ps.*
      INTO v_stock
    FROM public.branch_product_stock ps
    WHERE ps.branch_id = p_branch_id
      AND ps.product_id = v_product.id
    FOR UPDATE;

    v_qty := (v_item->>'quantity')::numeric;
    v_unit_price := round(v_product.sale_price, 2);
    v_unit_cost := round(v_product.cost_price, 2);
    v_item_total := round(v_qty * v_unit_price, 2);
    v_item_cost := round(v_qty * v_unit_cost, 2);
    v_item_profit := round(v_item_total - v_item_cost, 2);

    INSERT INTO public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      unit_cost,
      total_cost,
      profit,
      discount,
      total
    )
    VALUES (
      v_sale_id,
      v_product.id,
      v_qty,
      v_unit_price,
      v_unit_cost,
      v_item_cost,
      v_item_profit,
      0,
      v_item_total
    );

    UPDATE public.branch_product_stock
    SET
      stock_quantity = stock_quantity - v_qty,
      updated_at = now()
    WHERE branch_id = p_branch_id
      AND product_id = v_product.id;

    INSERT INTO public.inventory_movements (
      organization_id,
      branch_id,
      product_id,
      type,
      quantity,
      previous_quantity,
      new_quantity,
      reference_id,
      notes,
      created_by
    )
    VALUES (
      v_org_id,
      p_branch_id,
      v_product.id,
      'sale',
      v_qty,
      v_stock.stock_quantity,
      v_stock.stock_quantity - v_qty,
      v_sale_id,
      'Venda ' || v_sale_id::text,
      auth.uid()
    );
  END LOOP;

  FOR v_payment IN
    SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.sale_payments (sale_id, method, amount)
    VALUES (
      v_sale_id,
      v_payment->>'method',
      round((v_payment->>'amount')::numeric, 2)
    );
  END LOOP;

  INSERT INTO public.cash_movements (
    organization_id,
    branch_id,
    cash_register_id,
    type,
    amount,
    description,
    reference_id,
    created_by
  )
  VALUES (
    v_org_id,
    p_branch_id,
    v_register_id,
    'sale',
    v_total,
    'Venda ' || v_sale_id::text,
    v_sale_id,
    auth.uid()
  );

  -- Mantém products.stock_quantity como estoque agregado da organização.
  UPDATE public.products p
  SET
    stock_quantity = COALESCE((
      SELECT sum(ps.stock_quantity)
      FROM public.branch_product_stock ps
      WHERE ps.product_id = p.id
    ), 0),
    updated_at = now()
  WHERE p.id IN (
    SELECT (value->>'product_id')::uuid
    FROM jsonb_array_elements(p_items)
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_sale(uuid, numeric, jsonb, jsonb)
TO authenticated;

-- ============================================================
-- 11. Atualiza o contador de filiais da organização
-- ============================================================

UPDATE public.organizations o
SET billing_branch_count = (
  SELECT count(*)
  FROM public.branches b
  WHERE b.organization_id = o.id
    AND b.active = true
);

NOTIFY pgrst, 'reload schema';

COMMIT;
