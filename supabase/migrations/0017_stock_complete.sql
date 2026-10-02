-- 0017_stock_complete.sql
-- Estoque completo: Kardex, custo médio por filial, entradas/saídas/ajustes,
-- inventário físico e transferências com trânsito.

BEGIN;

-- Base do Kardex
ALTER TABLE public.inventory_movements
  ALTER COLUMN type TYPE text USING type::text;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS quantity_delta numeric(14,3),
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14,4),
  ADD COLUMN IF NOT EXISTS balance_after numeric(14,3),
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.branch_product_stock
  ADD COLUMN IF NOT EXISTS average_cost numeric(14,4) NOT NULL DEFAULT 0;

UPDATE public.inventory_movements
SET quantity_delta = COALESCE(quantity_delta, new_quantity - previous_quantity),
    balance_after = COALESCE(balance_after, new_quantity)
WHERE quantity_delta IS NULL OR balance_after IS NULL;

UPDATE public.branch_product_stock ps
SET average_cost = COALESCE(NULLIF(ps.average_cost,0), p.cost_price, 0)
FROM public.products p
WHERE p.id=ps.product_id;

-- Fecha o saldo inicial sem alterar o estoque atual.
INSERT INTO public.inventory_movements
(organization_id,branch_id,product_id,type,quantity,previous_quantity,new_quantity,
 reference_id,notes,created_by,quantity_delta,unit_cost,balance_after,reason)
SELECT
 ps.organization_id,ps.branch_id,ps.product_id,'initial_balance',
 GREATEST(ps.stock_quantity-COALESCE(x.delta_sum,0),0),
 0,
 GREATEST(ps.stock_quantity-COALESCE(x.delta_sum,0),0),
 NULL,'Saldo inicial migrado',NULL,
 GREATEST(ps.stock_quantity-COALESCE(x.delta_sum,0),0),
 ps.average_cost,
 GREATEST(ps.stock_quantity-COALESCE(x.delta_sum,0),0),
 'Migração do saldo existente'
FROM public.branch_product_stock ps
LEFT JOIN (
 SELECT branch_id,product_id,SUM(quantity_delta) delta_sum
 FROM public.inventory_movements GROUP BY branch_id,product_id
) x ON x.branch_id=ps.branch_id AND x.product_id=ps.product_id
WHERE NOT EXISTS (
 SELECT 1 FROM public.inventory_movements im
 WHERE im.branch_id=ps.branch_id AND im.product_id=ps.product_id
 AND im.type='initial_balance'
);

CREATE INDEX IF NOT EXISTS inventory_movements_kardex_idx
ON public.inventory_movements(branch_id,product_id,created_at,id);

CREATE INDEX IF NOT EXISTS inventory_movements_reference_idx
ON public.inventory_movements(reference_id);

-- Vincula entradas ao cadastro de fornecedores já existente.
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_movements_supplier_idx
ON public.inventory_movements(supplier_id);

