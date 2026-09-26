-- MeuCaixa initial Supabase schema
create extension if not exists "pgcrypto";

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'admin', 'manager', 'cashier', 'employee');

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'employee',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id);
create index branches_organization_idx on public.branches(organization_id);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.branches enable row level security;

create or replace function public.is_organization_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_organization_admin(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create policy "members can view their organizations"
on public.organizations for select
using (public.is_organization_member(id));

create policy "members can view organization membership"
on public.organization_members for select
using (user_id = auth.uid() or public.is_organization_member(organization_id));

create policy "admins can manage organization membership"
on public.organization_members for all
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

create policy "users can view their own profile"
on public.profiles for select
using (id = auth.uid());

create policy "users can update their own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can view branches"
on public.branches for select
using (public.is_organization_member(organization_id));

create policy "admins can manage branches"
on public.branches for all
using (public.is_organization_admin(organization_id))
with check (public.is_organization_admin(organization_id));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
