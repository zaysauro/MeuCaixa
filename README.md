# MeuCaixa

Sistema web de fluxo de caixa, vendas, estoque e gestão para pequenos negócios.

## Stack

- Next.js 15 + TypeScript
- Supabase Auth + PostgreSQL + RLS
- Vercel
- Tailwind será incorporado conforme os módulos de interface evoluírem

## Modelo

O MeuCaixa nasce como SaaS multiempresa. Os dados operacionais serão vinculados a `organization_id`, e o acesso será protegido por Row Level Security no Supabase.

### Perfis

- owner
- admin
- manager
- cashier
- employee

## Módulos planejados

1. Dashboard
2. Caixa
3. PDV / vendas
4. Produtos
5. Estoque
6. Clientes
7. Fornecedores
8. Financeiro
9. Contas a pagar/receber
10. Relatórios
11. Configurações

## Desenvolvimento

1. Crie um projeto no Supabase.
2. Execute `supabase/migrations/0001_initial_schema.sql` no SQL Editor.
3. Copie `.env.example` para `.env.local`.
4. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Instale as dependências com `npm install`.
6. Rode `npm run dev`.

## Deploy

O projeto foi estruturado para deploy na Vercel. Configure as mesmas variáveis do Supabase no projeto da Vercel.

> A criação automática da organização no cadastro será implementada no próximo ciclo junto com o onboarding inicial.
