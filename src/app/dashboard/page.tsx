import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StockAlertBanner from "@/components/StockAlertBanner";
import { ContextHelp } from "@/components/ContextHelp";

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v || 0);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: org } = await supabase.rpc("get_my_organization");
  if (!org?.length) redirect("/onboarding");

  const { data: branches } = await supabase.rpc("get_my_branches");
  const selectedBranchId = (await searchParams).branch;

  const visibleBranches = (branches ?? []) as Array<{
    branch_id: string;
    branch_name: string;
    branch_code: string;
    is_headquarters: boolean;
  }>;
  const role = String(org[0].role || "operator");
  const canSwitch = visibleBranches.length > 1 && (role === "owner" || role === "admin" || role === "manager");
  const requestedBranch = canSwitch ? selectedBranchId : visibleBranches[0]?.branch_id;

  const selected =
    visibleBranches.find((b) => b.branch_id === requestedBranch) ??
    null;

  const { data: summary } = await supabase.rpc("get_branch_dashboard_summary", {
    p_branch_id: selected?.branch_id ?? null,
  });

  const rows = (summary ?? []) as Array<{
    branch_id: string;
    branch_name: string;
    is_headquarters: boolean;
    sales_today: number;
    gross_profit_today: number;
    open_cash_count: number;
    stock_value: number;
    low_stock_count: number;
  }>;

  const totalSales = rows.reduce((n, r) => n + Number(r.sales_today), 0);
  const totalProfit = rows.reduce(
    (n, r) => n + Number(r.gross_profit_today),
    0
  );
  const totalLowStock = rows.reduce(
    (n, r) => n + Number(r.low_stock_count),
    0
  );
  const { data: stockAlerts } = await supabase.rpc("get_stock_alerts", { p_branch_id: selected?.branch_id ?? null });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">MEUCAIXA · VISÃO GERAL</span>
          <h1>{selected ? selected.branch_name : "Todas as lojas"}</h1>
          <p>
            {selected
              ? "Visão individual desta unidade."
              : "Visão consolidada de todas as unidades da empresa."}
          </p>
        </div>

        <ContextHelp title="Visão geral" description="Acompanhe vendas, margem, caixa e alertas de estoque da empresa ou da filial selecionada. Use o seletor de unidade para comparar operações sem misturar os dados." />

        {canSwitch && <div className="branch-switcher">
          <a
            className={!selected ? "branch-switcher-item active" : "branch-switcher-item"}
            href="/dashboard"
          >
            Todas as lojas
          </a>
          {visibleBranches.map((branch) => (
            <a
              key={branch.branch_id}
              className={
                selected?.branch_id === branch.branch_id
                  ? "branch-switcher-item active"
                  : "branch-switcher-item"
              }
              href={"/dashboard?branch=" + branch.branch_id}
            >
              {branch.is_headquarters ? "Matriz · " : ""}
              {branch.branch_name}
            </a>
          ))}
        </div>}
      </div>

      {stockAlerts?.length>0&&<StockAlertBanner alerts={stockAlerts} organizationId={org[0].organization_id} />}

      <div className="stats-row">
        <div className="stat-card">
          <small>Vendas hoje</small>
          <strong>{money(totalSales)}</strong>
        </div>
        <div className="stat-card">
          <small>Lucro bruto hoje</small>
          <strong>{money(totalProfit)}</strong>
        </div>
        <div className="stat-card">
          <small>Estoque baixo</small>
          <strong>{totalLowStock}</strong>
        </div>
        <div className="stat-card">
          <small>Unidades</small>
          <strong>{rows.length}</strong>
        </div>
      </div>

      <div className="panel">
        <div className="products-list-header">
          <div>
            <h2>{selected ? "Desempenho da unidade" : "Desempenho por unidade"}</h2>
            <p>
              O dono consegue comparar as operações sem precisar criar contas
              separadas.
            </p>
          </div>
        </div>

        <div className="branch-summary-grid">
          {rows.map((row) => (
            <a
              key={row.branch_id}
              href={"/dashboard?branch=" + row.branch_id}
              className="branch-summary-card"
            >
              <div className="branch-summary-title">
                <div>
                  <span className="eyebrow">
                    {row.is_headquarters ? "MATRIZ" : "FILIAL"}
                  </span>
                  <h3>{row.branch_name}</h3>
                </div>
                <span className={row.open_cash_count ? "status-dot open" : "status-dot"}>
                  {row.open_cash_count ? "Caixa aberto" : "Caixa fechado"}
                </span>
              </div>

              <div className="branch-summary-metrics">
                <div>
                  <small>Vendas hoje</small>
                  <strong>{money(Number(row.sales_today))}</strong>
                </div>
                <div>
                  <small>Lucro bruto</small>
                  <strong>{money(Number(row.gross_profit_today))}</strong>
                </div>
                <div>
                  <small>Estoque</small>
                  <strong>{money(Number(row.stock_value))}</strong>
                </div>
                <div>
                  <small>Estoque baixo</small>
                  <strong>{Number(row.low_stock_count)}</strong>
                </div>
              </div>
            </a>
          ))}

          {!rows.length && (
            <p>Nenhuma filial disponível para este usuário.</p>
          )}
        </div>
      </div>

    </div>
  );
}
