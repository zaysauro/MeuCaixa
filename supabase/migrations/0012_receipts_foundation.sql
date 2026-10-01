-- 0012_receipts_foundation.sql
-- Fundação dos comprovantes não fiscais:
-- numeração humana por empresa, snapshots históricos, pagamentos com troco,
-- configuração do comprovante e log de reimpressões.

BEGIN;

-- ============================================================
-- 1. NUMERAÇÃO HUMANA DA VENDA
--    Cada organização começa em #000001.
-- ============================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_number bigint;

CREATE TABLE IF NOT EXISTS public.organization_sale_counters (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  next_sale_number bigint NOT NULL DEFAULT 1
    CHECK (next_sale_number >= 1)
);

-- Garante um contador para cada organização existente.
INSERT INTO public.organization_sale_counters (organization_id, next_sale_number)
SELECT o.id, 1
FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;

-- Backfill determinístico das vendas antigas, por empresa.
WITH numbered AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id
      ORDER BY created_at, id
    )::bigint AS generated_number
  FROM public.sales
  WHERE sale_number IS NULL
)
UPDATE public.sales s
SET sale_number = n.generated_number
FROM numbered n
WHERE s.id = n.id;

-- O próximo número precisa ficar acima de todo número já usado.
UPDATE public.organization_sale_counters c
SET next_sale_number = GREATEST(
  1,
  COALESCE((
    SELECT max(s.sale_number) + 1
    FROM public.sales s
    WHERE s.organization_id = c.organization_id
  ), 1)
);

ALTER TABLE public.sales
  ALTER COLUMN sale_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sales_organization_sale_number_uidx
  ON public.sales(organization_id, sale_number);

CREATE INDEX IF NOT EXISTS sales_org_sale_number_idx
  ON public.sales(organization_id, sale_number DESC);

-- ============================================================
-- 2. SNAPSHOTS HISTÓRICOS
--    O comprovante não depende de alterações futuras no cadastro.
-- ============================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS organization_name_snapshot text,
  ADD COLUMN IF NOT EXISTS branch_name_snapshot text,
  ADD COLUMN IF NOT EXISTS branch_code_snapshot text,
  ADD COLUMN IF NOT EXISTS branch_address_snapshot text,
  ADD COLUMN IF NOT EXISTS branch_city_snapshot text,
  ADD COLUMN IF NOT EXISTS branch_state_snapshot text,
  ADD COLUMN IF NOT EXISTS branch_zip_snapshot text,
  ADD COLUMN IF NOT EXISTS branch_phone_snapshot text,
  ADD COLUMN IF NOT EXISTS seller_name_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_document_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_phone_snapshot text;

-- Preenche vendas antigas sem inventar dados.
UPDATE public.sales s
SET
  organization_name_snapshot = COALESCE(s.organization_name_snapshot, o.name),
  branch_name_snapshot = COALESCE(s.branch_name_snapshot, b.name),
  branch_code_snapshot = COALESCE(s.branch_code_snapshot, b.code),
  branch_address_snapshot = COALESCE(s.branch_address_snapshot, b.address_line),
  branch_city_snapshot = COALESCE(s.branch_city_snapshot, b.city),
  branch_state_snapshot = COALESCE(s.branch_state_snapshot, b.state),
  branch_zip_snapshot = COALESCE(s.branch_zip_snapshot, b.zip_code),
  branch_phone_snapshot = COALESCE(s.branch_phone_snapshot, b.phone),
  seller_name_snapshot = COALESCE(
    s.seller_name_snapshot,
    NULLIF(trim(p.full_name), '')
  ),
  customer_name_snapshot = COALESCE(s.customer_name_snapshot, c.name),
  customer_document_snapshot = COALESCE(s.customer_document_snapshot, c.document),
  customer_phone_snapshot = COALESCE(s.customer_phone_snapshot, c.phone)
FROM public.organizations o
LEFT JOIN public.branches b ON b.id = s.branch_id
LEFT JOIN public.profiles p ON p.id = s.user_id
LEFT JOIN public.customers c ON c.id = s.customer_id
WHERE o.id = s.organization_id;

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

-- ============================================================
-- 3. CONFIGURAÇÃO DO COMPROVANTE
--    Uma configuração por organização + filial.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.receipt_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL
    REFERENCES public.branches(id) ON DELETE CASCADE,
  width text NOT NULL DEFAULT '80mm'
    CHECK (width IN ('80mm', '58mm')),
  footer_text text NOT NULL DEFAULT 'Obrigado pela preferência!',
  show_cnpj boolean NOT NULL DEFAULT true,
  show_address boolean NOT NULL DEFAULT true,
  show_seller boolean NOT NULL DEFAULT true,
  show_customer boolean NOT NULL DEFAULT true,
  auto_print boolean NOT NULL DEFAULT false,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id)
);

