import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CircleHelp } from "lucide-react";
import { canAccessRoute } from "@/lib/rbac";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org } = await supabase.rpc("get_my_organization");
  if (!org?.length) redirect("/onboarding");

  const role = String(org[0].role || "operator");
  const navItems = [
    ["Visão geral", "/dashboard"],
    ["Vendas / PDV", "/dashboard/vendas"],
    ["Produtos", "/dashboard/produtos"],
    ["Estoque", "/dashboard/estoque"],
    ["Caixa", "/dashboard/caixa"],
    ["Financeiro", "/dashboard/financeiro"],
    ["Clientes", "/dashboard/clientes"],
    ["Fornecedores", "/dashboard/fornecedores"],
    ["Relatórios", "/dashboard/relatorios"],
    ["Configurações", "/dashboard/configuracoes"],
    ...((role === "owner" || role === "admin") ? [["Upgrade", "/dashboard/configuracoes/upgrade"] as const] : []),
  ] as const;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand">
          <img className="kumo-logo kumo-logo-sidebar" src="/kumo-logo.svg" alt="Kumo — Soluções em Tecnologia" />
          <span className="meucaixa-brand-name">MeuCaixa</span>
        </Link>

        <nav>
          {navItems.map(([label, href]) =>
            canAccessRoute(role, href) ? (
              <Link href={href} key={href}>{label}</Link>
            ) : null
          )}
        </nav>

        <div className="sidebar-tools">
          <Link href="/dashboard/ajuda"><CircleHelp size={15} /> Ajuda</Link>
          <a href="https://sistemakumo.com.br" target="_blank" rel="noreferrer">Kumo institucional ↗</a>
        </div>

        <div className="sidebar-footer">
          <small>{org[0].organization_name}</small>
          <small>{org[0].branch_name} · {role}</small>
          <form action="/auth/signout" method="post">
            <button>Sair</button>
          </form>
        </div>
      </aside>

      <section className="main-content">{children}</section>
    </div>
  );
}
