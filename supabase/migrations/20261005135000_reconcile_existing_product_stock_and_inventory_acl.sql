-- Concilia produtos antigos cadastrados antes da unificação e fecha RPCs de inventário para anon.
BEGIN;
WITH targets AS (
 SELECT ps.id AS stock_id,ps.organization_id,ps.branch_id,ps.product_id,p.stock_quantity,p.cost_price
 FROM public.branch_product_stock ps JOIN public.products p ON p.id=ps.product_id
 WHERE p.active=true AND p.stock_quantity>0 AND ps.stock_quantity=0
   AND (SELECT count(*) FROM public.branch_product_stock x WHERE x.product_id=p.id)=1
)
INSERT INTO public.inventory_movements(organization_id,branch_id,product_id,type,quantity,previous_quantity,new_quantity,notes,quantity_delta,unit_cost,balance_after,reason)
SELECT organization_id,branch_id,product_id,'entry',stock_quantity,0,stock_quantity,'Saldo inicial conciliado do cadastro de produtos',stock_quantity,cost_price,stock_quantity,'Conciliação Produtos → Estoque' FROM targets;

UPDATE public.branch_product_stock ps SET stock_quantity=p.stock_quantity,minimum_stock=p.minimum_stock,average_cost=CASE WHEN ps.average_cost=0 THEN p.cost_price ELSE ps.average_cost END,updated_at=now()
FROM public.products p WHERE p.id=ps.product_id AND p.active=true AND p.stock_quantity>0 AND ps.stock_quantity=0
AND (SELECT count(*) FROM public.branch_product_stock x WHERE x.product_id=p.id)=1;

REVOKE EXECUTE ON FUNCTION public.start_stock_inventory(uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.save_stock_inventory_count(uuid,uuid,numeric) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.close_stock_inventory(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_stock_inventory(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_stock_inventory_count(uuid,uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_stock_inventory(uuid) TO authenticated;
COMMIT;