ALTER TABLE public.receipt_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view receipt settings"
  ON public.receipt_settings;
DROP POLICY IF EXISTS "admins manage receipt settings"
  ON public.receipt_settings;

CREATE POLICY "members view receipt settings"
ON public.receipt_settings
FOR SELECT
TO authenticated
USING (public.can_access_branch(branch_id));

CREATE POLICY "admins manage receipt settings"
ON public.receipt_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = receipt_settings.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND (
        om.branch_id IS NULL
        OR om.branch_id = receipt_settings.branch_id
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = receipt_settings.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
      AND (
        om.branch_id IS NULL
        OR om.branch_id = receipt_settings.branch_id
      )
  )
);

INSERT INTO public.receipt_settings (organization_id, branch_id)
SELECT b.organization_id, b.id
FROM public.branches b
WHERE b.active = true
ON CONFLICT (branch_id) DO NOTHING;

-- ============================================================
-- 4. LOG DE COMPROVANTES / 2ª VIA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.receipt_print_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL
    REFERENCES public.branches(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL
    REFERENCES public.sales(id) ON DELETE CASCADE,
  user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'original'
    CHECK (type IN ('original', 'reprint', 'preview', 'pdf', 'share')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipt_print_logs_sale_idx
  ON public.receipt_print_logs(sale_id, created_at DESC);

CREATE INDEX IF NOT EXISTS receipt_print_logs_org_date_idx
  ON public.receipt_print_logs(organization_id, created_at DESC);

ALTER TABLE public.receipt_print_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view receipt logs"
  ON public.receipt_print_logs;

CREATE POLICY "members view receipt logs"
ON public.receipt_print_logs
FOR SELECT
TO authenticated
USING (public.can_access_branch(branch_id));

-- Inserts passam por RPC para evitar falsificação de organization/branch/user.
DROP POLICY IF EXISTS "members insert receipt logs"
  ON public.receipt_print_logs;

-- ============================================================
-- 5. GERADOR ATÔMICO DO NÚMERO DA VENDA
-- ============================================================

CREATE OR REPLACE FUNCTION public.next_sale_number(
  p_organization_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RAISE EXCEPTION 'invalid_organization';
  END IF;

  INSERT INTO public.organization_sale_counters (
    organization_id,
    next_sale_number
  )
  VALUES (p_organization_id, 2)
  ON CONFLICT (organization_id)
  DO UPDATE SET next_sale_number =
    public.organization_sale_counters.next_sale_number + 1
  RETURNING next_sale_number INTO v_next;

  RETURN v_next - 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_sale_number(uuid)
TO authenticated;

-- ============================================================
-- 6. COMPLETE SALE DEFINITIVA PARA COMPROVANTE
--    Inclui snapshot, recebimento/troco e caixa físico correto.
-- ============================================================

DROP FUNCTION IF EXISTS public.complete_sale(uuid, numeric, jsonb, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_branch_id uuid,
  p_discount numeric DEFAULT 0,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_seller_user_id uuid DEFAULT NULL
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
  v_sale_number bigint;
  v_item jsonb;
  v_payment jsonb;
  v_product public.products%ROWTYPE;
  v_stock public.branch_product_stock%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_seller_name text;
  v_subtotal numeric(14,2) := 0;
  v_item_discounts numeric(14,2) := 0;
  v_global_discount numeric(14,2) := round(greatest(coalesce(p_discount,0),0),2);
  v_total numeric(14,2) := 0;
  v_total_cost numeric(14,2) := 0;
  v_gross_profit numeric(14,2) := 0;
  v_payment_total numeric(14,2) := 0;
  v_cash_amount numeric(14,2) := 0;
  v_cash_received numeric(14,2) := 0;
  v_cash_change numeric(14,2) := 0;
  v_cash_movement numeric(14,2) := 0;
  v_cash_payment_count integer := 0;
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

  SELECT b.*
    INTO v_branch
  FROM public.branches b
  WHERE b.id = p_branch_id
    AND b.active = true;

  IF v_branch.id IS NULL OR NOT public.can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;

  v_org_id := v_branch.organization_id;

  SELECT o.*
    INTO v_org
  FROM public.organizations o
  WHERE o.id = v_org_id;

  IF p_customer_id IS NOT NULL THEN
    SELECT c.*
      INTO v_customer
    FROM public.customers c
    WHERE c.id = p_customer_id;

    IF v_customer.id IS NULL OR v_customer.organization_id <> v_org_id THEN
      RAISE EXCEPTION 'invalid_customer';
    END IF;
  END IF;

  SELECT COALESCE(
    NULLIF(trim(p.full_name), ''),
    'Usuário'
  )
  INTO v_seller_name
  FROM public.profiles p
  WHERE p.id = coalesce(p_seller_user_id, auth.uid());

  IF v_seller_name IS NULL THEN
    v_seller_name := 'Usuário';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = v_org_id
      AND om.user_id = coalesce(p_seller_user_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'invalid_seller';
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

  IF jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'empty_sale';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) item
    GROUP BY item->>'product_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_product_line';
  END IF;

  -- Calcula itens usando os preços/custos atuais e bloqueia estoque.
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
      RAISE EXCEPTION 'product_not_found:%', coalesce(v_item->>'product_id','');
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

    v_unit_price := round(v_product.sale_price,2);
    v_unit_cost := round(v_product.cost_price,2);
    v_item_subtotal := round(v_qty * v_unit_price,2);

    v_discount_type := lower(coalesce(v_item->>'discount_type','none'));
    v_discount_value := round(
      greatest(coalesce((v_item->>'discount_value')::numeric,0),0),
      2
    );

    IF v_discount_type = 'percent' THEN
      IF v_discount_value > 100 THEN
        RAISE EXCEPTION 'invalid_item_discount:%', v_product.name;
      END IF;
      v_item_discount := round(v_item_subtotal * v_discount_value / 100,2);
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

    v_item_total := round(v_item_subtotal - v_item_discount,2);
    v_item_cost := round(v_qty * v_unit_cost,2);
    v_subtotal := round(v_subtotal + v_item_subtotal,2);
    v_item_discounts := round(v_item_discounts + v_item_discount,2);
    v_total_cost := round(v_total_cost + v_item_cost,2);
  END LOOP;

  IF v_global_discount > round(v_subtotal - v_item_discounts,2) THEN
    RAISE EXCEPTION 'invalid_sale_discount';
  END IF;

  v_total := round(
    greatest(v_subtotal - v_item_discounts - v_global_discount,0),
    2
  );
  v_gross_profit := round(v_total - v_total_cost,2);

  IF jsonb_array_length(coalesce(p_payments,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'payment_required';
  END IF;

  -- Neste estágio permitimos no máximo um pagamento em dinheiro.
  -- Isso mantém o cálculo de troco e a reconciliação física do caixa inequívocos.
  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    IF lower(coalesce(v_payment->>'method','')) NOT IN
      ('cash','pix','credit_card','debit_card','other') THEN
      RAISE EXCEPTION 'invalid_payment_method';
    END IF;

    IF coalesce((v_payment->>'amount')::numeric,0) <= 0 THEN
      RAISE EXCEPTION 'invalid_payment_amount';
    END IF;

    IF lower(coalesce(v_payment->>'method','')) = 'cash' THEN
      v_cash_payment_count := v_cash_payment_count + 1;
      v_cash_amount := round(
        v_cash_amount + (v_payment->>'amount')::numeric,
        2
      );
      v_cash_received := round(
        v_cash_received + coalesce((v_payment->>'received_amount')::numeric, (v_payment->>'amount')::numeric),
        2
      );
    END IF;

    v_payment_total := round(
      v_payment_total + (v_payment->>'amount')::numeric,
      2
    );
  END LOOP;

  IF v_cash_payment_count > 1 THEN
    RAISE EXCEPTION 'multiple_cash_payments_not_supported';
  END IF;

  IF abs(v_payment_total - v_total) > 0.01 THEN
    RAISE EXCEPTION 'payment_total_mismatch';
  END IF;

  IF v_cash_payment_count = 1 THEN
    IF v_cash_received < v_cash_amount THEN
      RAISE EXCEPTION 'cash_received_insufficient';
    END IF;

    v_cash_change := round(v_cash_received - v_cash_amount,2);
  END IF;

  -- Só o dinheiro efetivamente retido no caixa entra no movimento físico.
  v_cash_movement := round(v_cash_amount - v_cash_change,2);

  v_sale_number := public.next_sale_number(v_org_id);

  INSERT INTO public.sales (
    organization_id,
    branch_id,
    customer_id,
    cash_register_id,
    user_id,
    sale_number,
    subtotal,
    discount,
    total,
    total_cost,
    gross_profit,
    status,
    organization_name_snapshot,
    branch_name_snapshot,
    branch_code_snapshot,
    branch_address_snapshot,
    branch_city_snapshot,
    branch_state_snapshot,
    branch_zip_snapshot,
    branch_phone_snapshot,
    seller_name_snapshot,
    customer_name_snapshot,
    customer_document_snapshot,
    customer_phone_snapshot
  )
  VALUES (
    v_org_id,
    p_branch_id,
    p_customer_id,
    v_register_id,
    coalesce(p_seller_user_id, auth.uid()),
    v_sale_number,
    v_subtotal,
    round(v_item_discounts + v_global_discount,2),
    v_total,
    v_total_cost,
    v_gross_profit,
    'completed',
    v_org.name,
    v_branch.name,
    v_branch.code,
    v_branch.address_line,
    v_branch.city,
    v_branch.state,
    v_branch.zip_code,
    v_branch.phone,
    v_seller_name,
    CASE WHEN v_customer.id IS NULL THEN NULL ELSE v_customer.name END,
    CASE WHEN v_customer.id IS NULL THEN NULL ELSE v_customer.document END,
    CASE WHEN v_customer.id IS NULL THEN NULL ELSE v_customer.phone END
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
    v_unit_price := round(v_product.sale_price,2);
    v_unit_cost := round(v_product.cost_price,2);
    v_item_subtotal := round(v_qty * v_unit_price,2);
    v_discount_type := lower(coalesce(v_item->>'discount_type','none'));
    v_discount_value := round(
      greatest(coalesce((v_item->>'discount_value')::numeric,0),0),
      2
    );

    IF v_discount_type = 'percent' THEN
      v_item_discount := round(v_item_subtotal * v_discount_value / 100,2);
    ELSIF v_discount_type = 'amount' THEN
      v_item_discount := v_discount_value;
    ELSE
      v_item_discount := 0;
    END IF;

    v_item_total := round(v_item_subtotal - v_item_discount,2);
    v_item_cost := round(v_qty * v_unit_cost,2);
    v_item_profit := round(v_item_total - v_item_cost,2);

    INSERT INTO public.sale_items (
      sale_id, product_id, product_name, quantity, unit_price, unit_cost,
      total_cost, profit, discount, total
    )
    VALUES (
      v_sale_id, v_product.id, v_product.name, v_qty, v_unit_price, v_unit_cost,
      v_item_cost, v_item_profit, v_item_discount, v_item_total
    );

    UPDATE public.branch_product_stock
    SET stock_quantity = stock_quantity - v_qty,
        updated_at = now()
    WHERE branch_id = p_branch_id
      AND product_id = v_product.id;

    INSERT INTO public.inventory_movements (
      organization_id, branch_id, product_id, user_id, type, quantity, unit_cost,
      previous_quantity, new_quantity, reference_id, note
    )
    VALUES (
      v_org_id, p_branch_id, v_product.id, auth.uid(), 'sale', -v_qty, v_unit_cost,
      v_stock.stock_quantity, v_stock.stock_quantity - v_qty, v_sale_id,
      'Venda ' || v_sale_number::text
    );
  END LOOP;

  UPDATE public.products p
  SET stock_quantity = COALESCE((
    SELECT sum(ps.stock_quantity)
    FROM public.branch_product_stock ps
    WHERE ps.product_id = p.id
  ),0), updated_at = now()
  WHERE p.id IN (
    SELECT (value->>'product_id')::uuid
    FROM jsonb_array_elements(p_items)
  );

  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.sale_payments (
      sale_id,
      method,
      amount,
      received_amount,
      change_amount
    )
    VALUES (
      v_sale_id,
      v_payment->>'method',
      round((v_payment->>'amount')::numeric,2),
      CASE
        WHEN lower(coalesce(v_payment->>'method','')) = 'cash'
          THEN round(v_cash_received,2)
        ELSE NULL
      END,
      CASE
        WHEN lower(coalesce(v_payment->>'method','')) = 'cash'
          THEN v_cash_change
        ELSE 0
      END
    );
  END LOOP;

  IF v_cash_movement > 0 THEN
    INSERT INTO public.cash_movements (
      organization_id,
      branch_id,
      cash_register_id,
      user_id,
      type,
      amount,
      direction,
      description,
      reference_id
    )
    VALUES (
      v_org_id,
      p_branch_id,
      v_register_id,
      auth.uid(),
      'sale',
      v_cash_movement,
      1,
      'Venda #' || lpad(v_sale_number::text,6,'0'),
      v_sale_id
    );
  END IF;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_sale(uuid,numeric,jsonb,jsonb,uuid,uuid)
TO authenticated;

-- ============================================================
-- 7. RPC DE CONSULTA DO COMPROVANTE
--    Retorna tudo reconstruído do banco, nunca do estado do frontend.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_sale_receipt(
  p_sale_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT s.*
    INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND public.can_access_branch(s.branch_id);

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'sale_not_found';
  END IF;

  SELECT jsonb_build_object(
    'sale', jsonb_build_object(
      'id', v_sale.id,
      'sale_number', v_sale.sale_number,
      'organization_id', v_sale.organization_id,
      'branch_id', v_sale.branch_id,
      'status', v_sale.status,
      'subtotal', v_sale.subtotal,
      'discount', v_sale.discount,
      'total', v_sale.total,
      'created_at', v_sale.created_at,
      'organization_name', v_sale.organization_name_snapshot,
      'branch_name', v_sale.branch_name_snapshot,
      'branch_code', v_sale.branch_code_snapshot,
      'address_line', v_sale.branch_address_snapshot,
      'city', v_sale.branch_city_snapshot,
      'state', v_sale.branch_state_snapshot,
      'zip_code', v_sale.branch_zip_snapshot,
      'phone', v_sale.branch_phone_snapshot,
      'seller_name', v_sale.seller_name_snapshot,
      'customer_name', v_sale.customer_name_snapshot,
      'customer_document', v_sale.customer_document_snapshot,
      'customer_phone', v_sale.customer_phone_snapshot
    ),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', si.id,
          'product_id', si.product_id,
          'product_name', si.product_name,
          'quantity', si.quantity,
          'unit_price', si.unit_price,
          'discount', si.discount,
          'total', si.total
        )
        ORDER BY si.id
      )
      FROM public.sale_items si
      WHERE si.sale_id = v_sale.id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sp.id,
          'method', sp.method,
          'amount', sp.amount,
          'received_amount', sp.received_amount,
          'change_amount', sp.change_amount
        )
        ORDER BY sp.id
      )
      FROM public.sale_payments sp
      WHERE sp.sale_id = v_sale.id
    ), '[]'::jsonb),
    'settings', COALESCE((
      SELECT jsonb_build_object(
        'width', rs.width,
        'footer_text', rs.footer_text,
        'show_cnpj', rs.show_cnpj,
        'show_address', rs.show_address,
        'show_seller', rs.show_seller,
        'show_customer', rs.show_customer,
        'auto_print', rs.auto_print,
        'logo_url', rs.logo_url
      )
      FROM public.receipt_settings rs
      WHERE rs.branch_id = v_sale.branch_id
    ), jsonb_build_object(
      'width', '80mm',
      'footer_text', 'Obrigado pela preferência!',
      'show_cnpj', true,
      'show_address', true,
      'show_seller', true,
      'show_customer', true,
      'auto_print', false,
      'logo_url', NULL
    ))
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sale_receipt(uuid)
TO authenticated;

-- ============================================================
-- 8. RPC DE LOG DE COMPROVANTE
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_receipt_action(
  p_sale_id uuid,
  p_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_log_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_type NOT IN ('original','reprint','preview','pdf','share') THEN
    RAISE EXCEPTION 'invalid_receipt_log_type';
  END IF;

  SELECT s.*
    INTO v_sale
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND public.can_access_branch(s.branch_id);

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'sale_not_found';
  END IF;

  INSERT INTO public.receipt_print_logs (
    organization_id,
    branch_id,
    sale_id,
    user_id,
    type
  )
  VALUES (
    v_sale.organization_id,
    v_sale.branch_id,
    v_sale.id,
    auth.uid(),
    p_type
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_receipt_action(uuid,text)
TO authenticated;

-- ============================================================
-- 9. CONSULTA DO HISTÓRICO DE REIMPRESSÕES
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_receipt_logs(
  p_sale_id uuid
)
RETURNS TABLE (
  id uuid,
  type text,
  user_id uuid,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.type, l.user_id, l.created_at
  FROM public.receipt_print_logs l
  WHERE l.sale_id = p_sale_id
    AND public.can_access_branch(l.branch_id)
  ORDER BY l.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_receipt_logs(uuid)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
