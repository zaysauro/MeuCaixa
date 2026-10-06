"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { closeCashRegister, getCashHistory } from "@/lib/cash/closing";
import { getCurrentCash, openCashRegister } from "@/lib/cash/cash";
import { getCashMovements, registerCashMovement } from "@/lib/cash/movements";
import type { CashHistoryItem, CashMovement, CashSummary } from "@/lib/cash/types";
import { ContextHelp } from "@/components/ContextHelp";
import { formatBRL, parseBRLMoneyInput } from "@/lib/money";
import { listEmployees, type Employee } from "@/lib/employees";

const money = (value: number) => formatBRL(value);
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "—";
const movementLabels: Record<string, string> = { cash_in: "Entrada", supply: "Reforço", cash_out: "Saída", withdrawal: "Sangria", adjustment: "Ajuste", sale: "Venda", sale_reversal: "Estorno" };
type Branch = { organization_id: string; branch_id: string; branch_name: string };

export default function CaixaPage() {
  const supabase = createClient();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [history, setHistory] = useState<CashHistoryItem[]>([]);
  const [opening, setOpening] = useState("0");
  const [counted, setCounted] = useState("");
  const [observation, setObservation] = useState("");
  const [movementType, setMovementType] = useState("cash_out");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDescription, setMovementDescription] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"" | "open" | "closed">("");
  const [historyStart, setHistoryStart] = useState("");
  const [historyEnd, setHistoryEnd] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadHistory(branchId?: string) {
    try { setHistory(await getCashHistory({ branchId: branchId ?? null, status: historyStatus || null, startDate: historyStart || null, endDate: historyEnd || null })); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar o histórico do caixa."); }
  }
  async function load() {
    setLoading(true); setError("");
    const { data, error: orgError } = await supabase.rpc("get_my_organization");
    const currentBranch = data?.[0] as Branch | undefined;
    if (orgError || !currentBranch) { setError(orgError?.message || "Empresa não configurada."); setLoading(false); return; }
    setBranch(currentBranch);
    try { const [current, availableEmployees] = await Promise.all([getCurrentCash(currentBranch.branch_id), listEmployees(currentBranch.organization_id)]); setEmployees(availableEmployees.filter((employee) => employee.active)); setSummary(current); setSelectedEmployeeId(current?.employeeId ?? ""); setMovements(current ? await getCashMovements(current.registerId) : []); await loadHistory(currentBranch.branch_id); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar o caixa."); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (branch) void loadHistory(branch.branch_id); }, [historyStatus, historyStart, historyEnd]);
  async function run(action: () => Promise<void>, success: string) { setBusy(true); setError(""); setMessage(""); try { await action(); setMessage(success); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir a operação."); } finally { setBusy(false); } }
  function open() { if (!branch) return; const amount = opening.trim() ? parseBRLMoneyInput(opening) : 0; if (amount === null || amount < 0) { setError("Informe um saldo inicial válido."); return; } return run(async () => { await openCashRegister(branch.branch_id, amount, selectedEmployeeId || null); }, "Caixa aberto com sucesso."); }
  function addMovement() { if (!summary) return; const amount = parseBRLMoneyInput(movementAmount); if (amount === null || amount <= 0) { setError("Informe um valor de movimentação maior que zero."); return; } const type = movementType as "cash_in" | "cash_out" | "withdrawal" | "supply" | "adjustment"; return run(async () => { await registerCashMovement({ cashRegisterId: summary.registerId, type, amount, description: movementDescription }); setMovementAmount(""); setMovementDescription(""); }, "Movimentação registrada."); }
  function close() { if (!summary) return; const amount = parseBRLMoneyInput(counted); if (amount === null || amount < 0) { setError("Informe um valor contado válido."); return; } return run(async () => { await closeCashRegister(summary.registerId, amount, observation); setCounted(""); setObservation(""); }, "Caixa fechado com sucesso."); }
  if (loading) return <div className="page"><div className="report-loading"><RefreshCw size={18} /> Carregando caixa...</div></div>;
  return <div className="page">
    <div className="page-header"><div><span className="eyebrow">OPERAÇÃO</span><h1>Caixa</h1><p>Abra, acompanhe e feche o caixa da unidade {branch?.branch_name}.</p></div><div className="actions"><ContextHelp title="Operação de caixa" description="Abra o caixa com o saldo inicial, registre entradas e saídas e feche conferindo o valor contado. O histórico preserva cada fechamento para consulta."/><button className="button secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={15} /> Atualizar</button></div></div>
    {error && <div className="error">{error}</div>}{message && <div className="success">{message}</div>}
    {!summary ? <div className="panel"><h2><WalletCards size={19} /> Abrir caixa</h2><p>Informe o dinheiro disponível no início do expediente.</p><div className="form-grid"><label>Saldo inicial<input className="field" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="Saldo inicial" /></label><label>Operador (opcional)<select className="field" value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}><option value="">Não informado</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.title}</option>)}</select></label></div><button className="button primary" onClick={() => void open()} disabled={busy}>Abrir caixa</button></div> : <>
      <div className="panel"><strong>Caixa aberto</strong><p>Operador: {summary.employeeName ? `${summary.employeeName} · ${summary.employeeTitle}` : "Não informado"}</p></div>
      <div className="stats-row"><div className="stat-card"><small>Status</small><strong>Aberto</strong></div><div className="stat-card"><small>Vendas em dinheiro</small><strong>{money(summary.cashSales)}</strong></div><div className="stat-card"><small>Entradas</small><strong>{money(summary.cashEntries)}</strong></div><div className="stat-card"><small>Saídas</small><strong>{money(summary.cashWithdrawals)}</strong></div><div className="stat-card"><small>Saldo esperado</small><strong>{money(summary.expectedBalance)}</strong></div></div>
      <div className="two-column-panels"><div className="panel"><h2><ArrowUpFromLine size={19} /> Registrar movimentação</h2><div className="form-grid"><label>Tipo<select className="field" value={movementType} onChange={(e) => setMovementType(e.target.value)}><option value="cash_out">Saída</option><option value="withdrawal">Sangria</option><option value="cash_in">Entrada</option><option value="supply">Reforço</option><option value="adjustment">Ajuste</option></select></label><label>Valor<input className="field" inputMode="decimal" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} /></label><label>Descrição<input className="field" value={movementDescription} onChange={(e) => setMovementDescription(e.target.value)} placeholder="Ex.: pagamento de fornecedor" /></label></div><button className="button primary" onClick={() => void addMovement()} disabled={busy}>Registrar</button></div><div className="panel"><h2><ArrowDownToLine size={19} /> Fechar caixa</h2><p>Esperado: <strong>{money(summary.expectedBalance)}</strong>. Informe a contagem física.</p><div className="form-grid"><label>Valor contado<input className="field" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} /></label><label>Observação<input className="field" value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Obrigatória se houver diferença" /></label></div><button className="button danger" onClick={() => void close()} disabled={busy || !counted}>Fechar caixa</button></div></div>
      <div className="panel"><h2>Movimentações do caixa</h2>{movements.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>{movements.map((item) => <tr key={item.movement_id}><td>{dateTime(item.created_at)}</td><td>{movementLabels[item.type] ?? item.type}</td><td>{item.description || "—"}</td><td className={item.direction === -1 ? "report-attention" : ""}>{item.direction === -1 ? "−" : "+"}{money(item.amount)}</td></tr>)}</tbody></table></div> : <p>As vendas e movimentações aparecerão aqui.</p>}</div>
    </>}
    <div className="panel"><div className="report-section-header"><h2>Histórico de caixas</h2><div className="inline-form"><select className="field" value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value as "" | "open" | "closed")}><option value="">Todos</option><option value="open">Abertos</option><option value="closed">Fechados</option></select><input className="field" type="date" value={historyStart} onChange={(e) => setHistoryStart(e.target.value)} /><input className="field" type="date" value={historyEnd} onChange={(e) => setHistoryEnd(e.target.value)} /></div></div>{history.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Filial</th><th>Operador</th><th>Abertura</th><th>Fechamento</th><th>Status</th><th>Esperado</th><th>Contado</th><th>Diferença</th></tr></thead><tbody>{history.map((item) => <tr key={item.register_id}><td>{item.branch_name}</td><td>{item.employee_name || "Não informado"}</td><td>{dateTime(item.opened_at)}</td><td>{dateTime(item.closed_at)}</td><td>{item.status === "open" ? "Aberto" : "Fechado"}</td><td>{money(item.expected_balance ?? 0)}</td><td>{item.counted_balance === null ? "—" : money(item.counted_balance)}</td><td className={Number(item.difference) !== 0 ? "report-attention" : ""}>{item.difference === null ? "—" : money(item.difference)}</td></tr>)}</tbody></table></div> : <p>Nenhum caixa encontrado com os filtros atuais.</p>}</div>
  </div>;
}
