-- Financeiro gerencial integrado ao PDV
-- Mantém caixa (realizado) separado de resultado por competência.
-- Aplicada no Supabase MeuCaixa em 2026-10-04.

alter table public.finance_entries add column if not exists competence_date date;
update public.finance_entries set competence_date=coalesce(competence_date,due_date,created_at::date) where competence_date is null;
alter table public.finance_entries alter column competence_date set default current_date;
alter table public.finance_categories add column if not exists statement_group text;
update public.finance_categories set statement_group=case when kind='income' then 'other_income' else 'operating_expense' end where statement_group is null;
create index if not exists finance_entries_competence_idx on public.finance_entries(organization_id,branch_id,competence_date);

-- RPCs finance_create_entry, get_finance_monthly_statement e
-- get_finance_branch_performance são definidos na migration aplicada no projeto.
-- A definição canônica pode ser obtida do banco com pg_get_functiondef().
