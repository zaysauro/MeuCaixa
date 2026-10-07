"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileText, Printer, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { filtersToQuery, getReportRange, getTodayInput } from "@/lib/reports/filters";
import { loadReportBranches, loadReports, loadSalesExport } from "@/lib/reports/api";
import type { BranchOption, ReportFilters, ReportPeriod, ReportView } from "@/lib/reports/types";
import { ContextHelp } from "@/components/ContextHelp";
import { paymentMethodLabel } from "@/lib/presentation/labels";

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);

const numberBR = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value) || 0);

const percent = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(Number(value) || 0);

function variation(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return (current - previous) / Math.abs(previous);
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="report-kpi">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="report-section">
      <div className="report-section-header">
        <div>
          <h2>{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Empty({ children = "Sem dados no período." }: { children?: React.ReactNode }) {
  return <div className="report-empty">{children}</div>;
}

function SalesTab({ data, compare, page, onPageChange }: { data: any; compare: boolean; page: number; onPageChange: (page: number) => void }) {
  const revenueVariation = compare ? variation(data.summary.revenue, data.comparison.revenue) : null;
  const salesVariation = compare ? variation(data.summary.sales_count, data.comparison.sales_count) : null;

  return (
    <>
      <div className="report-kpi-grid">
        <Kpi label="Faturamento" value={money(data.summary.revenue)} detail={revenueVariation === null ? undefined : `${revenueVariation >= 0 ? "+" : ""}${percent(revenueVariation)} vs. período anterior`} />
        <Kpi label="Vendas concluídas" value={numberBR(data.summary.sales_count)} detail={salesVariation === null ? undefined : `${salesVariation >= 0 ? "+" : ""}${percent(salesVariation)} vs. período anterior`} />
        <Kpi label="Ticket médio" value={money(data.summary.average_ticket)} />
        <Kpi label="Descontos" value={money(data.summary.discount)} detail={data.summary.gross_before_discount ? `${percent(data.summary.discount / data.summary.gross_before_discount)} sobre o bruto` : undefined} />
        <Kpi label="Cancelamentos" value={numberBR(data.summary.cancelled_count)} detail={money(data.summary.cancelled_value)} />
      </div>

      <div className="report-chart-grid">
        <Section title="Evolução das vendas">
          {data.trend.length ? (
            <div className="report-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => `R$ ${numberBR(v)}`} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Line type="monotone" dataKey="revenue" name="Faturamento" stroke="#16803c" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
        </Section>

        <Section title="Formas de pagamento">
          {data.payment_breakdown.length ? (
            <div className="report-chart">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.payment_breakdown.map((x: any) => ({ ...x, label: paymentMethodLabel(x.method) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => `R$ ${numberBR(v)}`} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Bar dataKey="amount" name="Valor" fill="#16803c" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty />}
        </Section>
      </div>

      <Section title="Vendas do período">
        {data.rows.length ? (
          <>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr><th>Venda</th><th>Data</th><th>Filial</th><th>Cliente</th><th>Status</th><th>Total</th><th></th></tr>
                </thead>
                <tbody>
                  {data.rows.map((row: any) => (
                    <tr key={row.id}>
                      <td>#{String(row.sale_number).padStart(6, "0")}</td>
                      <td>{new Date(row.created_at).toLocaleString("pt-BR")}</td>
                      <td>{row.branch_name}</td>
                      <td>{row.customer_name || "Consumidor"}</td>
                      <td><span className={row.status === "cancelled" ? "report-status cancelled" : "report-status completed"}>{row.status === "cancelled" ? "Cancelada" : "Concluída"}</span></td>
                      <td>{money(row.total)}</td>
                      <td><a className="report-link" href={`/dashboard/vendas?receipt=${row.id}`}>Comprovante</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-pagination">
              <span>Página {page} · {numberBR(data.total_rows)} vendas encontradas</span>
              <div>
                <button className="button secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
                <button className="button secondary" disabled={page * 50 >= data.total_rows} onClick={() => onPageChange(page + 1)}>Próxima</button>
              </div>
            </div>
          </>
        ) : <Empty>Sem vendas no período.</Empty>}
      </Section>
    </>
  );
}

function ProductsTab({ data }: { data: any }) {
  const table = (rows: any[]) => (
    <div className="report-table-wrap">
      <table className="report-table">
        <thead><tr><th>Produto</th><th>Qtd.</th><th>Faturamento</th><th>Custo</th><th>Lucro</th><th>Margem</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.product_id}>
              <td>{row.product_name}</td>
              <td>{numberBR(row.quantity)} {row.unit}</td>
              <td>{money(row.revenue)}</td>
              <td>{row.quantity_without_cost > 0 ? "Sem custo" : money(row.known_cost)}</td>
              <td>{row.quantity_without_cost > 0 ? "—" : money(row.known_profit)}</td>
              <td>{row.margin === null ? "—" : percent(row.margin)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="report-kpi-grid">
        <Kpi label="Produtos ativos" value={numberBR(data.summary.active_products)} />
        <Kpi label="Produtos vendidos" value={numberBR(data.summary.products_sold)} />
        <Kpi label="Sem custo" value={numberBR(data.summary.products_without_cost)} detail={`${numberBR(data.summary.items_without_cost)} itens`} />
        <Kpi label="Estoque baixo" value={numberBR(data.summary.low_stock_count)} />
        <Kpi label="Estoque zerado" value={numberBR(data.summary.zero_stock_count)} />
      </div>

      <Section title="Mais vendidos por quantidade">{data.top_by_quantity.length ? table(data.top_by_quantity) : <Empty />}</Section>
      <Section title="Mais vendidos por faturamento">{data.top_by_revenue.length ? table(data.top_by_revenue) : <Empty />}</Section>

      <div className="report-two-columns">
        <Section title="Estoque baixo">
          {data.low_stock.length ? (
            <div className="report-list">{data.low_stock.map((x: any) => <div className="report-list-row" key={`${x.product_id}-${x.branch_name}`}><strong>{x.product_name}</strong><span>{x.branch_name} · {numberBR(x.stock_quantity)} / mín. {numberBR(x.minimum_stock)}</span></div>)}</div>
          ) : <Empty>Não há estoque abaixo do mínimo.</Empty>}
        </Section>
        <Section title="Estoque zerado">
          {data.zero_stock.length ? (
            <div className="report-list">{data.zero_stock.map((x: any) => <div className="report-list-row" key={`${x.product_id}-${x.branch_name}`}><strong>{x.product_name}</strong><span>{x.branch_name}</span></div>)}</div>
          ) : <Empty>Nenhum produto zerado.</Empty>}
        </Section>
      </div>

      <Section title="Produtos sem venda no período">
        {data.no_sales.length ? (
          <div className="report-list">{data.no_sales.map((x: any) => <div className="report-list-row" key={x.product_id}><strong>{x.product_name}</strong><span>{money(x.sale_price)} · estoque {numberBR(x.stock_quantity ?? 0)} {x.unit}</span></div>)}</div>
        ) : <Empty>Todos os produtos ativos tiveram venda no período.</Empty>}
      </Section>
    </>
  );
}

function CashTab({ data }: { data: any }) {
  return (
    <>
      <div className="report-kpi-grid">
        <Kpi label="Caixas" value={numberBR(data.summary.register_count)} />
        <Kpi label="Em andamento" value={numberBR(data.summary.open_count)} />
        <Kpi label="Sangrias" value={money(data.summary.cash_out_total)} />
        <Kpi label="Reforços" value={money(data.summary.cash_in_total)} />
        <Kpi label="Diferença de fechamento" value={money(data.summary.difference_total)} />
      </div>

      <Section title="Caixas do período">
        {data.registers.length ? (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>Filial</th><th>Operador</th><th>Abertura</th><th>Fechamento</th><th>Status</th><th>Diferença</th><th></th></tr></thead>
              <tbody>
                {data.registers.map((x: any) => (
                  <tr key={x.register_id}>
                    <td>{x.branch_name}</td>
                    <td>{x.opened_by_name || "—"}</td>
                    <td>{new Date(x.opened_at).toLocaleString("pt-BR")}</td>
                    <td>{x.closed_at ? new Date(x.closed_at).toLocaleString("pt-BR") : "—"}</td>
                    <td><span className={x.status === "open" ? "report-status open" : "report-status completed"}>{x.status === "open" ? "Em andamento" : "Fechado"}</span></td>
                    <td className={Number(x.difference) !== 0 ? "report-attention" : ""}>{x.difference === null ? "—" : money(x.difference)}</td>
                    <td><a className="report-link" href={`/dashboard/caixa?register=${x.register_id}`}>Detalhes</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>Não há caixas no período.</Empty>}
      </Section>

      <Section title="Resumo por operador">
        {data.operator_summary.length ? (
          <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Operador</th><th>Caixas</th><th>Diferença</th><th>Sangrias</th></tr></thead><tbody>{data.operator_summary.map((x: any) => <tr key={x.operator_name}><td>{x.operator_name}</td><td>{x.register_count}</td><td>{money(x.difference_total)}</td><td>{money(x.cash_out_total)}</td></tr>)}</tbody></table></div>
        ) : <Empty />}
      </Section>
    </>
  );
}

function BranchesTab({ data }: { data: any }) {
  return (
    <>
      <div className="report-kpi-grid">
        <Kpi label="Faturamento consolidado" value={money(data.total.revenue)} />
        <Kpi label="Vendas" value={numberBR(data.total.sales_count)} />
        <Kpi label="Descontos" value={money(data.total.discount)} />
        <Kpi label="Cancelamentos" value={numberBR(data.total.cancelled_count)} />
        <Kpi label="Diferença de caixa" value={money(data.total.cash_difference)} />
      </div>
      <Section title="Operação por filial">
        {data.rows.length ? (
          <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Filial</th><th>Faturamento</th><th>Participação</th><th>Vendas</th><th>Ticket</th><th>Descontos</th><th>Cancelamentos</th><th>Caixa</th><th>Estoque baixo</th></tr></thead><tbody>{data.rows.map((x: any) => <tr key={x.branch_id}><td><strong>{x.is_headquarters ? "Matriz · " : ""}{x.branch_name}</strong></td><td>{money(x.revenue)}</td><td>{percent(x.participation)}</td><td>{numberBR(x.sales_count)}</td><td>{money(x.average_ticket)}</td><td>{money(x.discount)}</td><td>{numberBR(x.cancelled_count)}</td><td>{money(x.cash_difference)}</td><td>{numberBR(x.low_stock_count)}</td></tr>)}</tbody></table></div>
        ) : <Empty />}
      </Section>
    </>
  );
}

function FinanceTab({ data }: { data: any }) {
  const competenceBalance = Number(data.competence.income) - Number(data.competence.expense);
  const cashBalance = Number(data.cash.income) - Number(data.cash.expense);
  return (
    <>
          <div className="report-info-banner"><strong>Financeiro administrativo</strong><span>Competência usa o lançamento. Controle de Caixa usa a data de pagamento. Vendas não são duplicadas como receita administrativa.</span></div>
      <div className="report-kpi-grid">
        <Kpi label="Receitas · competência" value={money(data.competence.income)} />
        <Kpi label="Despesas · competência" value={money(data.competence.expense)} />
        <Kpi label="Saldo · competência" value={money(competenceBalance)} />
        <Kpi label="Entradas · caixa" value={money(data.cash.income)} />
        <Kpi label="Saídas · caixa" value={money(data.cash.expense)} />
        <Kpi label="Saldo · caixa" value={money(cashBalance)} />
      </div>
      <div className="report-two-columns">
        <Section title="Contas em aberto"><div className="report-list"><div className="report-list-row"><strong>A pagar</strong><span>{money(data.open_payables)}</span></div><div className="report-list-row"><strong>A receber</strong><span>{money(data.open_receivables)}</span></div><div className="report-list-row"><strong>Vencidas a pagar</strong><span>{money(data.overdue_payables)}</span></div><div className="report-list-row"><strong>Vencidas a receber</strong><span>{money(data.overdue_receivables)}</span></div></div></Section>
        <Section title="Despesas e receitas por categoria">{data.categories.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Categoria</th><th>Receitas</th><th>Despesas</th></tr></thead><tbody>{data.categories.map((x: any) => <tr key={x.category}><td>{x.category}</td><td>{money(x.income)}</td><td>{money(x.expense)}</td></tr>)}</tbody></table></div> : <Empty />}</Section>
      </div>
    </>
  );
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportRows(rows: Array<Record<string, unknown>>, filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = "\uFEFF" + [headers, ...rows.map((row) => headers.map((h) => row[h]))]
    .map((line) => line.map(csvEscape).join(";"))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("vendas");
  const [salesPage, setSalesPage] = useState(1);

  const period = (searchParams.get("period") as ReportPeriod) || "month";
  const branchParam = searchParams.get("branch") || "all";
  const view = ((searchParams.get("view") as ReportView) || "consolidated");
  const compare = searchParams.get("compare") !== "0";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const filters: ReportFilters = {
    period: ["today", "yesterday", "week", "month", "previous_month", "custom"].includes(period) ? period : "month",
    branchId: branchParam === "all" ? null : branchParam,
    view: view === "individual" ? "individual" : "consolidated",
    compare,
    from,
    to,
  };

  const range = useMemo(() => {
    try { return getReportRange(filters); } catch { return null; }
  }, [filters.period, filters.from, filters.to]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [orgResult, branchRows] = await Promise.all([
          createClient().rpc("get_my_organization"),
          loadReportBranches(),
        ]);
        if (!active) return;
        const org = orgResult.data?.[0];
        if (!org) throw new Error("Empresa não encontrada.");
        setOrganizationId(org.organization_id);
        setBranches(branchRows);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Não foi possível carregar as filiais.");
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setSalesPage(1);
  }, [filters.branchId, filters.period, filters.from, filters.to, compare]);

  useEffect(() => {
    if (!organizationId || !range) return;
    let active = true;
    setLoading(true);
    setError("");
    loadReports({ organizationId, branchId: filters.branchId, range, compare, page: salesPage })
      .then((result) => { if (active) setData(result); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Erro ao carregar relatórios."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, filters.branchId, filters.period, filters.from, filters.to, compare, range?.start, range?.end, salesPage]);

  const setFilter = (patch: Partial<ReportFilters>) => {
    const next = { ...filters, ...patch };
    router.push(`/dashboard/relatorios?${filtersToQuery(next)}`);
  };

  const selectedBranch = branches.find((b) => b.branch_id === filters.branchId);

  const [exporting, setExporting] = useState(false);

  const exportCurrent = async () => {
    if (!data || !range || !organizationId) return;
    setExporting(true);
    try {
    if (tab === "vendas") {
      const rows = await loadSalesExport({
        organizationId,
        branchId: filters.branchId,
        range,
      });
      exportRows(
        rows.map((x: any) => ({
          Venda: `#${String(x.sale_number).padStart(6, "0")}`,
          Data: new Date(x.created_at).toLocaleString("pt-BR"),
          Filial: x.branch_name,
          Cliente: x.customer_name || "Consumidor",
          Status: x.status === "cancelled" ? "Cancelada" : "Concluída",
          Total: Number(x.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        })),
        "meucaixa-vendas.csv"
      );
    } else if (tab === "produtos") {
      exportRows(data.products.top_by_revenue.map((x: any) => ({
        Produto: x.product_name,
        Quantidade: x.quantity,
        Faturamento: Number(x.revenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        Custo: x.quantity_without_cost > 0 ? "Sem custo" : Number(x.known_cost).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        Lucro: x.quantity_without_cost > 0 ? "" : Number(x.known_profit).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        Margem: x.margin === null ? "" : percent(x.margin),
      })), "meucaixa-produtos.csv");
    } else if (tab === "caixa") {
      exportRows(data.cash.registers.map((x: any) => ({
        Filial: x.branch_name,
        Operador: x.opened_by_name || "",
        Abertura: new Date(x.opened_at).toLocaleString("pt-BR"),
        Fechamento: x.closed_at ? new Date(x.closed_at).toLocaleString("pt-BR") : "",
        Status: x.status === "open" ? "Em andamento" : "Fechado",
        Diferenca: x.difference ?? "",
      })), "meucaixa-caixa.csv");
    } else if (tab === "filiais") {
      exportRows(data.branches.rows.map((x: any) => ({
        Filial: x.branch_name,
        Faturamento: Number(x.revenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        Participacao: percent(x.participation),
        Vendas: x.sales_count,
        Ticket: Number(x.average_ticket).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        Descontos: Number(x.discount).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      })), "meucaixa-filiais.csv");
    } else {
      exportRows(data.finance.categories.map((x: any) => ({
        Categoria: x.category,
        Receitas: Number(x.income).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
        Despesas: Number(x.expense).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      })), "meucaixa-financeiro.csv");
    }
    } finally {
      setExporting(false);
    }
  };

  if (range === null) {
    return <div className="page"><div className="error">Período personalizado inválido. A data final deve ser igual ou posterior à inicial.</div></div>;
  }

  return (
    <div className="page reports-page">
      <div className="page-header reports-header">
        <div>
          <span className="eyebrow">MEUCAIXA · GESTÃO</span>
          <h1>Relatórios</h1>
          <p>Vendas, produtos, caixa, filiais e financeiro em uma única visão operacional.</p>
        </div>
        <div className="report-actions">
          <ContextHelp title="Relatórios" description="Filtre o período, filial e visão para acompanhar vendas, produtos, caixa e financeiro. Os dados respeitam as filiais que seu perfil pode acessar." />
          <button className="button secondary" onClick={exportCurrent} disabled={!data || exporting}><Download size={15} /> {exporting ? "Exportando..." : "CSV"}</button>
          <button className="button secondary" onClick={() => window.print()}><Printer size={15} /> Imprimir / PDF</button>
          <button className="button secondary" onClick={() => window.location.reload()}><RefreshCw size={15} /> Atualizar</button>
        </div>
      </div>

      <div className="report-filter-bar">
        <label><span>Período</span><select value={filters.period} onChange={(e) => {
  const nextPeriod = e.target.value as ReportPeriod;
  if (nextPeriod === "custom") {
    const today = getTodayInput();
    setFilter({ period: nextPeriod, from: from || today, to: to || today });
  } else {
    setFilter({ period: nextPeriod });
  }
}}>
          <option value="today">Hoje</option>
          <option value="yesterday">Ontem</option>
          <option value="week">Semana atual</option>
          <option value="month">Mês atual</option>
          <option value="previous_month">Mês anterior</option>
          <option value="custom">Personalizado</option>
        </select></label>
        {filters.period === "custom" && <>
          <label><span>De</span><input type="date" value={from} max={to || undefined} onChange={(e) => setFilter({ from: e.target.value })} /></label>
          <label><span>Até</span><input type="date" value={to} min={from || undefined} onChange={(e) => setFilter({ to: e.target.value })} /></label>
        </>}
        <label><span>Filial</span><select value={filters.branchId ?? "all"} onChange={(e) => setFilter({ branchId: e.target.value === "all" ? null : e.target.value, view: e.target.value === "all" ? "consolidated" : filters.view })}>
          <option value="all">Todas as filiais</option>
          {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.is_headquarters ? "Matriz · " : ""}{b.branch_name}</option>)}
        </select></label>
        <label><span>Visão</span><select value={filters.view} disabled={!filters.branchId} onChange={(e) => setFilter({ view: e.target.value as ReportView })}>
          <option value="consolidated">Consolidado</option>
          <option value="individual">Individual</option>
        </select></label>
        <label className="report-check"><input type="checkbox" checked={compare} onChange={(e) => setFilter({ compare: e.target.checked })} /><span>Comparar período anterior</span></label>
      </div>

      <div className="report-filter-meta"><FileText size={14} /> {range.label} · America/Sao_Paulo {selectedBranch ? `· ${selectedBranch.branch_name}` : "· todas as filiais autorizadas"}</div>

      <div className="report-tabs">
        {[
          ["vendas", "Vendas"],
          ["produtos", "Produtos"],
          ["caixa", "Caixa"],
          ["filiais", "Filiais"],
          ["financeiro", "Financeiro"],
        ].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div className="report-loading"><RefreshCw size={18} /> Carregando dados agregados...</div>}

      {!loading && data && (
        <>
          {tab === "vendas" && <SalesTab data={data.sales} compare={compare} page={salesPage} onPageChange={setSalesPage} />}
          {tab === "produtos" && <ProductsTab data={data.products} />}
          {tab === "caixa" && <CashTab data={data.cash} />}
          {tab === "filiais" && <BranchesTab data={data.branches} />}
          {tab === "financeiro" && <FinanceTab data={data.finance} />}
        </>
      )}
    </div>
  );
}
