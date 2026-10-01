-- 0005_sales_profit_and_complete_sale.sql

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS total_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_profit numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit numeric(12,2) NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.complete_sale(uuid, jsonb, jsonb, numeric);

CREATE OR REPLACE FUNCTION public.complete_sale(
  p_branch_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount numeric DEFAULT 0
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
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := round(greatest(coalesce(p_discount, 0), 0), 2);
  v_total numeric(12,2) := 0;
  v_total_cost numeric(12,2) := 0;
  v_gross_profit numeric(12,2) := 0;
  v_qty numeric;
  v_unit_price numeric(12,2);
  v_unit_cost numeric(12,2);
  v_item_total numeric(12,2);
  v_item_cost numeric(12,2);
  v_item_profit numeric(12,2);
  v_payment_total numeric(12,2) := 0;
BEGIN
  SELECT b.organization_id
    INTO v_org_id
  FROM public.branches AS b
  WHERE b.id = p_branch_id
    AND b.active = true;

  IF v_org_id IS NULL OR NOT public.is_organization_member(v_org_id) THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;

  SELECT cr.id
    INTO v_register_id
  FROM public.cash_registers AS cr
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

  -- Primeira passagem: trava os produtos, valida estoque e calcula subtotal/custo.
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    SELECT p.*
      INTO v_product
    FROM public.products AS p
    WHERE p.id = (v_item->>'product_id')::uuid
      AND p.organization_id = v_org_id
      AND p.active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found';
    END IF;

    v_qty := (v_item->>'quantity')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;

    IF v_product.stock_quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_product.name;
    END IF;

    v_unit_price := round(v_product.sale_price, 2);
    v_unit_cost := round(v_product.cost_price, 2);
    v_item_total := round(v_qty * v_unit_price, 2);
    v_item_cost := round(v_qty * v_unit_cost, 2);

    v_subtotal := round(v_subtotal + v_item_total, 2);
    v_total_cost := round(v_total_cost + v_item_cost, 2);
  END LOOP;

  v_total := round(greatest(v_subtotal - v_discount, 0), 2);

  -- O desconto reduz a receita da venda e, portanto, o lucro bruto.
  v_gross_profit := round(v_total - v_total_cost, 2);

  -- Confere os pagamentos antes de gravar a venda.
  FOR v_payment IN
    SELECT value
    FROM jsonb_array_elements(coalesce(p_payments, '[]'::jsonb))
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

  -- Grava itens, custo histórico e lucro por item; depois baixa o estoque.
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    SELECT p.*
      INTO v_product
    FROM public.products AS p
    WHERE p.id = (v_item->>'product_id')::uuid
      AND p.organization_id = v_org_id
      AND p.active = true
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

    UPDATE public.products AS p
    SET stock_quantity = p.stock_quantity - v_qty,
        updated_at = now()
    WHERE p.id = v_product.id;

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
      v_product.stock_quantity,
      v_product.stock_quantity - v_qty,
      v_sale_id,
      'Venda ' || v_sale_id::text,
      auth.uid()
    );
  END LOOP;

  -- Registra cada forma de pagamento.
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

  -- Registra a entrada no caixa.
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

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_sale(uuid, jsonb, jsonb, numeric)
TO authenticated;

NOTIFY pgrst, 'reload schema';
