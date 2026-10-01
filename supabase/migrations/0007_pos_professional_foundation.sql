-- 0007_pos_professional_foundation.sql
-- Fundação do PDV profissional:
-- compatibilidade do schema, descontos por item, cliente explícito,
-- vendedor via user_id, estoque por filial e RPC atômica definitiva.

BEGIN;

-- ============================================================
-- 1. COMPATIBILIDADE DO HISTÓRICO DE ESTOQUE
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS previous_quantity numeric(14,3),
  ADD COLUMN IF NOT EXISTS new_quantity numeric(14,3),
  ADD COLUMN IF NOT EXISTS reference_id uuid;

-- Mantemos user_id/note já existentes como autor/observação.
CREATE INDEX IF NOT EXISTS inventory_movements_branch_date_idx
  ON public.inventory_movements(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_movements_reference_idx
  ON public.inventory_movements(reference_id);

-- ============================================================
-- 2. COMPATIBILIDADE DO CAIXA
-- ============================================================

ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS branch_id uuid
    REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reference_id uuid;

UPDATE public.cash_movements cm
SET branch_id = cr.branch_id
FROM public.cash_registers cr
WHERE cm.cash_register_id = cr.id
  AND cm.branch_id IS NULL;

CREATE INDEX IF NOT EXISTS cash_movements_branch_date_idx
  ON public.cash_movements(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cash_movements_reference_idx
  ON public.cash_movements(reference_id);

-- ============================================================
-- 3. ÍNDICES PARA O PDV
-- ============================================================

CREATE INDEX IF NOT EXISTS products_org_active_name_idx
  ON public.products(organization_id, active, name);

CREATE INDEX IF NOT EXISTS products_org_barcode_idx
  ON public.products(organization_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_org_sku_idx
  ON public.products(organization_id, sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_org_name_idx
  ON public.customers(organization_id, name);

CREATE INDEX IF NOT EXISTS customers_org_document_idx
  ON public.customers(organization_id, document)
  WHERE document IS NOT NULL;

CREATE INDEX IF NOT EXISTS branch_product_stock_branch_product_idx
  ON public.branch_product_stock(branch_id, product_id);

-- ============================================================
-- 4. RLS DO ESTOQUE POR FILIAL
--    A RPC continua SECURITY DEFINER; acesso direto respeita filial.
-- ============================================================

DROP POLICY IF EXISTS "members manage branch product stock"
  ON public.branch_product_stock;

CREATE POLICY "members access branch product stock"
ON public.branch_product_stock
FOR ALL
TO authenticated
USING (public.can_access_branch(branch_id))
WITH CHECK (public.can_access_branch(branch_id));

-- ============================================================
-- 5. RPC DE BUSCA DO PDV
--    Retorna somente os produtos necessários para o terminal.
-- ============================================================

DROP FUNCTION IF EXISTS public.search_pos_products(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.search_pos_products(
  p_branch_id uuid,
  p_query text DEFAULT '',
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  name text,
  barcode text,
  sku text,
  unit text,
  sale_price numeric,
  cost_price numeric,
  stock_quantity numeric,
  minimum_stock numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.barcode,
    p.sku,
    p.unit,
    p.sale_price,
    p.cost_price,
    COALESCE(ps.stock_quantity, 0),
    COALESCE(ps.minimum_stock, p.minimum_stock)
  FROM public.products p
  LEFT JOIN public.branch_product_stock ps
    ON ps.product_id = p.id
   AND ps.branch_id = p_branch_id
  WHERE p.organization_id = (
    SELECT b.organization_id
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.active = true
  )
    AND p.active = true
    AND public.can_access_branch(p_branch_id)
    AND (
      NULLIF(trim(coalesce(p_query, '')), '') IS NULL
      OR p.barcode = trim(p_query)
      OR p.sku = trim(p_query)
      OR p.name ILIKE '%' || trim(p_query) || '%'
    )
  ORDER BY
    CASE
      WHEN p.barcode = trim(coalesce(p_query, '')) THEN 0
      WHEN p.sku = trim(coalesce(p_query, '')) THEN 1
      WHEN lower(p.name) = lower(trim(coalesce(p_query, ''))) THEN 2
      ELSE 3
    END,
    p.name
  LIMIT greatest(1, least(coalesce(p_limit, 12), 50));
$$;

GRANT EXECUTE ON FUNCTION public.search_pos_products(uuid, text, integer)
TO authenticated;

-- ============================================================
-- 6. RPC DE BUSCA DE CLIENTES PARA O PDV
-- ============================================================

DROP FUNCTION IF EXISTS public.search_pos_customers(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.search_pos_customers(
  p_organization_id uuid,
  p_query text DEFAULT '',
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  document text,
  phone text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.document, c.phone, c.email
  FROM public.customers c
  WHERE c.organization_id = p_organization_id
    AND public.is_organization_member(p_organization_id)
    AND (
      NULLIF(trim(coalesce(p_query, '')), '') IS NULL
      OR c.name ILIKE '%' || trim(p_query) || '%'
      OR regexp_replace(coalesce(c.document, ''), '[^0-9]', '', 'g')
         LIKE '%' || regexp_replace(trim(p_query), '[^0-9]', '', 'g') || '%'
    )
  ORDER BY c.name
  LIMIT greatest(1, least(coalesce(p_limit, 10), 30));
$$;

GRANT EXECUTE ON FUNCTION public.search_pos_customers(uuid, text, integer)
TO authenticated;

-- ============================================================
-- 7. COMPLETE SALE DEFINITIVA
--
-- p_customer_id: cliente explícito
-- p_items:
--   product_id
--   quantity
--   discount_type: none | amount | percent
--   discount_value
-- p_payments:
--   method
--   amount
--
-- Toda a operação ocorre na mesma transação PostgreSQL.
-- ============================================================

DROP FUNCTION IF EXISTS public.complete_sale(uuid, jsonb, jsonb, numeric);

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_branch_id uuid,
  p_discount numeric DEFAULT 0,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_customer_id uuid DEFAULT NULL
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

  v_subtotal numeric(14,2) := 0;
  v_item_discounts numeric(14,2) := 0;
  v_global_discount numeric(14,2) := round(greatest(coalesce(p_discount, 0), 0), 2);
  v_total numeric(14,2) := 0;
  v_total_cost numeric(14,2) := 0;
  v_gross_profit numeric(14,2) := 0;
  v_payment_total numeric(14,2) := 0;

  v_qty numeric(14,3);
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2);
  v_item_subtotal numeric(14,2);
  v_item_discount numeric(14,2);
  v_item_total numeric(14,2);
  v_item_cost numeric(14,2);
  v_item_profit numeric(14,2);

  v_discount_type text;
  v_discount_value numeric(14,2);
  v_customer_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT b.organization_id
    INTO v_org_id
  FROM public.branches b
  WHERE b.id = p_branch_id
    AND b.active = true;

  IF v_org_id IS NULL OR NOT public.can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;

  -- Cliente é opcional, mas nunca pode pertencer a outra empresa.
  IF p_customer_id IS NOT NULL THEN
    SELECT c.organization_id
      INTO v_customer_org
    FROM public.customers c
    WHERE c.id = p_customer_id;

    IF v_customer_org IS NULL OR v_customer_org <> v_org_id THEN
      RAISE EXCEPTION 'invalid_customer';
    END IF;
  END IF;

  SELECT cr.id
    INTO v_register_id
  FROM public.cash_registers cr
  WHERE cr.branch_id = p_branch_id
    AND cr.status = 'open'
  ORDER BY cr.opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_register_id IS NULL THEN
    RAISE EXCEPTION 'cash_not_open';
  END IF;

  IF jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'empty_sale';
  END IF;

  -- ==========================================================
  -- PRIMEIRA PASSAGEM:
  -- trava estoque da filial e calcula todos os valores.
  -- ==========================================================

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    SELECT p.*
      INTO v_product
    FROM public.products p
    WHERE p.id = (v_item->>'product_id')::uuid
      AND p.organization_id = v_org_id
      AND p.active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found:%', coalesce(v_item->>'product_id', '');
    END IF;

    SELECT ps.*
      INTO v_stock
    FROM public.branch_product_stock ps
    WHERE ps.branch_id = p_branch_id
      AND ps.product_id = v_product.id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_available_in_branch:%', v_product.name;
    END IF;

    v_qty := (v_item->>'quantity')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity:%', v_product.name;
    END IF;

    IF v_stock.stock_quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_product.name;
    END IF;

    v_unit_price := round(v_product.sale_price, 2);
    v_unit_cost := round(v_product.cost_price, 2);
    v_item_subtotal := round(v_qty * v_unit_price, 2);

    v_discount_type := lower(coalesce(v_item->>'discount_type', 'none'));
    v_discount_value := round(
      greatest(coalesce((v_item->>'discount_value')::numeric, 0), 0),
      2
    );

    IF v_discount_type = 'percent' THEN
      IF v_discount_value > 100 THEN
        RAISE EXCEPTION 'invalid_item_discount:%', v_product.name;
      END IF;

      v_item_discount := round(
        v_item_subtotal * v_discount_value / 100,
        2
      );
    ELSIF v_discount_type = 'amount' THEN
      IF v_discount_value > v_item_subtotal THEN
        RAISE EXCEPTION 'invalid_item_discount:%', v_product.name;
      END IF;

      v_item_discount := v_discount_value;
    ELSIF v_discount_type = 'none' THEN
      v_item_discount := 0;
    ELSE
      RAISE EXCEPTION 'invalid_item_discount_type:%', v_product.name;
    END IF;

    v_item_total := round(v_item_subtotal - v_item_discount, 2);
    v_item_cost := round(v_qty * v_unit_cost, 2);

    v_subtotal := round(v_subtotal + v_item_subtotal, 2);
    v_item_discounts := round(v_item_discounts + v_item_discount, 2);
    v_total_cost := round(v_total_cost + v_item_cost, 2);
  END LOOP;

  IF v_global_discount > round(v_subtotal - v_item_discounts, 2) THEN
    RAISE EXCEPTION 'invalid_sale_discount';
  END IF;

  v_total := round(
    greatest(v_subtotal - v_item_discounts - v_global_discount, 0),
    2
  );

  v_gross_profit := round(v_total - v_total_cost, 2);

  -- Pagamentos precisam existir e somar exatamente o total.
  IF jsonb_array_length(coalesce(p_payments, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'payment_required';
  END IF;

  FOR v_payment IN
    SELECT value
    FROM jsonb_array_elements(p_payments)
  LOOP
    IF lower(coalesce(v_payment->>'method', '')) NOT IN
      ('cash', 'pix', 'credit_card', 'debit_card', 'other') THEN
      RAISE EXCEPTION 'invalid_payment_method';
    END IF;

    IF coalesce((v_payment->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'invalid_payment_amount';
    END IF;

    v_payment_total := round(
      v_payment_total + (v_payment->>'amount')::numeric,
      2
    );
  END LOOP;

  IF abs(v_payment_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'payment_total_mismatch';
  END IF;

  -- ==========================================================
  -- VENDA
  -- ==========================================================

  INSERT INTO public.sales (
    organization_id,
    branch_id,
    customer_id,
    cash_register_id,
    user_id,
    subtotal,
    discount,
    total,
    total_cost,
    gross_profit,
    status
  )
  VALUES (
    v_org_id,
    p_branch_id,
    p_customer_id,
    v_register_id,
    auth.uid(),
    v_subtotal,
    round(v_item_discounts + v_global_discount, 2),
    v_total,
    v_total_cost,
    v_gross_profit,
    'completed'
  )
  RETURNING id INTO v_sale_id;

  -- ==========================================================
  -- ITENS + BAIXA DE ESTOQUE
  -- ==========================================================

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
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
    v_item_subtotal := round(v_qty * v_unit_price, 2);

    v_discount_type := lower(coalesce(v_item->>'discount_type', 'none'));
    v_discount_value := round(
      greatest(coalesce((v_item->>'discount_value')::numeric, 0), 0),
      2
    );

    IF v_discount_type = 'percent' THEN
      v_item_discount := round(
        v_item_subtotal * v_discount_value / 100,
        2
      );
    ELSIF v_discount_type = 'amount' THEN
      v_item_discount := v_discount_value;
    ELSE
      v_item_discount := 0;
    END IF;

    v_item_total := round(v_item_subtotal - v_item_discount, 2);
    v_item_cost := round(v_qty * v_unit_cost, 2);
    v_item_profit := round(v_item_total - v_item_cost, 2);

    INSERT INTO public.sale_items (
      sale_id,
      product_id,
      product_name,
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
      v_product.name,
      v_qty,
      v_unit_price,
      v_unit_cost,
      v_item_cost,
      v_item_profit,
      v_item_discount,
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
      user_id,
      type,
      quantity,
      unit_cost,
      previous_quantity,
      new_quantity,
      reference_id,
      note
    )
    VALUES (
      v_org_id,
      p_branch_id,
      v_product.id,
      auth.uid(),
      'sale',
      -v_qty,
      v_unit_cost,
      v_stock.stock_quantity,
      v_stock.stock_quantity - v_qty,
      v_sale_id,
      'Venda ' || v_sale_id::text
    );
  END LOOP;

  -- Mantém o estoque legado agregado por organização.
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

  -- ==========================================================
  -- PAGAMENTOS
  -- ==========================================================

  FOR v_payment IN
    SELECT value
    FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.sale_payments (
      sale_id,
      method,
      amount
    )
    VALUES (
      v_sale_id,
      v_payment->>'method',
      round((v_payment->>'amount')::numeric, 2)
    );
  END LOOP;

  -- ==========================================================
  -- CAIXA
  -- ==========================================================

  INSERT INTO public.cash_movements (
    organization_id,
    branch_id,
    cash_register_id,
    user_id,
    type,
    amount,
    description,
    reference_id
  )
  VALUES (
    v_org_id,
    p_branch_id,
    v_register_id,
    auth.uid(),
    'sale',
    v_total,
    'Venda ' || v_sale_id::text,
    v_sale_id
  );

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_sale(uuid, numeric, jsonb, jsonb, uuid)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
