-- Mission 3: restore missing core RPCs and enforce commercial invariants.
BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_entitlements (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_limit integer NOT NULL DEFAULT 1 CHECK (branch_limit >= 1),
  payment_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'base' CHECK (status IN ('base','pending','active','past_due','canceled')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_entitlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members view own entitlement" ON public.organization_entitlements;
CREATE POLICY "members view own entitlement" ON public.organization_entitlements
  FOR SELECT TO authenticated USING (public.is_organization_member(organization_id));

INSERT INTO public.organization_entitlements (organization_id)
SELECT id FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_org_active_barcode_lookup
  ON public.products (organization_id, lower(btrim(barcode)))
  WHERE active = true AND barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_barcode()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.active AND NEW.barcode IS NOT NULL AND btrim(NEW.barcode) <> '' AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.organization_id = NEW.organization_id AND p.active
      AND lower(btrim(p.barcode)) = lower(btrim(NEW.barcode)) AND p.id <> NEW.id
  ) THEN RAISE EXCEPTION 'product_barcode_already_exists'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_products_unique_active_barcode ON public.products;
CREATE TRIGGER trg_products_unique_active_barcode BEFORE INSERT OR UPDATE OF organization_id,barcode,active ON public.products
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_active_barcode();

CREATE OR REPLACE FUNCTION public.get_my_billing_status()
RETURNS TABLE (organization_id uuid, branch_count bigint, branch_limit integer, status text, payment_confirmed boolean, can_manage_branches boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.organization_id, count(b.id), e.branch_limit, e.status, e.payment_confirmed,
    (e.branch_limit > 1 AND e.payment_confirmed)
  FROM public.organization_entitlements e
  JOIN public.organization_members om ON om.organization_id = e.organization_id
    AND om.user_id = auth.uid() AND om.active = true
  LEFT JOIN public.branches b ON b.organization_id = e.organization_id AND b.active = true
  GROUP BY e.organization_id, e.branch_limit, e.status, e.payment_confirmed;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_billing_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_branch(p_name text, p_code text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_id uuid; v_code text; v_limit integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT organization_id INTO v_org FROM public.organization_members
    WHERE user_id = auth.uid() AND active AND role IN ('owner','admin') ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT branch_limit INTO v_limit FROM public.organization_entitlements WHERE organization_id = v_org;
  IF (SELECT count(*) FROM public.branches WHERE organization_id = v_org AND active) >= coalesce(v_limit, 1)
    THEN RAISE EXCEPTION 'branch_limit_reached'; END IF;
  IF btrim(coalesce(p_name,'')) = '' THEN RAISE EXCEPTION 'branch_name_required'; END IF;
  v_code := nullif(btrim(coalesce(p_code,'')), '');
  IF v_code IS NULL THEN
    SELECT lpad((coalesce(max(nullif(regexp_replace(code,'[^0-9]','','g'),'')::integer),0)+1)::text,3,'0')
      INTO v_code FROM public.branches WHERE organization_id = v_org;
  END IF;
  IF EXISTS (SELECT 1 FROM public.branches WHERE organization_id=v_org AND lower(code)=lower(v_code))
    THEN RAISE EXCEPTION 'branch_code_already_exists'; END IF;
  INSERT INTO public.branches (organization_id,name,code,is_headquarters,active)
    VALUES (v_org,btrim(p_name),v_code,false,true) RETURNING id INTO v_id;
  INSERT INTO public.branch_product_stock (organization_id,branch_id,product_id,stock_quantity,minimum_stock)
    SELECT v_org,v_id,p.id,0,p.minimum_stock FROM public.products p
    WHERE p.organization_id=v_org AND p.active ON CONFLICT (branch_id,product_id) DO NOTHING;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_branch(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_branch_id uuid, p_opening_balance numeric DEFAULT 0, p_operator_user_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_role public.member_role; v_operator uuid := coalesce(p_operator_user_id,auth.uid()); v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF coalesce(p_opening_balance,0) < 0 THEN RAISE EXCEPTION 'opening_balance_invalid'; END IF;
  SELECT organization_id INTO v_org FROM public.branches WHERE id=p_branch_id AND active AND public.can_access_branch(id);
  IF v_org IS NULL THEN RAISE EXCEPTION 'invalid_branch'; END IF;
  SELECT role INTO v_role FROM public.organization_members WHERE organization_id=v_org AND user_id=auth.uid() AND active;
  IF v_role IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF v_operator <> auth.uid() AND v_role NOT IN ('owner','admin','manager') THEN RAISE EXCEPTION 'operator_selection_denied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id=v_org AND om.user_id=v_operator AND om.active)
    THEN RAISE EXCEPTION 'operator_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.cash_registers WHERE branch_id=p_branch_id AND status='open')
    THEN RAISE EXCEPTION 'cash_already_open'; END IF;
  INSERT INTO public.cash_registers (organization_id,branch_id,opened_by,opened_at,opening_balance,terminal_number,terminal_name,status)
    VALUES (v_org,p_branch_id,v_operator,now(),round(coalesce(p_opening_balance,0),2),1,'Caixa 01','open') RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'cash_already_open';
END; $$;
GRANT EXECUTE ON FUNCTION public.open_cash_register(uuid,numeric,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_source_branch_id uuid,p_destination_branch_id uuid,p_items jsonb,p_request_key uuid DEFAULT NULL,p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid; v_id uuid; v_num bigint; x jsonb; v_product uuid; v_qty numeric;
BEGIN
  SELECT organization_id INTO v_org FROM public.branches WHERE id=p_source_branch_id AND active;
  IF v_org IS NULL OR p_source_branch_id=p_destination_branch_id OR NOT public.can_access_branch(p_source_branch_id) OR NOT public.can_access_branch(p_destination_branch_id)
    THEN RAISE EXCEPTION 'invalid_transfer_branches'; END IF;
  IF (SELECT count(*) FROM public.branches WHERE organization_id=v_org AND active) < 2 THEN RAISE EXCEPTION 'multiple_branches_required'; END IF;
  IF NOT public.can_manage_stock(v_org) THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;
  IF p_request_key IS NOT NULL THEN SELECT id INTO v_id FROM public.stock_transfers WHERE organization_id=v_org AND request_key=p_request_key; IF v_id IS NOT NULL THEN RETURN v_id; END IF; END IF;
  IF jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 THEN RAISE EXCEPTION 'empty_transfer'; END IF;
  v_num := public.next_stock_transfer_number(v_org);
  INSERT INTO public.stock_transfers (organization_id,transfer_number,source_branch_id,destination_branch_id,notes,requested_by,request_key)
    VALUES(v_org,v_num,p_source_branch_id,p_destination_branch_id,p_notes,auth.uid(),p_request_key) RETURNING id INTO v_id;
  FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product:=(x->>'product_id')::uuid; v_qty:=(x->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty<=0 THEN RAISE EXCEPTION 'invalid_transfer_quantity'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=v_product AND organization_id=v_org AND active) THEN RAISE EXCEPTION 'product_not_found'; END IF;
    INSERT INTO public.stock_transfer_items(transfer_id,product_id,quantity) VALUES(v_id,v_product,v_qty);
  END LOOP;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid,uuid,jsonb,uuid,text) TO authenticated;

-- The operator summary must group by the same key used by its correlated movement query.
CREATE OR REPLACE FUNCTION public.get_cash_report(p_organization_id uuid,p_branch_id uuid DEFAULT NULL,p_start timestamptz DEFAULT NULL,p_end timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_start timestamptz:=coalesce(p_start,now()-interval '1 day'); v_end timestamptz:=coalesce(p_end,now()); v_result jsonb;
BEGIN
  IF v_end<=v_start THEN RAISE EXCEPTION 'invalid_period'; END IF;
  PERFORM 1 FROM public.report_allowed_branches(p_organization_id,p_branch_id);
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'register_count',(SELECT count(*) FROM public.cash_registers cr WHERE cr.organization_id=p_organization_id AND cr.branch_id IN (SELECT branch_id FROM public.report_allowed_branches(p_organization_id,p_branch_id)) AND cr.opened_at>=v_start AND cr.opened_at<v_end),
      'open_count',(SELECT count(*) FROM public.cash_registers cr WHERE cr.organization_id=p_organization_id AND cr.branch_id IN (SELECT branch_id FROM public.report_allowed_branches(p_organization_id,p_branch_id)) AND cr.status='open'),
      'difference_total',coalesce((SELECT sum(cr.difference) FROM public.cash_registers cr WHERE cr.organization_id=p_organization_id AND cr.branch_id IN (SELECT branch_id FROM public.report_allowed_branches(p_organization_id,p_branch_id)) AND cr.status='closed' AND cr.closed_at>=v_start AND cr.closed_at<v_end),0),
      'cash_out_total',coalesce((SELECT sum(cm.amount) FROM public.cash_movements cm WHERE cm.organization_id=p_organization_id AND cm.branch_id IN (SELECT branch_id FROM public.report_allowed_branches(p_organization_id,p_branch_id)) AND cm.direction=-1 AND cm.type IN ('cash_out','withdrawal') AND cm.created_at>=v_start AND cm.created_at<v_end),0),
      'cash_in_total',coalesce((SELECT sum(cm.amount) FROM public.cash_movements cm WHERE cm.organization_id=p_organization_id AND cm.branch_id IN (SELECT branch_id FROM public.report_allowed_branches(p_organization_id,p_branch_id)) AND cm.direction=1 AND cm.type IN ('cash_in','supply') AND cm.created_at>=v_start AND cm.created_at<v_end),0)
    ),
    'registers',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.opened_at DESC) FROM (SELECT cr.id register_id,cr.branch_id,b.name branch_name,cr.terminal_number,cr.terminal_name,cr.status,cr.opened_at,cr.closed_at,cr.opening_balance,cr.expected_balance,cr.counted_balance,cr.difference,cr.closing_observation,op.full_name opened_by_name,cl.full_name closed_by_name FROM public.cash_registers cr JOIN public.branches b ON b.id=cr.branch_id LEFT JOIN public.profiles op ON op.id=cr.opened_by LEFT JOIN public.profiles cl ON cl.id=cr.closed_by WHERE cr.organization_id=p_organization_id AND cr.branch_id IN (SELECT branch_id FROM public.report_allowed_branches(p_organization_id,p_branch_id)) AND cr.opened_at>=v_start AND cr.opened_at<v_end) x),'[]'::jsonb),
    'operator_summary',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.operator_name) FROM (SELECT coalesce(p.full_name,'Operador') operator_name,count(*) register_count,coalesce(sum(cr.difference) FILTER(WHERE cr.status='closed'),0) difference_total,coalesce((SELECT sum(cm.amount) FROM public.cash_movements cm WHERE cm.created_by=cr.opened_by AND cm.branch_id IN (SELECT branch_id FROM public.report_allowed_branches(p_organization_id,p_branch_id)) AND cm.type IN ('cash_out','withdrawal') AND cm.created_at>=v_start AND cm.created_at<v_end),0) cash_out_total FROM public.cash_registers cr LEFT JOIN public.profiles p ON p.id=cr.opened_by WHERE cr.organization_id=p_organization_id AND cr.branch_id IN (SELECT branch_id FROM public.report_allowed_branches(p_organization_id,p_branch_id)) AND cr.opened_at>=v_start AND cr.opened_at<v_end GROUP BY p.full_name,cr.opened_by) x),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_cash_report(uuid,uuid,timestamptz,timestamptz) TO authenticated;

COMMIT;
