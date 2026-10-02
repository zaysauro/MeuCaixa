"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, RefreshCw, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Tab = "overview" | "payables" | "receivables" | "new" | "accounts";
type Mode = "realized" | "projected";
type Branch = { branch_id: string; branch_name: string };
type Entry = { id:string; entry_type:"payable"|"receivable"; description:string; amount:number; due_date:string|null; status:string; origin_type:string };
type Account = { id:string; name:string; kind:string; opening_balance:number; opening_balance_date:string };
type Category = { id:string; name:string; kind:string };
type FlowRow = { day:string; sales:number; settlements:number; projected_receipts:number; projected_payables:number; net:number };

const brl=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n||0);
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());
const firstDay=()=>today().slice(0,8)+"01";
const labels:Record<string,string>={open:"Aberta",partial:"Parcial",paid:"Paga",received:"Recebida",overdue:"Vencida",cancelled:"Cancelada"};

export default function FinanceiroPage(){
  const supabase=createClient();
  const [org,setOrg]=useState("");
  const [branches,setBranches]=useState<Branch[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [flow,setFlow]=useState<FlowRow[]>([]);
  const [totals,setTotals]=useState<Record<string,number>>({});
  const [tab,setTab]=useState<Tab>("overview");
  const [mode,setMode]=useState<Mode>("realized");
  const [branch,setBranch]=useState("");
  const [start,setStart]=useState(firstDay());
  const [end,setEnd]=useState(today());
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [error,setError]=useState("");
  const [settle,setSettle]=useState<Entry|null>(null);
  const [settleAmount,setSettleAmount]=useState("");
  const [settleMethod,setSettleMethod]=useState("pix");

  async function load(id=org){
    if(!id)return;
    setError("");
    const [b,c,a,e,f]=await Promise.all([
      supabase.rpc("get_my_branches"),
      supabase.from("finance_categories").select("id,name,kind").eq("organization_id",id).eq("active",true).order("name"),
      supabase.from("financial_accounts").select("id,name,kind,opening_balance,opening_balance_date").eq("organization_id",id).eq("active",true).order("name"),
      supabase.from("finance_entries").select("id,entry_type,description,amount,due_date,status,origin_type").eq("organization_id",id).order("due_date",{ascending:true,nullsFirst:false}).limit(200),
      supabase.rpc("get_cashflow_report",{p_organization_id:id,p_branch_id:branch||null,p_start:start,p_end:end,p_mode:mode})
    ]);
    if(b.error)setError(b.error.message);else setBranches((b.data||[]) as Branch[]);
    if(c.error)setError(c.error.message);else setCategories((c.data||[]) as Category[]);
    if(a.error)setError(a.error.message);else setAccounts((a.data||[]) as Account[]);
    if(e.error)setError(e.error.message);else setEntries((e.data||[]) as Entry[]);
    if(f.error)setError(f.error.message);else{setFlow((f.data?.rows||[]) as FlowRow[]);setTotals(f.data?.totals||{});}
  }

  useEffect(()=>{(async()=>{const {data,error:e}=await supabase.rpc("get_my_organization");if(e||!data?.[0]){setError(e?.message||"Empresa não encontrada");setLoading(false);return;}setOrg(data[0].organization_id);await load(data[0].organization_id);setLoading(false);})();},[]);
  useEffect(()=>{if(org)load();},[branch,mode,start,end]);

  async function createEntry(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");setMsg("");
    const f=new FormData(e.currentTarget);const type=String(f.get("entry_type"));
    const {error:e2}=await supabase.rpc("finance_create_entry",{p_organization_id:org,p_branch_id:String(f.get("branch_id"))||null,p_entry_type:type,p_description:String(f.get("description")),p_amount:Number(f.get("amount")),p_due_date:String(f.get("due_date"))||null,p_category_id:String(f.get("category_id"))||null,p_supplier_id:null,p_customer_id:null,p_origin_type:type==="payable"?"manual":"other_income",p_origin_id:null});
    if(e2)setError(e2.message);else{setMsg("Lançamento criado.");e.currentTarget.reset();await load();}setSaving(false);
  }

  async function settleEntry(){
    if(!settle)return;setSaving(true);setError("");
    const {error:e}=await supabase.rpc("finance_settle",{p_entry_id:settle.id,p_amount:Number(settleAmount),p_payment_method:settleMethod,p_financial_account_id:null,p_interest:0,p_fine:0,p_discount:0,p_idempotency_key:crypto.randomUUID(),p_settled_at:new Date().toISOString(),p_notes:null});
    if(e)setError(e.message);else{setMsg("Baixa registrada.");setSettle(null);await load();}setSaving(false);
  }

  async function createAccount(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setSaving(true);setError("");
    const f=new FormData(e.currentTarget);
    const {error:e2}=await supabase.rpc("finance_create_account",{p_organization_id:org,p_branch_id:String(f.get("branch_id"))||null,p_name:String(f.get("name")),p_kind:String(f.get("kind")),p_opening_balance:Number(f.get("opening_balance"))||0,p_opening_balance_date:String(f.get("opening_balance_date"))||today()});
    if(e2)setError(e2.message);else{setMsg("Conta financeira criada.");e.currentTarget.reset();await load();}setSaving(false);
  }

  if(loading)return <div className="page"><div className="panel">Carregando financeiro…</div></div>;
  const pay=entries.filter(e=>e.entry_type==="payable"&&e.status!=="cancelled");
  const rec=entries.filter(e=>e.entry_type==="receivable"&&e.status!=="cancelled");

  return <div className="page">
    <div className="page-header"><div><span className="eyebrow">FINANCEIRO</span><h1>Fluxo de caixa</h1><p>Vendas entram direto do PDV; lançamentos financeiros não duplicam fatos.</p></div><button className="button" onClick={()=>load()}><RefreshCw size={16}/> Atualizar</button></div>
    {error&&<div className="error">{error}</div>}{msg&&<div className="success">{msg}</div>}
    <div className="finance-toolbar"><div className="segmented"><button className={mode==="realized"?"active":""} onClick={()=>setMode("realized")}>Realizado</button><button className={mode==="projected"?"active":""} onClick={()=>setMode("projected")}>Projetado</button></div><label>Filial<select value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Todas permitidas</option>{branches.map(b=><option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label><label>De<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Até<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
    <div className="finance-tabs">{([["overview","Visão geral"],["payables","A pagar"],["receivables","A receber"],["new","Novo lançamento"],["accounts","Contas financeiras"]] as [Tab,string][]).map(([k,l])=><button key={k} className={tab===k?"active":""} onClick={()=>setTab(k)}>{l}</button>)}</div>

    {tab==="overview"&&<><div className="stats-row"><div className="stat-card"><small>Vendas recebidas</small><strong>{brl(Number(totals.sales))}</strong></div><div className="stat-card"><small>Movimentações realizadas</small><strong>{brl(Number(totals.settlements))}</strong></div><div className="stat-card"><small>Recebimentos projetados</small><strong>{brl(Number(totals.projected_receipts))}</strong></div><div className="stat-card"><small>Variação do período</small><strong>{brl(Number(totals.net))}</strong></div></div><div className="panel"><h2>Movimentação diária</h2><div className="table-wrap"><table><thead><tr><th>Data</th><th>Vendas</th><th>Financeiro</th><th>Receber</th><th>Pagar</th><th>Variação</th></tr></thead><tbody>{flow.map(r=><tr key={r.day}><td>{new Date(r.day+"T12:00:00").toLocaleDateString("pt-BR")}</td><td>{brl(r.sales)}</td><td>{brl(r.settlements)}</td><td>{brl(r.projected_receipts)}</td><td>{brl(r.projected_payables)}</td><td>{brl(r.net)}</td></tr>)}</tbody></table></div></div></>}

    {(tab==="payables"||tab==="receivables")&&<div className="panel"><h2>{tab==="payables"?"Contas a pagar":"Contas a receber"}</h2><div className="table-wrap"><table><thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Origem</th><th></th></tr></thead><tbody>{(tab==="payables"?pay:rec).map(e=><tr key={e.id}><td>{e.description}</td><td>{e.due_date?new Date(e.due_date+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</td><td>{brl(Number(e.amount))}</td><td>{labels[e.status]||e.status}</td><td>{e.origin_type}</td><td>{["open","partial","overdue"].includes(e.status)&&<button className="button small" onClick={()=>{setSettle(e);setSettleAmount(String(e.amount))}}>{e.entry_type==="payable"?"Baixar":"Receber"}</button>}</td></tr>)}{!(tab==="payables"?pay:rec).length&&<tr><td colSpan={6}>Nenhuma conta encontrada.</td></tr>}</tbody></table></div></div>}

    {tab==="new"&&<div className="panel"><h2>Novo lançamento</h2><form className="form-grid" onSubmit={createEntry}><label>Tipo<select name="entry_type"><option value="payable">Despesa / a pagar</option><option value="receivable">Receita / a receber</option></select></label><label>Filial<select name="branch_id" required><option value="">Selecione</option>{branches.map(b=><option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label><label>Descrição<input name="description" required/></label><label>Valor<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Vencimento<input name="due_date" type="date"/></label><label>Categoria<select name="category_id"><option value="">Sem categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button className="button primary" disabled={saving}><Plus size={16}/> Criar</button></form></div>}

    {tab==="accounts"&&<><div className="panel"><h2>Nova conta financeira</h2><p>Cadastre o saldo inicial por conta e data de corte.</p><form className="form-grid" onSubmit={createAccount}><label>Nome<input name="name" required placeholder="Caixa, Banco, Mercado Pago"/></label><label>Tipo<select name="kind"><option value="cash">Caixa</option><option value="bank">Banco</option><option value="digital_wallet">Carteira digital</option><option value="other">Outra</option></select></label><label>Filial<select name="branch_id"><option value="">Compartilhada</option>{branches.map(b=><option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label><label>Saldo inicial<input name="opening_balance" type="number" step="0.01" defaultValue="0"/></label><label>Data de corte<input name="opening_balance_date" type="date" defaultValue={today()}/></label><button className="button primary" disabled={saving}>Criar conta</button></form></div><div className="panel"><h2>Contas cadastradas</h2><div className="table-wrap"><table><thead><tr><th>Conta</th><th>Tipo</th><th>Saldo inicial</th><th>Data</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id}><td><Wallet size={15}/> {a.name}</td><td>{a.kind}</td><td>{brl(Number(a.opening_balance))}</td><td>{new Date(a.opening_balance_date+"T12:00:00").toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table></div></div></>}

    {settle&&<div className="modal-backdrop"><div className="modal"><h2>{settle.entry_type==="payable"?"Baixar conta":"Registrar recebimento"}</h2><p>{settle.description}</p><label>Valor<input type="number" min="0.01" step="0.01" value={settleAmount} onChange={e=>setSettleAmount(e.target.value)}/></label><label>Forma<select value={settleMethod} onChange={e=>setSettleMethod(e.target.value)}><option value="pix">PIX</option><option value="cash">Dinheiro</option><option value="bank_transfer">Transferência</option><option value="card">Cartão</option><option value="other">Outra</option></select></label><div className="modal-actions"><button className="button" onClick={()=>setSettle(null)}>Cancelar</button><button className="button primary" disabled={saving} onClick={settleEntry}>Confirmar baixa</button></div></div></div>}
  </div>;
}
