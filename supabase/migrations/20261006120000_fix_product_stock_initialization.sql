BEGIN;

CREATE TABLE IF NOT EXISTS public.product_creation_requests (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, request_id)
);

ALTER TABLE public.product_creation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_creation_requests FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.create_product_with_stock(uuid,text,text,text,text,numeric,numeric,numeric,numeric);

CREATE FUNCTION public.create_product_with_stock(
  p_branch_id uuid, p_name text, p_sku text, p_barcode text, p_unit text,
  p_cost_price numeric, p_sale_price numeric, p_initial_stock numeric,
  p_minimum_stock numeric, p_request_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid; v_id uuid; v_existing uuid;
  v_initial numeric := coalesce(p_initial_stock, 0);
  v_min numeric := coalesce(p_minimum_stock, 0);
  v_cost numeric := coalesce(p_cost_price, 0);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT organization_id INTO v_org FROM public.branches WHERE id = p_branch_id AND active = true;
  IF v_org IS NULL OR NOT public.can_access_branch(p_branch_id) THEN RAISE EXCEPTION 'invalid_branch'; END IF;
  IF NOT public.can_manage_stock(v_org) THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;
  IF nullif(trim(p_name), '') IS NULL THEN RAISE EXCEPTION 'product_name_required'; END IF;
  IF v_initial < 0 THEN RAISE EXCEPTION 'invalid_initial_stock'; END IF;

  IF p_request_id IS NOT NULL THEN
    INSERT INTO public.product_creation_requests(organization_id, request_id)
    VALUES (v_org, p_request_id)
    ON CONFLICT (organization_id, request_id) DO NOTHING;
    SELECT product_id INTO v_existing
    FROM public.product_creation_requests
    WHERE organization_id = v_org AND request_id = p_request_id
    FOR UPDATE;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  INSERT INTO public.products(
    organization_id, name, sku, barcode, unit, cost_price, sale_price,
    stock_quantity, minimum_stock
  ) VALUES (
    v_org, trim(p_name), nullif(trim(coalesce(p_sku, '')), ''),
    nullif(trim(coalesce(p_barcode, '')), ''), coalesce(nullif(trim(p_unit), ''), 'UN'),
    v_cost, coalesce(p_sale_price, 0), v_initial, v_min
  ) RETURNING id INTO v_id;

  -- The products AFTER INSERT trigger is the sole stock initializer.
  IF v_initial > 0 THEN
    INSERT INTO public.inventory_movements(
      organization_id, branch_id, product_id, type, quantity,
      previous_quantity, new_quantity, notes, created_by, quantity_delta,
      unit_cost, balance_after, reason
    ) VALUES (
      v_org, p_branch_id, v_id, 'entry', v_initial, 0, v_initial,
      'Estoque inicial', auth.uid(), v_initial, v_cost, v_initial,
      'Estoque inicial do cadastro'
    );
  END IF;

  IF p_request_id IS NOT NULL THEN
    UPDATE public.product_creation_requests
    SET product_id = v_id
    WHERE organization_id = v_org AND request_id = p_request_id;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_product_with_stock(uuid,text,text,text,text,numeric,numeric,numeric,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product_with_stock(uuid,text,text,text,text,numeric,numeric,numeric,numeric,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
