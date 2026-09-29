-- Atomic cash register and sale operations

create or replace function public.open_cash_register(
  p_branch_id uuid,
  p_opening_balance numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  register_id uuid;
begin
  select organization_id into org_id from public.branches
  where id = p_branch_id and active = true;

  if org_id is null or not public.is_organization_member(org_id) then
    raise exception 'invalid_branch';
  end if;

  if exists (
    select 1 from public.cash_registers
    where branch_id = p_branch_id and status = 'open'
  ) then
    raise exception 'cash_already_open';
  end if;

  insert into public.cash_registers(organization_id, branch_id, opened_by, opening_balance)
  values(org_id,p_branch_id,auth.uid(),greatest(coalesce(p_opening_balance,0),0))
  returning id into register_id;

  return register_id;
end;
$$;

grant execute on function public.open_cash_register(uuid,numeric) to authenticated;

create or replace function public.complete_sale(
  p_branch_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  register_id uuid;
  sale_id uuid;
  item jsonb;
  payment jsonb;
  product_row public.products%rowtype;
  subtotal numeric := 0;
  discount numeric := greatest(coalesce(p_discount,0),0);
  total numeric := 0;
  qty numeric;
  unit_price numeric;
  item_total numeric;
  payment_total numeric := 0;
begin
  select organization_id into org_id from public.branches
  where id = p_branch_id and active = true;

  if org_id is null or not public.is_organization_member(org_id) then raise exception 'invalid_branch'; end if;

  select id into register_id from public.cash_registers
  where branch_id=p_branch_id and status='open'
  order by opened_at desc limit 1;

  if register_id is null then raise exception 'cash_not_open'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'empty_sale'; end if;

  for item in select * from jsonb_array_elements(p_items) loop
    select * into product_row from public.products
    where id=(item->>'product_id')::uuid and organization_id=org_id and active=true
    for update;

    if not found then raise exception 'product_not_found'; end if;

    qty := (item->>'quantity')::numeric;
    if qty <= 0 then raise exception 'invalid_quantity'; end if;
    if product_row.stock_quantity < qty then raise exception 'insufficient_stock:%', product_row.name; end if;

    unit_price := product_row.sale_price;
    item_total := round(qty * unit_price,2);
    subtotal := subtotal + item_total;
  end loop;

  total := greatest(subtotal - discount, 0);

  for payment in select * from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    payment_total := payment_total + (payment->>'amount')::numeric;
  end loop;

  if abs(payment_total-total) > 0.01 then raise exception 'payment_total_mismatch'; end if;

  insert into public.sales(organization_id,branch_id,cash_register_id,user_id,subtotal,discount,total)
  values(org_id,p_branch_id,register_id,auth.uid(),subtotal,discount,total)
  returning id into sale_id;

  for item in select * from jsonb_array_elements(p_items) loop
    select * into product_row from public.products where id=(item->>'product_id')::uuid for update;
    qty := (item->>'quantity')::numeric;
    unit_price := product_row.sale_price;
    item_total := round(qty * unit_price,2);

    insert into public.sale_items(sale_id,product_id,product_name,quantity,unit_price,unit_cost,total)
    values(sale_id,product_row.id,product_row.name,qty,unit_price,product_row.cost_price,item_total);

    update public.products
    set stock_quantity=stock_quantity-qty, updated_at=now()
    where id=product_row.id;

    insert into public.inventory_movements(organization_id,branch_id,product_id,user_id,type,quantity,unit_cost,note)
    values(org_id,p_branch_id,product_row.id,auth.uid(),'sale',-qty,product_row.cost_price,'Venda '||sale_id::text);
  end loop;

  for payment in select * from jsonb_array_elements(p_payments) loop
    insert into public.sale_payments(sale_id,method,amount)
    values(sale_id,payment->>'method',(payment->>'amount')::numeric);
  end loop;

  insert into public.cash_movements(organization_id,cash_register_id,user_id,type,amount,description)
  values(org_id,register_id,auth.uid(),'sale',total,'Venda '||sale_id::text);

  return sale_id;
end;
$$;

grant execute on function public.complete_sale(uuid,jsonb,jsonb,numeric) to authenticated;

create or replace function public.get_cash_summary(p_branch_id uuid)
returns table (
  register_id uuid,
  status text,
  opening_balance numeric,
  total_sales numeric,
  cash_in numeric,
  cash_out numeric,
  expected_balance numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.status,
    r.opening_balance,
    coalesce(sum(case when cm.type='sale' then cm.amount else 0 end),0),
    coalesce(sum(case when cm.type in ('cash_in','supply') then cm.amount else 0 end),0),
    coalesce(sum(case when cm.type in ('cash_out','withdrawal') then cm.amount else 0 end),0),
    r.opening_balance
      + coalesce(sum(case when cm.type in ('sale','cash_in','supply') then cm.amount else 0 end),0)
      - coalesce(sum(case when cm.type in ('cash_out','withdrawal') then cm.amount else 0 end),0)
  from public.cash_registers r
  left join public.cash_movements cm on cm.cash_register_id=r.id
  where r.branch_id=p_branch_id and public.is_organization_member(r.organization_id)
  group by r.id;
$$;

grant execute on function public.get_cash_summary(uuid) to authenticated;