CREATE OR REPLACE FUNCTION public.stock_entry(
 p_branch_id uuid,p_product_id uuid,p_quantity numeric,p_unit_cost numeric,
 p_reason text,p_supplier_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $
DECLARE v_id uuid;
BEGIN
 IF p_quantity<=0 OR COALESCE(p_unit_cost,0)<0 THEN RAISE EXCEPTION 'invalid_entry'; END IF;
 v_id:=public.post_stock_movement(p_branch_id,p_product_id,p_quantity,'entry',p_reason,NULL,p_unit_cost);
 UPDATE public.inventory_movements SET supplier_id=p_supplier_id WHERE id=v_id;
 RETURN v_id;
END; $;
GRANT EXECUTE ON FUNCTION public.stock_entry(uuid,uuid,numeric,numeric,text,uuid) TO authenticated;

-- Histórico de custo médio
CREATE TABLE IF NOT EXISTS public.branch_product_cost_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 previous_cost numeric(14,4) NOT NULL DEFAULT 0,
 new_cost numeric(14,4) NOT NULL DEFAULT 0,
 quantity_before numeric(14,3) NOT NULL DEFAULT 0,
 quantity_in numeric(14,3) NOT NULL DEFAULT 0,
 unit_cost_in numeric(14,4) NOT NULL DEFAULT 0,
 reference_id uuid,
 reason text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branch_product_cost_history_idx
ON public.branch_product_cost_history(branch_id,product_id,created_at DESC);

ALTER TABLE public.branch_product_cost_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members view cost history" ON public.branch_product_cost_history;
CREATE POLICY "members view cost history"
ON public.branch_product_cost_history FOR SELECT TO authenticated
USING(public.can_access_branch(branch_id));

-- Permissões: operador não altera estoque diretamente.
CREATE OR REPLACE FUNCTION public.can_manage_stock(p_organization_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.organization_members
  WHERE organization_id=p_organization_id
    AND user_id=auth.uid()
    AND active IS DISTINCT FROM false
    AND role::text IN ('owner','admin','manager')
 );
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_stock(uuid) TO authenticated;

-- Função central: toda alteração de saldo passa por ela.
CREATE OR REPLACE FUNCTION public.post_stock_movement(
 p_branch_id uuid,
 p_product_id uuid,
 p_delta numeric,
 p_type text,
 p_reason text DEFAULT NULL,
 p_reference_id uuid DEFAULT NULL,
 p_unit_cost numeric DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_org uuid;
 v_stock public.branch_product_stock%ROWTYPE;
 v_product public.products%ROWTYPE;
 v_before numeric(14,3);
 v_after numeric(14,3);
 v_old_cost numeric(14,4);
 v_new_cost numeric(14,4);
 v_in_cost numeric(14,4);
 v_id uuid;
BEGIN
 SELECT organization_id INTO v_org FROM public.branches
 WHERE id=p_branch_id AND active=true;
 IF v_org IS NULL OR NOT public.can_access_branch(p_branch_id)
 THEN RAISE EXCEPTION 'invalid_branch'; END IF;
 IF NOT public.can_manage_stock(v_org)
 THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;

 SELECT * INTO v_product FROM public.products
 WHERE id=p_product_id AND organization_id=v_org AND active=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;

 SELECT * INTO v_stock FROM public.branch_product_stock
 WHERE branch_id=p_branch_id AND product_id=p_product_id FOR UPDATE;

 IF NOT FOUND THEN
  INSERT INTO public.branch_product_stock
  (organization_id,branch_id,product_id,stock_quantity,minimum_stock,average_cost)
  VALUES(v_org,p_branch_id,p_product_id,0,v_product.minimum_stock,COALESCE(v_product.cost_price,0))
  RETURNING * INTO v_stock;
 END IF;

 v_before:=v_stock.stock_quantity;
 v_after:=v_before+COALESCE(p_delta,0);
 IF v_after<0 THEN RAISE EXCEPTION 'insufficient_stock'; END IF;

 v_old_cost:=COALESCE(v_stock.average_cost,0);
 v_in_cost:=COALESCE(p_unit_cost,v_old_cost,v_product.cost_price,0);
 v_new_cost:=v_old_cost;

 IF p_delta>0 THEN
  IF v_before=0 THEN v_new_cost:=v_in_cost;
  ELSE v_new_cost:=((v_before*v_old_cost)+(p_delta*v_in_cost))/v_after;
  END IF;
 END IF;

 UPDATE public.branch_product_stock
 SET stock_quantity=v_after,average_cost=v_new_cost,updated_at=now()
 WHERE branch_id=p_branch_id AND product_id=p_product_id;

 INSERT INTO public.inventory_movements
 (organization_id,branch_id,product_id,type,quantity,previous_quantity,new_quantity,
  reference_id,notes,created_by,quantity_delta,unit_cost,balance_after,reason)
 VALUES
 (v_org,p_branch_id,p_product_id,p_type,ABS(p_delta),v_before,v_after,p_reference_id,
  p_reason,auth.uid(),p_delta,
  CASE WHEN p_delta>0 THEN v_in_cost ELSE v_old_cost END,
  v_after,p_reason)
 RETURNING id INTO v_id;

 IF p_delta>0 AND ABS(v_new_cost-v_old_cost)>0.00005 THEN
  INSERT INTO public.branch_product_cost_history
  (organization_id,branch_id,product_id,previous_cost,new_cost,quantity_before,
   quantity_in,unit_cost_in,reference_id,reason,created_by)
  VALUES(v_org,p_branch_id,p_product_id,v_old_cost,v_new_cost,v_before,p_delta,
         v_in_cost,p_reference_id,p_reason,auth.uid());
 END IF;

 UPDATE public.products p
 SET stock_quantity=COALESCE(
   (SELECT SUM(stock_quantity) FROM public.branch_product_stock WHERE product_id=p.id),0
 ),updated_at=now()
 WHERE p.id=p_product_id;

 RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.post_stock_movement(uuid,uuid,numeric,text,text,uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_stock_movement(uuid,uuid,numeric,text,text,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_entry(
 p_branch_id uuid,p_product_id uuid,p_quantity numeric,p_unit_cost numeric,
 p_reason text DEFAULT 'Entrada de estoque'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_quantity<=0 OR COALESCE(p_unit_cost,0)<0 THEN RAISE EXCEPTION 'invalid_entry'; END IF;
 RETURN public.post_stock_movement(p_branch_id,p_product_id,p_quantity,'entry',p_reason,NULL,p_unit_cost);
END; $$;
GRANT EXECUTE ON FUNCTION public.stock_entry(uuid,uuid,numeric,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_exit(
 p_branch_id uuid,p_product_id uuid,p_quantity numeric,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_quantity<=0 OR NULLIF(trim(p_reason),'') IS NULL
 THEN RAISE EXCEPTION 'quantity_and_reason_required'; END IF;
 RETURN public.post_stock_movement(p_branch_id,p_product_id,-p_quantity,'exit',p_reason);
END; $$;
GRANT EXECUTE ON FUNCTION public.stock_exit(uuid,uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.stock_adjust(
 p_branch_id uuid,p_product_id uuid,p_new_quantity numeric,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_current numeric;
BEGIN
 IF p_new_quantity<0 OR NULLIF(trim(p_reason),'') IS NULL
 THEN RAISE EXCEPTION 'quantity_and_reason_required'; END IF;
 SELECT stock_quantity INTO v_current FROM public.branch_product_stock
 WHERE branch_id=p_branch_id AND product_id=p_product_id FOR UPDATE;
 RETURN public.post_stock_movement(p_branch_id,p_product_id,
   p_new_quantity-COALESCE(v_current,0),'adjustment',p_reason);
END; $$;
GRANT EXECUTE ON FUNCTION public.stock_adjust(uuid,uuid,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.quick_inventory(
 p_branch_id uuid,p_product_id uuid,p_counted_quantity numeric,
 p_reason text DEFAULT 'Inventário físico'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN public.stock_adjust(p_branch_id,p_product_id,p_counted_quantity,p_reason);
END; $$;
GRANT EXECUTE ON FUNCTION public.quick_inventory(uuid,uuid,numeric,text) TO authenticated;

-- Transferências
CREATE TABLE IF NOT EXISTS public.stock_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 transfer_number bigint NOT NULL,
 source_branch_id uuid NOT NULL REFERENCES public.branches(id),
 destination_branch_id uuid NOT NULL REFERENCES public.branches(id),
 status text NOT NULL DEFAULT 'requested'
   CHECK(status IN('requested','sent','received','cancelled')),
 notes text,
 requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 received_at timestamptz,
 cancelled_at timestamptz,
 request_key uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_org_number_idx
ON public.stock_transfers(organization_id,transfer_number);
CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_request_key_idx
ON public.stock_transfers(organization_id,request_key)
WHERE request_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE RESTRICT,
 product_id uuid NOT NULL REFERENCES public.products(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 unit_cost numeric(14,4) NOT NULL DEFAULT 0,
 received_quantity numeric(14,3),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_in_transit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.products(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>=0),
 unit_cost numeric(14,4) NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(transfer_id,product_id)
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_in_transit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members view stock transfers" ON public.stock_transfers;
CREATE POLICY "members view stock transfers" ON public.stock_transfers FOR SELECT TO authenticated
USING(public.is_organization_member(organization_id)
 AND public.can_access_branch(source_branch_id)
 AND public.can_access_branch(destination_branch_id));

DROP POLICY IF EXISTS "members view stock transfer items" ON public.stock_transfer_items;
CREATE POLICY "members view stock transfer items" ON public.stock_transfer_items FOR SELECT TO authenticated
USING(EXISTS(
 SELECT 1 FROM public.stock_transfers t
 WHERE t.id=transfer_id AND public.can_access_branch(t.source_branch_id)
 AND public.can_access_branch(t.destination_branch_id)
));

DROP POLICY IF EXISTS "members view stock transit" ON public.stock_in_transit;
CREATE POLICY "members view stock transit" ON public.stock_in_transit FOR SELECT TO authenticated
USING(public.is_organization_member(organization_id));

REVOKE INSERT,UPDATE,DELETE ON public.stock_transfers,public.stock_transfer_items,public.stock_in_transit FROM authenticated;
GRANT SELECT ON public.stock_transfers,public.stock_transfer_items,public.stock_in_transit TO authenticated;

CREATE OR REPLACE FUNCTION public.next_stock_transfer_number(p_org uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org::text,0));
 SELECT COALESCE(MAX(transfer_number),0)+1 INTO v
 FROM public.stock_transfers WHERE organization_id=p_org;
 RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.create_stock_transfer(
 p_source_branch_id uuid,p_destination_branch_id uuid,p_items jsonb,
 p_request_key uuid DEFAULT NULL,p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_org uuid;v_id uuid;v_num bigint;x jsonb;v_product uuid;v_qty numeric;
BEGIN
 SELECT organization_id INTO v_org FROM public.branches
 WHERE id=p_source_branch_id AND active=true;
 IF v_org IS NULL OR p_source_branch_id=p_destination_branch_id
 OR NOT public.can_access_branch(p_source_branch_id)
 OR NOT public.can_access_branch(p_destination_branch_id)
 THEN RAISE EXCEPTION 'invalid_transfer_branches'; END IF;
 IF NOT public.can_manage_stock(v_org) THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;

 IF p_request_key IS NOT NULL THEN
  SELECT id INTO v_id FROM public.stock_transfers
  WHERE organization_id=v_org AND request_key=p_request_key;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 END IF;

 IF jsonb_array_length(COALESCE(p_items,'[]'::jsonb))=0
 THEN RAISE EXCEPTION 'empty_transfer'; END IF;

 v_num:=public.next_stock_transfer_number(v_org);
 INSERT INTO public.stock_transfers
 (organization_id,transfer_number,source_branch_id,destination_branch_id,notes,requested_by,request_key)
 VALUES(v_org,v_num,p_source_branch_id,p_destination_branch_id,p_notes,auth.uid(),p_request_key)
 RETURNING id INTO v_id;

 FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  v_product:=(x->>'product_id')::uuid;v_qty:=(x->>'quantity')::numeric;
  IF v_qty IS NULL OR v_qty<=0 THEN RAISE EXCEPTION 'invalid_transfer_quantity'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=v_product AND organization_id=v_org AND active=true)
  THEN RAISE EXCEPTION 'product_not_found'; END IF;
  INSERT INTO public.stock_transfer_items(transfer_id,product_id,quantity)
  VALUES(v_id,v_product,v_qty);
 END LOOP;
 RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid,uuid,jsonb,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_stock_transfer(p_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.stock_transfers%ROWTYPE;i record;s public.branch_product_stock%ROWTYPE;
BEGIN
 SELECT * INTO t FROM public.stock_transfers WHERE id=p_transfer_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_access_branch(t.source_branch_id) THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
 IF NOT public.can_manage_stock(t.organization_id) THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;
 IF t.status<>'requested' THEN RAISE EXCEPTION 'invalid_transfer_status'; END IF;

 FOR i IN SELECT * FROM public.stock_transfer_items WHERE transfer_id=t.id LOOP
  SELECT * INTO s FROM public.branch_product_stock
  WHERE branch_id=t.source_branch_id AND product_id=i.product_id FOR UPDATE;
  IF NOT FOUND OR s.stock_quantity<i.quantity THEN RAISE EXCEPTION 'insufficient_stock'; END IF;
  UPDATE public.stock_transfer_items SET unit_cost=s.average_cost WHERE id=i.id;
  PERFORM public.post_stock_movement(t.source_branch_id,i.product_id,-i.quantity,
    'transfer_out','Transferência #'||t.transfer_number,t.id);
  INSERT INTO public.stock_in_transit
  (organization_id,transfer_id,product_id,quantity,unit_cost)
  VALUES(t.organization_id,t.id,i.product_id,i.quantity,s.average_cost);
 END LOOP;
 UPDATE public.stock_transfers SET status='sent',sent_by=auth.uid(),sent_at=now() WHERE id=t.id;
END; $$;
GRANT EXECUTE ON FUNCTION public.send_stock_transfer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_stock_transfer(
 p_transfer_id uuid,p_items jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.stock_transfers%ROWTYPE;i record;q numeric;tc public.stock_in_transit%ROWTYPE;x jsonb;
BEGIN
 SELECT * INTO t FROM public.stock_transfers WHERE id=p_transfer_id FOR UPDATE;
 IF NOT FOUND OR NOT public.can_access_branch(t.destination_branch_id) THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
 IF NOT public.can_manage_stock(t.organization_id) THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;
 IF t.status<>'sent' THEN RAISE EXCEPTION 'invalid_transfer_status'; END IF;

 FOR i IN SELECT * FROM public.stock_transfer_items WHERE transfer_id=t.id LOOP
  SELECT * INTO tc FROM public.stock_in_transit WHERE transfer_id=t.id AND product_id=i.product_id FOR UPDATE;
  q:=i.quantity;
  IF p_items IS NOT NULL THEN
   SELECT (z->>'quantity')::numeric INTO q FROM jsonb_array_elements(p_items) z
   WHERE (z->>'product_id')::uuid=i.product_id LIMIT 1;
   q:=COALESCE(q,i.quantity);
  END IF;
  IF q IS NULL OR q<0 OR q>tc.quantity THEN RAISE EXCEPTION 'invalid_received_quantity'; END IF;
  UPDATE public.stock_transfer_items SET received_quantity=q WHERE id=i.id;
  IF q>0 THEN
   PERFORM public.post_stock_movement(t.destination_branch_id,i.product_id,q,
     'transfer_in','Transferência #'||t.transfer_number,t.id,tc.unit_cost);
  END IF;
  UPDATE public.stock_in_transit SET quantity=quantity-q WHERE id=tc.id;
 END LOOP;
 UPDATE public.stock_transfers SET status='received',received_by=auth.uid(),received_at=now() WHERE id=t.id;
END; $$;
GRANT EXECUTE ON FUNCTION public.receive_stock_transfer(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(
 p_transfer_id uuid,p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.stock_transfers%ROWTYPE;tc record;i record;
BEGIN
 SELECT * INTO t FROM public.stock_transfers WHERE id=p_transfer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'transfer_not_found'; END IF;
 IF NOT public.can_manage_stock(t.organization_id) THEN RAISE EXCEPTION 'stock_permission_denied'; END IF;
 IF NULLIF(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;

 IF t.status='requested' THEN
  UPDATE public.stock_transfers SET status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),
   notes=COALESCE(notes||' | ','')||'Cancelada: '||p_reason WHERE id=t.id;
 ELSIF t.status='sent' THEN
  FOR tc IN SELECT * FROM public.stock_in_transit WHERE transfer_id=t.id AND quantity>0 LOOP
   PERFORM public.post_stock_movement(t.source_branch_id,tc.product_id,tc.quantity,
    'transfer_cancelled','Estorno transferência #'||t.transfer_number||': '||p_reason,t.id,tc.unit_cost);
   UPDATE public.stock_in_transit SET quantity=0 WHERE id=tc.id;
  END LOOP;
  UPDATE public.stock_transfers SET status='cancelled',cancelled_by=auth.uid(),cancelled_at=now() WHERE id=t.id;
 ELSIF t.status='received' THEN
  FOR i IN SELECT * FROM public.stock_transfer_items WHERE transfer_id=t.id LOOP
   IF COALESCE(i.received_quantity,0)>0 THEN
    PERFORM public.post_stock_movement(t.destination_branch_id,i.product_id,-i.received_quantity,
     'transfer_reversal','Estorno transferência #'||t.transfer_number||': '||p_reason,t.id,i.unit_cost);
    PERFORM public.post_stock_movement(t.source_branch_id,i.product_id,i.received_quantity,
     'transfer_reversal','Estorno transferência #'||t.transfer_number||': '||p_reason,t.id,i.unit_cost);
   END IF;
  END LOOP;
  UPDATE public.stock_transfers SET status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),
   notes=COALESCE(notes||' | ','')||'Estorno: '||p_reason WHERE id=t.id;
 ELSE
  RAISE EXCEPTION 'invalid_transfer_status';
 END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.cancel_stock_transfer(uuid,text) TO authenticated;

-- Normaliza movimentos criados pelo PDV atual sem precisar reescrever o complete_sale.
CREATE OR REPLACE FUNCTION public.normalize_inventory_movement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.quantity_delta:=COALESCE(NEW.quantity_delta,NEW.new_quantity-NEW.previous_quantity);
 NEW.balance_after:=COALESCE(NEW.balance_after,NEW.new_quantity);
 IF NEW.unit_cost IS NULL THEN
  SELECT COALESCE(ps.average_cost,p.cost_price,0) INTO NEW.unit_cost
  FROM public.products p LEFT JOIN public.branch_product_stock ps
  ON ps.product_id=NEW.product_id AND ps.branch_id=NEW.branch_id
  WHERE p.id=NEW.product_id;
 END IF;
 RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS normalize_inventory_movement_before_insert ON public.inventory_movements;
CREATE TRIGGER normalize_inventory_movement_before_insert
BEFORE INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.normalize_inventory_movement();

-- Itens de venda passam a registrar o custo médio da filial.
CREATE OR REPLACE FUNCTION public.apply_branch_average_cost_to_sale_item()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_branch uuid;v_cost numeric(14,4);
BEGIN
 SELECT branch_id INTO v_branch FROM public.sales WHERE id=NEW.sale_id;
 SELECT average_cost INTO v_cost FROM public.branch_product_stock
 WHERE branch_id=v_branch AND product_id=NEW.product_id;
 IF v_cost IS NOT NULL THEN
  NEW.unit_cost:=v_cost;
  NEW.total_cost:=ROUND(NEW.quantity*v_cost,2);
  NEW.profit:=ROUND(NEW.total-NEW.total_cost,2);
 END IF;
 RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS sale_items_branch_average_cost ON public.sale_items;
CREATE TRIGGER sale_items_branch_average_cost
BEFORE INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.apply_branch_average_cost_to_sale_item();

CREATE OR REPLACE FUNCTION public.recalculate_sale_cost()
RETURNS trigger LANGUAGE plpgsql AS $
DECLARE v_sale uuid;
BEGIN
 IF TG_OP='DELETE' THEN v_sale:=OLD.sale_id; ELSE v_sale:=NEW.sale_id; END IF;
 UPDATE public.sales s
 SET total_cost=COALESCE(x.total_cost,0),
     gross_profit=ROUND(s.total-COALESCE(x.total_cost,0),2)
 FROM (SELECT sale_id,SUM(total_cost) total_cost FROM public.sale_items
       WHERE sale_id=v_sale GROUP BY sale_id) x
 WHERE s.id=v_sale;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $;

DROP TRIGGER IF EXISTS sale_items_recalculate_sale_cost ON public.sale_items;
CREATE TRIGGER sale_items_recalculate_sale_cost
AFTER INSERT OR UPDATE OR DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.recalculate_sale_cost();

-- Kardex imutável e somente leitura para o cliente.
CREATE OR REPLACE FUNCTION public.prevent_inventory_movement_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'inventory_movements_are_immutable'; END; $$;

DROP TRIGGER IF EXISTS inventory_movements_immutable ON public.inventory_movements;
CREATE TRIGGER inventory_movements_immutable
BEFORE UPDATE OR DELETE ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_movement_mutation();

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members manage inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "members view inventory movements" ON public.inventory_movements;
CREATE POLICY "members view inventory movements" ON public.inventory_movements
FOR SELECT TO authenticated USING(public.can_access_branch(branch_id));
REVOKE INSERT,UPDATE,DELETE ON public.inventory_movements FROM authenticated;
GRANT SELECT ON public.inventory_movements TO authenticated;

-- Restringe estoque por filial e impede escrita direta.
DROP POLICY IF EXISTS "members manage branch product stock" ON public.branch_product_stock;
DROP POLICY IF EXISTS "members view branch product stock" ON public.branch_product_stock;
CREATE POLICY "members view branch product stock" ON public.branch_product_stock
FOR SELECT TO authenticated USING(public.can_access_branch(branch_id));
REVOKE INSERT,UPDATE,DELETE ON public.branch_product_stock FROM authenticated;
GRANT SELECT ON public.branch_product_stock TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
