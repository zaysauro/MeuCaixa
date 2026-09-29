-- MeuCaixa core commerce and finance schema

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  sku text,
  barcode text,
  name text not null,
  description text,
  unit text not null default 'UN',
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  stock_quantity numeric(14,3) not null default 0,
  minimum_stock numeric(14,3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  document text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  document text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('purchase','sale','adjustment','loss','return','initial')),
  quantity numeric(14,3) not null,
  unit_cost numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  opening_balance numeric(12,2) not null default 0,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  closing_balance numeric(12,2),
  status text not null default 'open' check (status in ('open','closed'))
);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cash_register_id uuid not null references public.cash_registers(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('sale','cash_in','cash_out','withdrawal','supply','adjustment')),
  amount numeric(12,2) not null check (amount > 0),
  description text,
  created_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  cash_register_id uuid references public.cash_registers(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'completed' check (status in ('completed','cancelled')),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null default 0,
  total numeric(12,2) not null
);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('cash','pix','credit_card','debit_card','other')),
  amount numeric(12,2) not null check (amount > 0)
);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('income','expense')),
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index products_org_idx on public.products(organization_id);
create index products_barcode_idx on public.products(organization_id, barcode);
create index inventory_org_idx on public.inventory_movements(organization_id);
create index sales_org_date_idx on public.sales(organization_id, created_at);
create index financial_org_date_idx on public.financial_transactions(organization_id, created_at);

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.cash_registers enable row level security;
alter table public.cash_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.financial_transactions enable row level security;

create policy "members manage categories" on public.product_categories for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage products" on public.products for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage customers" on public.customers for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage suppliers" on public.suppliers for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage inventory" on public.inventory_movements for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage registers" on public.cash_registers for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage cash movements" on public.cash_movements for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members manage sales" on public.sales for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));
create policy "members view sale items" on public.sale_items for all using (exists (select 1 from public.sales s where s.id = sale_id and public.is_organization_member(s.organization_id))) with check (exists (select 1 from public.sales s where s.id = sale_id and public.is_organization_member(s.organization_id)));
create policy "members view sale payments" on public.sale_payments for all using (exists (select 1 from public.sales s where s.id = sale_id and public.is_organization_member(s.organization_id))) with check (exists (select 1 from public.sales s where s.id = sale_id and public.is_organization_member(s.organization_id)));
create policy "members manage financial transactions" on public.financial_transactions for all using (public.is_organization_member(organization_id)) with check (public.is_organization_member(organization_id));

create or replace function public.create_organization(
  organization_name text,
  branch_name text default 'Matriz'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org uuid;
  new_branch uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if trim(organization_name) = '' then raise exception 'organization_name_required'; end if;

  insert into public.organizations (name, slug)
  values (
    trim(organization_name),
    regexp_replace(lower(trim(organization_name)), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 8)
  )
  returning id into new_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org, auth.uid(), 'owner');

  insert into public.branches (organization_id, name, code)
  values (new_org, coalesce(nullif(trim(branch_name), ''), 'Matriz'), '001')
  returning id into new_branch;

  return new_org;
end;
$$;

grant execute on function public.create_organization(text,text) to authenticated;

create or replace function public.get_my_organization()
returns table (organization_id uuid, organization_name text, branch_id uuid, branch_name text, role public.member_role)
language sql
stable
security definer
set search_path = public
as $$
  select om.organization_id, o.name, b.id, b.name, om.role
  from public.organization_members om
  join public.organizations o on o.id = om.organization_id
  left join lateral (
    select id, name from public.branches where organization_id = om.organization_id and active = true order by created_at limit 1
  ) b on true
  where om.user_id = auth.uid()
  order by om.created_at
  limit 1;
$$;

grant execute on function public.get_my_organization() to authenticated;
