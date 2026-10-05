-- Unifica cadastro de produtos, estoque, inventário/Kardex e restaura a RPC do caixa.
-- Aplicada no Supabase de produção em 2026-10-05.
BEGIN;

CREATE OR REPLACE FUNCTION public.register_cash_movement(
  p_cash_register_id uuid, p_type text, p_amount numeric,
  p_description text DEFAULT NULL, p_direction smallint DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_register public.cash_registers%ROWTYPE; v_movement_id uuid; v_direction smallint; v_amount numeric(12,2):=round(coalesce(p_amount,0),2);
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 IF v_amount<=0 THEN RAISE EXCEPTION 'cash_movement_amount_invalid'; END IF;
 IF p_type NOT IN ('cash_in','cash_out','withdrawal','supply','adjustment') THEN RAISE EXCEPTION 'cash_movement_type_invalid'; END IF;
 SELECT * INTO v_register FROM public.cash_registers WHERE id=p_cash_register_id FOR UPDATE;
 IF NOT FOUND OR v_register.status<>'open' THEN RAISE EXCEPTION 'cash_not_open'; END IF;
 IF NOT public.can_access_branch(v_register.branch_id) THEN RAISE EXCEPTION 'invalid_branch'; END IF;
 v_direction:=CASE WHEN p_type IN ('cash_out','withdrawal') THEN -1 WHEN p_type IN ('cash_in','supply') THEN 1 ELSE coalesce(p_direction,1) END;
 IF v_direction NOT IN (-1,1) THEN RAISE EXCEPTION 'cash_movement_direction_invalid'; END IF;
 IF p_type='withdrawal' AND nullif(trim(coalesce(p_description,'')),'') IS NULL THEN RAISE EXCEPTION 'withdrawal_reason_required'; END IF;
 INSERT INTO public.cash_movements(organization_id,branch_id,cash_register_id,created_by,type,amount,direction,description)
 VALUES(v_register.organization_id,v_register.branch_id,v_register.id,auth.uid(),p_type,v_amount,v_direction,nullif(trim(coalesce(p_description,'')),''))
 RETURNING id INTO v_movement_id;
 RETURN v_movement_id;
END; $$;
REVOKE ALL ON FUNCTION public.register_cash_movement(uuid,text,numeric,text,smallint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_cash_movement(uuid,text,numeric,text,smallint) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_product_with_stock(
 p_branch_id uuid,p_name text,p_sku text,p_barcode text,p_unit text,p_cost_price numeric,p_sale_price numeric,p_initial_stock numeric,p_minimum_stock numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid;v_id uuid;v_initial numeric:=coalesce(p_initial_stock,0);
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 SELECT organization_id INTO v_org FROM public.branches WHERE id=p_branch_id AND active=true;
 IF v_org IS NULL OR NOT public.can_access_branch(p_branch_id) THEN RAISE EXCEPTION 'invalid_branch'; END IF;
 IF NOT public.can_manage_stock(v_org) THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;
 IF nullif(trim(p_name),'') IS NULL THEN RAISE EXCEPTION 'product_name_required'; END IF;
 IF v_initial<0 THEN RAISE EXCEPTION 'invalid_initial_stock'; END IF;
 INSERT INTO public.products(organization_id,name,sku,barcode,unit,cost_price,sale_price,stock_quantity,minimum_stock)
 VALUES(v_org,trim(p_name),nullif(trim(coalesce(p_sku,'')),''),nullif(trim(coalesce(p_barcode,'')),''),coalesce(nullif(trim(p_unit),''),'UN'),coalesce(p_cost_price,0),coalesce(p_sale_price,0),0,coalesce(p_minimum_stock,0))
 RETURNING id INTO v_id;
 IF v_initial>0 THEN
  PERFORM public.post_stock_movement(p_branch_id,v_id,v_initial,'entry','Estoque inicial do cadastro',NULL,coalesce(p_cost_price,0),NULL);
 ELSE
  INSERT INTO public.branch_product_stock(organization_id,branch_id,product_id,stock_quantity,minimum_stock,average_cost)
  VALUES(v_org,p_branch_id,v_id,0,coalesce(p_minimum_stock,0),coalesce(p_cost_price,0))
  ON CONFLICT (branch_id,product_id) DO NOTHING;
 END IF;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_product_with_stock(uuid,text,text,text,text,numeric,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_product_with_stock(uuid,text,text,text,text,numeric,numeric,numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_product_with_stock(
 p_branch_id uuid,p_product_id uuid,p_name text,p_sku text,p_barcode text,p_unit text,p_cost_price numeric,p_sale_price numeric,p_stock_quantity numeric,p_minimum_stock numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid;v_current numeric;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
 SELECT organization_id INTO v_org FROM public.branches WHERE id=p_branch_id AND active=true;
 IF v_org IS NULL OR NOT public.can_access_branch(p_branch_id) THEN RAISE EXCEPTION 'invalid_branch'; END IF;
 IF NOT public.can_manage_stock(v_org) THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;
 IF coalesce(p_stock_quantity,0)<0 THEN RAISE EXCEPTION 'invalid_stock_quantity'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id AND organization_id=v_org AND active=true) THEN RAISE EXCEPTION 'product_not_found'; END IF;
 UPDATE public.products SET name=trim(p_name),sku=nullif(trim(coalesce(p_sku,'')),''),barcode=nullif(trim(coalesce(p_barcode,'')),''),unit=coalesce(nullif(trim(p_unit),''),'UN'),cost_price=coalesce(p_cost_price,0),sale_price=coalesce(p_sale_price,0),minimum_stock=coalesce(p_minimum_stock,0),updated_at=now() WHERE id=p_product_id;
 INSERT INTO public.branch_product_stock(organization_id,branch_id,product_id,stock_quantity,minimum_stock,average_cost)
 VALUES(v_org,p_branch_id,p_product_id,0,coalesce(p_minimum_stock,0),coalesce(p_cost_price,0))
 ON CONFLICT (branch_id,product_id) DO UPDATE SET minimum_stock=excluded.minimum_stock;
 SELECT stock_quantity INTO v_current FROM public.branch_product_stock WHERE branch_id=p_branch_id AND product_id=p_product_id;
 IF coalesce(p_stock_quantity,0)<>coalesce(v_current,0) THEN PERFORM public.stock_adjust(p_branch_id,p_product_id,p_stock_quantity,'Ajuste pelo cadastro de produtos'); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.update_product_with_stock(uuid,uuid,text,text,text,text,numeric,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_product_with_stock(uuid,uuid,text,text,text,text,numeric,numeric,numeric,numeric) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
