-- Corrige cadastro de produto para gravar o estoque inicial atomicamente no catálogo, saldo da filial e Kardex.
create or replace function public.create_product_with_stock(p_branch_id uuid,p_name text,p_sku text,p_barcode text,p_unit text,p_cost_price numeric,p_sale_price numeric,p_initial_stock numeric,p_minimum_stock numeric) returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid;v_id uuid;v_initial numeric:=coalesce(p_initial_stock,0);v_min numeric:=coalesce(p_minimum_stock,0);v_cost numeric:=coalesce(p_cost_price,0);
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select organization_id into v_org from public.branches where id=p_branch_id and active=true;
 if v_org is null or not public.can_access_branch(p_branch_id) then raise exception 'invalid_branch'; end if;
 if not public.can_manage_stock(v_org) then raise exception 'stock_permission_denied'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'product_name_required'; end if;
 if v_initial<0 then raise exception 'invalid_initial_stock'; end if;
 insert into public.products(organization_id,name,sku,barcode,unit,cost_price,sale_price,stock_quantity,minimum_stock)
 values(v_org,trim(p_name),nullif(trim(coalesce(p_sku,'')),''),nullif(trim(coalesce(p_barcode,'')),''),coalesce(nullif(trim(p_unit),''),'UN'),v_cost,coalesce(p_sale_price,0),v_initial,v_min) returning id into v_id;
 insert into public.branch_product_stock(organization_id,branch_id,product_id,stock_quantity,minimum_stock,average_cost) values(v_org,p_branch_id,v_id,v_initial,v_min,v_cost);
 if v_initial>0 then
  insert into public.inventory_movements(organization_id,branch_id,product_id,type,quantity,previous_quantity,new_quantity,notes,created_by,quantity_delta,unit_cost,balance_after,reason)
  values(v_org,p_branch_id,v_id,'entry',v_initial,0,v_initial,'Estoque inicial',auth.uid(),v_initial,v_cost,v_initial,'Estoque inicial do cadastro');
 end if;
 return v_id;
end $$;