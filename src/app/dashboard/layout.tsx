import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CircleHelp } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org } = await supabase.rpc("get_my_organization");
  if (!org?.length) redirect("/onboarding");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <img className="kumo-logo kumo-logo-sidebar" src="/kumo-logo.svg" alt="Kumo — Soluções em Tecnologia" />
          <span className="meucaixa-brand-name">MeuCaixa</span>
        </Link>

        <nav>
          <Link href="/dashboard">Visão geral</Link>
          <Link href="/dashboard/filiais">Matriz e filiais</Link>
          <Link href="/dashboard/vendas">Vendas / PDV</Link>
          <Link href="/dashboard/produtos">Produtos</Link>
          <Link href="/dashboard/estoque">Estoque</Link>
          <Link href="/dashboard/caixa">Caixa</Link>
          <Link href="/dashboard/financeiro">Financeiro</Link>
          <Link href="/dashboard/clientes">Clientes</Link>
          <Link href="/dashboard/fornecedores">Fornecedores</Link>
          <Link href="/dashboard/relatorios">Relatórios</Link>
          <Link href="/dashboard/configuracoes/comprovante">Configurações</Link>
        </nav>

        <div className="sidebar-tools">
          <Link href="/dashboard/ajuda"><CircleHelp size={15} /> Ajuda</Link>
        </div>

        <div className="sidebar-footer">
          <small>{org[0].organization_name}</small>
          <small>{org[0].branch_name} · {org[0].role}</small>
          <form action="/auth/signout" method="post">
            <button>Sair</button>
          </form>
        </div>
      </aside>

      <section className="main-content">{children}</section>
    </div>
  );
}
