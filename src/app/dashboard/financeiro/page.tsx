"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Download, Plus, RefreshCw, Search, Wallet, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Tab = "overview"|"payables"|"receivables"|"new"|"recurring"|"categories"|"accounts";
type Mode = "realized"|"projected";
type Branch = { branch_id:string; branch_name:string };
type Person = { id:string; name:string };
type Entry = { id:string; entry_type:"payable"|"receivable"; description:string; amount:number; due_date:string|null; status:string; origin_type:string; branch_id?:string|null; category_id?:string|null; supplier_id?:string|null; customer_id?:string|null };
type Account = { id:string; name:string; kind:string; opening_balance:number; opening_balance_date:string };
type Category = { id:string; name:string; kind:string };
type Recurring = { id:string; description:string; amount:number; frequency:string; next_due_date:string; entry_type:string; active:boolean; branch_id:string|null };
type FlowRow = { day:string; sales:number; settlements:number; projected_receipts:number; projected_payables:number; net:number; accumulated_balance?:number };
type Statement = { sales:number;cogs:number;gross_profit:number;other_income:number;operating_expenses:number;taxes:number;payroll:number;occupancy:number;utilities:number;marketing:number;financial_expenses:number;other_expenses:number;net_result:number;net_margin:number;health:"healthy"|"red"|"neutral";open_payable:number;open_receivable:number;cash_balance:number;projected_balance:number;previous_result:number;result_change:number };
type BranchPerformance = { branch_id:string;branch_name:string;is_headquarters:boolean;sales:number;cogs:number;expenses:number;net_result:number };

const brl=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n||0);
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());
const firstDay=()=>today().slice(0,8)+"01";
const labels:Record<string,string>={open:"Aberta",partial:"Parcial",paid:"Paga",received:"Recebida",overdue:"Vencida",cancelled:"Cancelada"};
const originLabels:Record<string,string>={manual:"Manual",purchase:"Compra",sale_credit:"Venda a prazo",recurrence:"Recorrência",other_income:"Outra receita",other_expense:"Outra despesa",legacy:"Legado"};

