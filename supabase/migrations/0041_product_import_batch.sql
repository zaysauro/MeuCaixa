-- 0041_product_import_batch.sql
-- Importação controlada de produtos/preços. O saldo por filial continua
-- passando exclusivamente por post_stock_movement.
BEGIN;

CREATE OR REPLACE FUNCTION public.import_products_batch(
  p_branch_id uuid,
  p_rows jsonb,
  p_mode text DEFAULT 'products',
  p_update_existing boolean DEFAULT false,
  p_file_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_row jsonb;
  v_product public.products%ROWTYPE;
  v_category uuid;
  v_product_id uuid;
  v_stock numeric;
  v_current_stock numeric;
  v_delta numeric;
  v_name text;
  v_sku text;
  v_barcode text;
  v_unit text;
  v_description text;
  v_category_name text;
  v_sale_price numeric;
  v_cost_price numeric;
  v_stock_quantity numeric;
  v_index integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_reason text;
  v_process_stock boolean := true;
BEGIN
  IF p_mode NOT IN ('products', 'prices') THEN
    RAISE EXCEPTION 'import_mode_invalid';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'import_rows_invalid';
  END IF;

  SELECT b.organization_id INTO v_org
  FROM public.branches b
  WHERE b.id = p_branch_id AND b.active = true;
  IF v_org IS NULL OR NOT public.can_access_branch(p_branch_id) THEN
    RAISE EXCEPTION 'invalid_branch';
  END IF;
  IF NOT public.can_manage_stock(v_org) THEN
    RAISE EXCEPTION 'stock_permission_denied';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_index := v_index + 1;
    BEGIN
      v_category := NULL;
      v_process_stock := true;
      v_name := NULLIF(trim(v_row->>'name'), '');
      v_sku := NULLIF(trim(v_row->>'sku'), '');
      v_barcode := NULLIF(trim(v_row->>'barcode'), '');
      v_unit := COALESCE(NULLIF(trim(v_row->>'unit'), ''), 'UN');
      v_description := NULLIF(trim(v_row->>'description'), '');
      v_category_name := NULLIF(trim(v_row->>'category'), '');
      v_sale_price := CASE WHEN NULLIF(trim(v_row->>'sale_price'), '') IS NULL THEN NULL ELSE (v_row->>'sale_price')::numeric END;
      v_cost_price := CASE WHEN NULLIF(trim(v_row->>'cost_price'), '') IS NULL THEN NULL ELSE (v_row->>'cost_price')::numeric END;
      v_stock_quantity := CASE WHEN NULLIF(trim(v_row->>'stock_quantity'), '') IS NULL THEN NULL ELSE (v_row->>'stock_quantity')::numeric END;

      IF p_mode = 'prices' AND v_sale_price IS NULL THEN
        RAISE EXCEPTION 'price_required';
      END IF;
      IF p_mode = 'products' AND v_name IS NULL THEN
        RAISE EXCEPTION 'name_required';
      END IF;
      IF v_sale_price IS NOT NULL AND v_sale_price < 0 THEN RAISE EXCEPTION 'sale_price_invalid'; END IF;
      IF v_cost_price IS NOT NULL AND v_cost_price < 0 THEN RAISE EXCEPTION 'cost_price_invalid'; END IF;
      IF v_stock_quantity IS NOT NULL AND v_stock_quantity < 0 THEN RAISE EXCEPTION 'stock_quantity_invalid'; END IF;
      IF v_barcode IS NULL AND v_sku IS NULL THEN RAISE EXCEPTION 'identity_required'; END IF;

      SELECT p.* INTO v_product
      FROM public.products p
      WHERE p.organization_id = v_org AND p.active = true
        AND ((v_barcode IS NOT NULL AND lower(p.barcode) = lower(v_barcode))
          OR (v_barcode IS NULL AND v_sku IS NOT NULL AND lower(p.sku) = lower(v_sku)))
      ORDER BY CASE WHEN v_barcode IS NOT NULL AND lower(p.barcode) = lower(v_barcode) THEN 0 ELSE 1 END
      LIMIT 1 FOR UPDATE;

      IF FOUND THEN
        v_product_id := v_product.id;
        IF NOT p_update_existing AND p_mode = 'products' THEN
          v_skipped := v_skipped + 1;
          v_process_stock := false;
        ELSE
          IF p_mode = 'prices' THEN
            UPDATE public.products SET sale_price = v_sale_price, updated_at = now() WHERE id = v_product_id;
          ELSE
            IF v_category_name IS NOT NULL THEN
              SELECT c.id INTO v_category FROM public.product_categories c WHERE c.organization_id = v_org AND c.active = true AND lower(c.name) = lower(v_category_name) LIMIT 1;
              IF v_category IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;
            END IF;
            UPDATE public.products SET name = COALESCE(v_name, name), sku = COALESCE(v_sku, sku), barcode = COALESCE(v_barcode, barcode), unit = COALESCE(v_unit, unit), description = COALESCE(v_description, description), sale_price = COALESCE(v_sale_price, sale_price), cost_price = COALESCE(v_cost_price, cost_price), category_id = COALESCE(v_category, category_id), updated_at = now() WHERE id = v_product_id;
          END IF;
          v_updated := v_updated + 1;
        END IF;
      ELSE
        IF p_mode = 'prices' THEN RAISE EXCEPTION 'product_not_found'; END IF;
        IF v_category_name IS NOT NULL THEN
          SELECT c.id INTO v_category FROM public.product_categories c WHERE c.organization_id = v_org AND c.active = true AND lower(c.name) = lower(v_category_name) LIMIT 1;
          IF v_category IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;
        END IF;
        INSERT INTO public.products (organization_id, category_id, sku, barcode, name, description, unit, cost_price, sale_price, stock_quantity, active)
        VALUES (v_org, v_category, v_sku, v_barcode, v_name, v_description, v_unit, COALESCE(v_cost_price, 0), COALESCE(v_sale_price, 0), 0, true)
        RETURNING * INTO v_product;
        v_product_id := v_product.id;
        v_inserted := v_inserted + 1;
      END IF;

      IF v_process_stock AND p_mode = 'products' AND v_stock_quantity IS NOT NULL THEN
        SELECT COALESCE(ps.stock_quantity, 0) INTO v_current_stock FROM public.branch_product_stock ps WHERE ps.branch_id = p_branch_id AND ps.product_id = v_product_id FOR UPDATE;
        v_delta := v_stock_quantity - COALESCE(v_current_stock, 0);
        IF v_delta <> 0 THEN
          PERFORM public.post_stock_movement(p_branch_id, v_product_id, v_delta, CASE WHEN v_delta > 0 THEN 'entry' ELSE 'adjustment' END, 'Importação de produtos' || COALESCE(' · ' || p_file_name, ''), NULL, COALESCE(v_cost_price, v_product.cost_price, 0));
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_reason := SQLERRM;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('line', v_index, 'message', v_reason));
    END;
  END LOOP;

  INSERT INTO public.audit_logs (organization_id, user_id, action, module, entity_type, description, metadata)
  VALUES (v_org, auth.uid(), 'import', 'products', 'product_import', 'Importação de produtos concluída', jsonb_build_object('file_name', p_file_name, 'mode', p_mode, 'inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped, 'errors', jsonb_array_length(v_errors)));

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

REVOKE ALL ON FUNCTION public.import_products_batch(uuid, jsonb, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_products_batch(uuid, jsonb, text, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
