-- Final sale transaction: current inventory columns plus idempotency.
BEGIN;
+CREATE OR REPLACE FUNCTION public.complete_sale(
  p_branch_id uuid,
  p_discount numeric DEFAULT 0,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_seller_user_id uuid DEFAULT NULL,
  p_request_key uuid DEFAULT NULL
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
  v_existing_sale uuid;
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

  IF p_request_key IS NOT NULL THEN
    SELECT s.id INTO v_existing_sale FROM public.sales s WHERE s.organization_id=v_org_id AND s.request_key=p_request_key;
    IF v_existing_sale IS NOT NULL THEN RETURN v_existing_sale; END IF;
  END IF;

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
    request_key,
    branch_id,
    customer_id,
    cash_register_id,
    created_by,
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
    p_request_key,
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
    NULLIF(concat_ws(', ', v_branch.address, v_branch.address_number, v_branch.address_complement, v_branch.neighborhood), ''),
    v_branch.city,
    v_branch.state,
    v_branch.postal_code,
    v_org.phone,
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
      organization_id, branch_id, product_id, created_by, type, quantity, unit_cost,
      previous_quantity, new_quantity, reference_id, notes
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



-- ============================================================

REVOKE EXECUTE ON FUNCTION public.complete_sale(uuid,numeric,jsonb,jsonb,uuid,uuid,uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_sale(uuid,numeric,jsonb,jsonb,uuid,uuid,uuid) TO authenticated;
COMMIT;