export default function FinanceiroPage(){
  const supabase=createClient();
  const [org,setOrg]=useState("");
  const [branches,setBranches]=useState<Branch[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [suppliers,setSuppliers]=useState<Person[]>([]);
  const [customers,setCustomers]=useState<Person[]>([]);
  const [recurring,setRecurring]=useState<Recurring[]>([]);
  const [flow,setFlow]=useState<FlowRow[]>([]);
  const [totals,setTotals]=useState<Record<string,number>>({});
  const [summary,setSummary]=useState<Record<string,number>>({});
  const [statement,setStatement]=useState<Statement|null>(null);
  const [branchPerformance,setBranchPerformance]=useState<BranchPerformance[]>([]);
  const [tab,setTab]=useState<Tab>("overview");
  const [mode,setMode]=useState<Mode>("realized");
  const [branch,setBranch]=useState("");
  const [start,setStart]=useState(firstDay());
  const [end,setEnd]=useState(today());
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("all");
  const [originFilter,setOriginFilter]=useState("all");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [error,setError]=useState("");
  const [settle,setSettle]=useState<Entry|null>(null);
  const [settleAmount,setSettleAmount]=useState("");
  const [settleInterest,setSettleInterest]=useState("0");
  const [settleFine,setSettleFine]=useState("0");
  const [settleDiscount,setSettleDiscount]=useState("0");
  const [settleMethod,setSettleMethod]=useState("pix");
  const [settleAccount,setSettleAccount]=useState("");
  const [showNewCategory,setShowNewCategory]=useState(false);
  const [showRecurring,setShowRecurring]=useState(false);

  async function load(id=org){
    if(!id)return;
    setError(""); setMsg("");
    await supabase.rpc("finance_refresh_overdue",{p_organization_id:id,p_branch_id:branch||null});
    const [b,c,a,e,f,s,sp,cu,r,st,bp]=await Promise.all([
      supabase.rpc("get_my_branches"),
      supabase.from("finance_categories").select("id,name,kind").eq("organization_id",id).eq("active",true).order("name"),
      supabase.from("financial_accounts").select("id,name,kind,opening_balance,opening_balance_date").eq("organization_id",id).eq("active",true).order("name"),
      supabase.from("finance_entries").select("id,entry_type,description,amount,due_date,status,origin_type,branch_id,category_id,supplier_id,customer_id").eq("organization_id",id).order("due_date",{ascending:true,nullsFirst:false}).limit(1000),
      supabase.rpc("get_cashflow_report",{p_organization_id:id,p_branch_id:branch||null,p_start:start,p_end:end,p_mode:mode}),
      supabase.rpc("get_finance_summary",{p_organization_id:id,p_branch_id:branch||null,p_start:start,p_end:end}),
      supabase.from("suppliers").select("id,name").eq("organization_id",id).order("name"),
      supabase.from("customers").select("id,name").eq("organization_id",id).order("name"),
      supabase.from("finance_recurring_templates").select("id,description,amount,frequency,next_due_date,entry_type,active,branch_id").eq("organization_id",id).order("next_due_date"),
      supabase.rpc("get_finance_monthly_statement",{p_organization_id:id,p_branch_id:branch||null,p_month:start}),
      supabase.rpc("get_finance_branch_performance",{p_organization_id:id,p_month:start})
    ]);
    if(b.error)setError(b.error.message);else setBranches((b.data||[]) as Branch[]);
    if(c.error)setError(c.error.message);else setCategories((c.data||[]) as Category[]);
    if(a.error)setError(a.error.message);else setAccounts((a.data||[]) as Account[]);
    if(e.error)setError(e.error.message);else setEntries((e.data||[]) as Entry[]);
    if(f.error)setError(f.error.message);else{setFlow((f.data?.rows||[]) as FlowRow[]);setTotals(f.data?.totals||{});}
    if(s.error)setError(s.error.message);else setSummary(s.data||{});
    if(sp.error)setError(sp.error.message);else setSuppliers((sp.data||[]) as Person[]);
    if(cu.error)setError(cu.error.message);else setCustomers((cu.data||[]) as Person[]);
    if(r.error)setError(r.error.message);else setRecurring((r.data||[]) as Recurring[]);
    if(st.error)setError(st.error.message);else setStatement(st.data as Statement);
    if(bp.error)setError(bp.error.message);else setBranchPerformance((bp.data||[]) as BranchPerformance[]);
  }

  useEffect(()=>{(async()=>{const {data,error:e}=await supabase.rpc("get_my_organization");if(e||!data?.[0]){setError(e?.message||"Empresa não encontrada");setLoading(false);return;}setOrg(data[0].organization_id);await load(data[0].organization_id);setLoading(false);})();},[]);
  useEffect(()=>{if(org)load();},[branch,mode,start,end]);

  const filtered=useMemo(()=>entries.filter(e=>{
    const text=(e.description+" "+(originLabels[e.origin_type]||e.origin_type)).toLowerCase();
    return (!search||text.includes(search.toLowerCase()))&&(statusFilter==="all"||e.status===statusFilter)&&(originFilter==="all"||e.origin_type===originFilter);
  }),[entries,search,statusFilter,originFilter]);

  const pay=filtered.filter(e=>e.entry_type==="payable");
  const rec=filtered.filter(e=>e.entry_type==="receivable");

  function csvDownload(){
    const rows=[["Tipo","Descrição","Vencimento","Valor","Status","Origem"],...filtered.map(e=>[e.entry_type==="payable"?"A pagar":"A receber",e.description,e.due_date||"",String(e.amount).replace(".",","),labels[e.status]||e.status,originLabels[e.origin_type]||e.origin_type])];
    const csv="\\uFEFF"+rows.map(r=>r.map(v=>"\\\""+String(v).replaceAll("\\\"","\\\"\\\"")+"\\\"").join(";")).join("\\r\\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="financeiro-"+start+"-"+end+".csv";a.click();URL.revokeObjectURL(a.href);
  }

  async function createEntry(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");
    const f=new FormData(e.currentTarget);const type=String(f.get("entry_type"));
    const {error:e2}=await supabase.rpc("finance_create_entry",{p_organization_id:org,p_branch_id:String(f.get("branch_id"))||null,p_entry_type:type,p_description:String(f.get("description")),p_amount:Number(f.get("amount")),p_due_date:String(f.get("due_date"))||null,p_category_id:String(f.get("category_id"))||null,p_supplier_id:String(f.get("supplier_id"))||null,p_customer_id:String(f.get("customer_id"))||null,p_origin_type:"manual",p_origin_id:null,p_competence_date:String(f.get("competence_date"))||String(f.get("due_date"))||today()});
    if(e2)setError(e2.message);else{setMsg("Lançamento criado.");e.currentTarget.reset();await load();}setSaving(false);
  }

  async function settleEntry(){
    if(!settle)return;setSaving(true);setError("");
    const {error:e}=await supabase.rpc("finance_settle",{p_entry_id:settle.id,p_amount:Number(settleAmount),p_payment_method:settleMethod,p_financial_account_id:settleAccount||null,p_interest:Number(settleInterest)||0,p_fine:Number(settleFine)||0,p_discount:Number(settleDiscount)||0,p_idempotency_key:crypto.randomUUID(),p_settled_at:new Date().toISOString(),p_notes:null});
    if(e)setError(e.message);else{setMsg("Baixa registrada.");setSettle(null);await load();}setSaving(false);
  }

  async function reverseEntry(entry:Entry){
    const {data,error:e}=await supabase.from("finance_settlements").select("id,settled_at,amount,settlement_type").eq("entry_id",entry.id).in("settlement_type",["payment","receipt"]).order("settled_at",{ascending:false}).limit(1).maybeSingle();
    if(e){setError(e.message);return;} if(!data){setError("Nenhuma baixa encontrada para estornar.");return;}
    const reason=window.prompt("Motivo do estorno:");if(reason===null)return;
    setSaving(true);setError("");
    const {error:e2}=await supabase.rpc("finance_reverse_settlement",{p_settlement_id:data.id,p_idempotency_key:crypto.randomUUID(),p_reason:reason});
    if(e2)setError(e2.message);else{setMsg("Estorno registrado.");await load();}setSaving(false);
  }

  async function cancelEntry(entry:Entry){
    const reason=window.prompt("Motivo do cancelamento:");if(reason===null)return;
    setSaving(true);setError("");
    const {error:e}=await supabase.rpc("finance_cancel_entry",{p_entry_id:entry.id,p_reason:reason});
    if(e)setError(e.message);else{setMsg("Lançamento cancelado.");await load();}setSaving(false);
  }

  async function createAccount(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");const f=new FormData(e.currentTarget);
    const {error:e2}=await supabase.rpc("finance_create_account",{p_organization_id:org,p_branch_id:String(f.get("branch_id"))||null,p_name:String(f.get("name")),p_kind:String(f.get("kind")),p_opening_balance:Number(f.get("opening_balance"))||0,p_opening_balance_date:String(f.get("opening_balance_date"))||today()});
    if(e2)setError(e2.message);else{setMsg("Conta financeira criada.");e.currentTarget.reset();await load();}setSaving(false);
  }

  async function createCategory(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");const f=new FormData(e.currentTarget);
    const {error:e2}=await supabase.rpc("finance_create_category",{p_organization_id:org,p_name:String(f.get("name")),p_kind:String(f.get("kind"))});
    if(e2)setError(e2.message);else{setMsg("Categoria criada.");setShowNewCategory(false);e.currentTarget.reset();await load();}setSaving(false);
  }

  async function createRecurring(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");const f=new FormData(e.currentTarget);const type=String(f.get("entry_type"));
    const {error:e2}=await supabase.rpc("finance_create_recurring",{p_organization_id:org,p_branch_id:String(f.get("branch_id"))||null,p_entry_type:type,p_description:String(f.get("description")),p_amount:Number(f.get("amount")),p_frequency:String(f.get("frequency")),p_next_due_date:String(f.get("next_due_date")),p_category_id:String(f.get("category_id"))||null,p_supplier_id:String(f.get("supplier_id"))||null,p_customer_id:String(f.get("customer_id"))||null});
    if(e2)setError(e2.message);else{setMsg("Recorrência criada.");setShowRecurring(false);e.currentTarget.reset();await load();}setSaving(false);
  }

  async function toggleRecurring(t:Recurring){
    setSaving(true);setError("");const {error:e}=await supabase.rpc("finance_set_recurring_active",{p_template_id:t.id,p_active:!t.active});
    if(e)setError(e.message);else await load();setSaving(false);
  }

  function openSettlement(e:Entry){
    setSettle(e);setSettleAmount(String(Number(e.amount).toFixed(2)));setSettleInterest("0");setSettleFine("0");setSettleDiscount("0");setSettleAccount(accounts[0]?.id||"");
  }

  if(loading)return <div className="page"><div className="panel">Carregando financeiro…</div></div>;

  return <div className="page finance-page">
    <div className="page-header finance-header"><div><span className="eyebrow">FINANCEIRO</span><h1>Fluxo de caixa</h1><p>Uma única origem para cada fato financeiro, com PDV, baixas e projeções.</p></div><div className="finance-actions"><button className="button" onClick={()=>load()}><RefreshCw size={16}/> Atualizar</button><button className="button" onClick={csvDownload}><Download size={16}/> CSV</button><button className="button" onClick={()=>window.print()}>Imprimir</button></div></div>
    {error&&<div className="error">{error}</div>}{msg&&<div className="success">{msg}</div>}
    <div className="finance-toolbar"><div className="segmented"><button className={mode==="realized"?"active":""} onClick={()=>setMode("realized")}>Realizado</button><button className={mode==="projected"?"active":""} onClick={()=>setMode("projected")}>Projetado</button></div><label>Filial<select value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Consolidado</option>{branches.map(b=><option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label><label>De<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Até<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
    <div className="finance-tabs">{([["overview","Visão geral"],["payables","A pagar"],["receivables","A receber"],["new","Novo lançamento"],["recurring","Recorrências"],["categories","Categorias"],["accounts","Contas financeiras"]] as [Tab,string][]).map(([k,l])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{l}</button>)}</div>

    {tab==="overview"&&<>
      {statement&&<div className={"panel finance-health "+statement.health}>
        <div className="panel-title"><div><span className="eyebrow">RESULTADO DO MÊS · COMPETÊNCIA</span><h2>{statement.health==="healthy"?"Mês saudável":statement.health==="red"?"Mês no vermelho":"Mês no zero"}</h2></div><strong>{brl(Number(statement.net_result))}</strong></div>
        <div className="stats-row"><div className="stat-card"><small>Receita de vendas</small><strong>{brl(Number(statement.sales))}</strong></div><div className="stat-card"><small>Lucro bruto</small><strong>{brl(Number(statement.gross_profit))}</strong></div><div className="stat-card"><small>Margem líquida</small><strong>{Number(statement.net_margin).toFixed(1)}%</strong></div><div className="stat-card"><small>Saldo projetado</small><strong>{brl(Number(statement.projected_balance))}</strong></div></div>
        <div className="table-wrap"><table><tbody>
          <tr><td>Receita de vendas</td><td>{brl(Number(statement.sales))}</td></tr>
          <tr><td>(-) Custo das mercadorias vendidas</td><td>{brl(-Number(statement.cogs))}</td></tr>
          <tr><td><b>Lucro bruto</b></td><td><b>{brl(Number(statement.gross_profit))}</b></td></tr>
          <tr><td>(+) Outras receitas</td><td>{brl(Number(statement.other_income))}</td></tr>
          <tr><td>(-) Despesas operacionais</td><td>{brl(-Number(statement.operating_expenses))}</td></tr>
          <tr><td>(-) Impostos</td><td>{brl(-Number(statement.taxes))}</td></tr>
          <tr><td>(-) Pessoal</td><td>{brl(-Number(statement.payroll))}</td></tr>
          <tr><td>(-) Ocupação / aluguel</td><td>{brl(-Number(statement.occupancy))}</td></tr>
          <tr><td>(-) Água, energia e internet</td><td>{brl(-Number(statement.utilities))}</td></tr>
          <tr><td>(-) Marketing</td><td>{brl(-Number(statement.marketing))}</td></tr>
          <tr><td>(-) Despesas financeiras</td><td>{brl(-Number(statement.financial_expenses))}</td></tr>
          <tr><td><b>Resultado líquido</b></td><td><b>{brl(Number(statement.net_result))}</b></td></tr>
        </tbody></table></div>
        <p>Caixa disponível: <b>{brl(Number(statement.cash_balance))}</b> · A receber: <b>{brl(Number(statement.open_receivable))}</b> · A pagar: <b>{brl(Number(statement.open_payable))}</b> · Variação contra o mês anterior: <b>{brl(Number(statement.result_change))}</b>.</p>
      </div>}
      {!branch&&branchPerformance.length>1&&<div className="panel"><div className="panel-title"><div><h2>Resultado por unidade</h2><span>Matriz e filiais no mesmo fechamento.</span></div></div><div className="table-wrap"><table><thead><tr><th>Unidade</th><th>Vendas</th><th>CMV</th><th>Despesas</th><th>Resultado</th></tr></thead><tbody>{branchPerformance.map(x=><tr key={x.branch_id}><td>{x.branch_name}{x.is_headquarters?" · Matriz":""}</td><td>{brl(Number(x.sales))}</td><td>{brl(Number(x.cogs))}</td><td>{brl(Number(x.expenses))}</td><td><b>{brl(Number(x.net_result))}</b></td></tr>)}</tbody></table></div></div>}
      <div className="finance-alert-grid"><div className="finance-alert danger"><AlertTriangle size={17}/><div><b>{brl(Number(summary.overdue_payable))}</b><span>A pagar vencido</span></div></div><div className="finance-alert warning"><CalendarClock size={17}/><div><b>{brl(Number(summary.overdue_receivable))}</b><span>A receber vencido</span></div></div><div className="finance-alert"><Wallet size={17}/><div><b>{brl(Number(summary.payable_open))}</b><span>Contas a pagar abertas</span></div></div><div className="finance-alert"><Wallet size={17}/><div><b>{brl(Number(summary.receivable_open))}</b><span>Contas a receber abertas</span></div></div></div>
      <div className="stats-row"><div className="stat-card"><small>Vendas recebidas</small><strong>{brl(Number(totals.sales))}</strong></div><div className="stat-card"><small>Recebido financeiro</small><strong>{brl(Number(summary.received_period))}</strong></div><div className="stat-card"><small>Pago financeiro</small><strong>{brl(Number(summary.paid_period))}</strong></div><div className="stat-card"><small>Variação</small><strong>{brl(Number(totals.net))}</strong></div></div>
      <div className="panel"><div className="panel-title"><div><h2>Movimentação diária</h2><span>{mode==="realized"?"Somente valores realizados":"Realizado + valores futuros por vencimento"}</span></div></div><div className="finance-chart">{flow.map((r,i)=><div className="finance-bar-col" key={r.day} title={r.day+" · "+brl(r.net)}><div className="finance-bar-wrap"><i style={{height:Math.max(5,Math.min(100,Math.abs(r.net)/(Math.max(...flow.map(x=>Math.abs(x.net)),1))*100))+"%"}}/></div><small>{i%5===0?new Date(r.day+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}):""}</small></div>)}</div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Vendas</th><th>Financeiro</th><th>Receber</th><th>Pagar</th><th>Saldo acumulado</th><th>Variação</th></tr></thead><tbody>{flow.map(r=><tr key={r.day}><td>{new Date(r.day+"T12:00:00").toLocaleDateString("pt-BR")}</td><td>{brl(r.sales)}</td><td>{brl(r.settlements)}</td><td>{brl(r.projected_receipts)}</td><td>{brl(r.projected_payables)}</td><td>{brl(Number(r.accumulated_balance))}</td><td>{brl(r.net)}</td></tr>)}</tbody></table></div></div>
    </>}

    {(tab==="payables"||tab==="receivables")&&<div className="panel"><div className="finance-list-head"><div><h2>{tab==="payables"?"Contas a pagar":"Contas a receber"}</h2><span>{(tab==="payables"?pay:rec).filter(e=>e.status==="overdue").length} vencida(s)</span></div><div className="finance-list-tools"><label className="finance-search"><Search size={15}/><input placeholder="Buscar descrição..." value={search} onChange={e=>setSearch(e.target.value)}/></label><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">Todos os status</option><option value="open">Abertas</option><option value="partial">Parciais</option><option value="overdue">Vencidas</option><option value="paid">Pagas</option><option value="received">Recebidas</option><option value="cancelled">Canceladas</option></select><select value={originFilter} onChange={e=>setOriginFilter(e.target.value)}><option value="all">Todas as origens</option>{Object.entries(originLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div></div><div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Origem</th><th>Ação</th></tr></thead><tbody>{(tab==="payables"?pay:rec).map(e=><tr key={e.id}><td>{e.description}</td><td>{e.due_date?new Date(e.due_date+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</td><td>{brl(Number(e.amount))}</td><td><span className={"finance-status "+e.status}>{labels[e.status]||e.status}</span></td><td>{originLabels[e.origin_type]||e.origin_type}</td><td className="finance-row-actions">{["open","partial","overdue"].includes(e.status)&&<button className="button small" onClick={()=>openSettlement(e)}>{e.entry_type==="payable"?"Baixar":"Receber"}</button>}{e.status!=="cancelled"&&e.origin_type!=="purchase"&&["open","overdue"].includes(e.status)&&<button className="button small danger-button" onClick={()=>cancelEntry(e)}>Cancelar</button>}{["paid","received"].includes(e.status)&&<button className="button small" onClick={()=>reverseEntry(e)}>Estornar última baixa</button>}</td></tr>)}{!(tab==="payables"?pay:rec).length&&<tr><td colSpan={6}>Nenhuma conta encontrada.</td></tr>}</tbody></table></div></div>}

    {tab==="new"&&<div className="panel"><h2>Novo lançamento manual</h2><p>Use para fatos que não nasceram do PDV ou de uma compra. Venda paga não deve ser lançada novamente aqui.</p><form className="form-grid" onSubmit={createEntry}><label>Tipo<select name="entry_type"><option value="payable">Despesa / a pagar</option><option value="receivable">Receita / a receber</option></select></label><label>Filial<select name="branch_id" required><option value="">Selecione</option>{branches.map(b=><option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label><label>Descrição<input name="description" required/></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Competência<input name="competence_date" type="date" defaultValue={today()} required/></label><label>Vencimento<input name="due_date" type="date"/></label><label>Categoria<select name="category_id"><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Fornecedor<select name="supplier_id"><option value="">Nenhum</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Cliente<select name="customer_id"><option value="">Nenhum</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="button primary" disabled={saving}><Plus size={16}/> Criar</button></form></div>}

    {tab==="recurring"&&<div className="panel"><div className="panel-title"><div><h2>Recorrências</h2><span>Gere contas futuras sem duplicar fatos.</span></div><button className="button primary" onClick={()=>setShowRecurring(true)}><Plus size={16}/> Nova recorrência</button></div><div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th><th>Frequência</th><th>Próximo vencimento</th><th>Status</th><th/></tr></thead><tbody>{recurring.map(t=><tr key={t.id}><td>{t.description}</td><td>{t.entry_type==="payable"?"A pagar":"A receber"}</td><td>{brl(Number(t.amount))}</td><td>{t.frequency==="monthly"?"Mensal":t.frequency==="weekly"?"Semanal":"Anual"}</td><td>{new Date(t.next_due_date+"T12:00:00").toLocaleDateString("pt-BR")}</td><td>{t.active?"Ativa":"Pausada"}</td><td><button className="button small" onClick={()=>toggleRecurring(t)}>{t.active?"Pausar":"Ativar"}</button></td></tr>)}{!recurring.length&&<tr><td colSpan={7}>Nenhuma recorrência cadastrada.</td></tr>}</tbody></table></div><div className="finance-recurring-generate"><button className="button" disabled={saving} onClick={async()=>{setSaving(true);const {error:e}=await supabase.rpc("finance_generate_recurring",{p_organization_id:org,p_until:end});if(e)setError(e.message);else{setMsg("Recorrências geradas.");await load();}setSaving(false)}}><CalendarClock size={16}/> Gerar até {new Date(end+"T12:00:00").toLocaleDateString("pt-BR")}</button></div></div>}

    {tab==="categories"&&<div className="panel"><div className="panel-title"><div><h2>Categorias financeiras</h2><span>Centralizadas para relatórios e fluxo de caixa.</span></div><button className="button primary" onClick={()=>setShowNewCategory(true)}><Plus size={16}/> Nova categoria</button></div><div className="finance-category-grid">{categories.map(c=><div className="finance-category-card" key={c.id}><b>{c.name}</b><span>{c.kind==="expense"?"Despesa":c.kind==="income"?"Receita":"Ambas"}</span></div>)}</div></div>}

    {tab==="accounts"&&<><div className="panel"><h2>Nova conta financeira</h2><p>Caixa, banco ou carteira digital com saldo inicial.</p><form className="form-grid" onSubmit={createAccount}><label>Nome<input name="name" required placeholder="Caixa, Banco, Mercado Pago"/></label><label>Tipo<select name="kind"><option value="cash">Caixa</option><option value="bank">Banco</option><option value="digital_wallet">Carteira digital</option><option value="other">Outra</option></select></label><label>Filial<select name="branch_id"><option value="">Compartilhada</option>{branches.map(b=><option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label><label>Saldo inicial<input name="opening_balance" type="number" step="0.01" defaultValue="0"/></label><label>Data de corte<input name="opening_balance_date" type="date" defaultValue={today()}/></label><button className="button primary" disabled={saving}>Criar conta</button></form></div><div className="panel"><h2>Contas cadastradas</h2><div className="table-wrap"><table><thead><tr><th>Conta</th><th>Tipo</th><th>Saldo inicial</th><th>Data</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id}><td><Wallet size={15}/> {a.name}</td><td>{a.kind}</td><td>{brl(Number(a.opening_balance))}</td><td>{new Date(a.opening_balance_date+"T12:00:00").toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table></div></div></>}

    {settle&&<div className="modal-backdrop"><div className="modal finance-modal"><div className="finance-modal-head"><div><h2>{settle.entry_type==="payable"?"Baixar conta":"Registrar recebimento"}</h2><p>{settle.description}</p></div><button className="icon-button" onClick={()=>setSettle(null)}><X size={18}/></button></div><div className="form-grid"><label>Valor<input type="number" min="0.01" step="0.01" value={settleAmount} onChange={e=>setSettleAmount(e.target.value)}/></label><label>Conta financeira<select value={settleAccount} onChange={e=>setSettleAccount(e.target.value)}><option value="">Sem conta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Forma<select value={settleMethod} onChange={e=>setSettleMethod(e.target.value)}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="bank_transfer">Transferência</option><option value="card">Cartão</option><option value="other">Outra</option></select></label><label>Juros<input type="number" min="0" step="0.01" value={settleInterest} onChange={e=>setSettleInterest(e.target.value)}/></label><label>Multa<input type="number" min="0" step="0.01" value={settleFine} onChange={e=>setSettleFine(e.target.value)}/></label><label>Desconto<input type="number" min="0" step="0.01" value={settleDiscount} onChange={e=>setSettleDiscount(e.target.value)}/></label></div><div className="finance-settle-total">Total movimentado: <b>{brl(Number(settleAmount)+Number(settleInterest)+Number(settleFine)-Number(settleDiscount))}</b></div><div className="modal-actions"><button className="button" onClick={()=>setSettle(null)}>Cancelar</button><button className="button primary" disabled={saving} onClick={settleEntry}>Confirmar</button></div></div></div>}

    {showNewCategory&&<div className="modal-backdrop"><form className="modal finance-modal" onSubmit={createCategory}><div className="finance-modal-head"><h2>Nova categoria</h2><button type="button" className="icon-button" onClick={()=>setShowNewCategory(false)}><X size={18}/></button></div><label>Nome<input name="name" required/></label><label>Tipo<select name="kind"><option value="expense">Despesa</option><option value="income">Receita</option><option value="both">Ambas</option></select></label><div className="modal-actions"><button type="button" className="button" onClick={()=>setShowNewCategory(false)}>Cancelar</button><button className="button primary" disabled={saving}>Criar</button></div></form></div>}

    {showRecurring&&<div className="modal-backdrop"><form className="modal finance-modal" onSubmit={createRecurring}><div className="finance-modal-head"><h2>Nova recorrência</h2><button type="button" className="icon-button" onClick={()=>setShowRecurring(false)}><X size={18}/></button></div><div className="form-grid"><label>Tipo<select name="entry_type"><option value="payable">A pagar</option><option value="receivable">A receber</option></select></label><label>Filial<select name="branch_id" required><option value="">Selecione</option>{branches.map(b=><option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label><label>Descrição<input name="description" required/></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Frequência<select name="frequency"><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="yearly">Anual</option></select></label><label>Próximo vencimento<input name="next_due_date" type="date" defaultValue={today()} required/></label><label>Categoria<select name="category_id"><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Fornecedor<select name="supplier_id"><option value="">Nenhum</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Cliente<select name="customer_id"><option value="">Nenhum</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="button" onClick={()=>setShowRecurring(false)}>Cancelar</button><button className="button primary" disabled={saving}>Criar recorrência</button></div></form></div>}
  </div>;
}