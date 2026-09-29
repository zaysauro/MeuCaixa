"use client";
import { useEffect,useState } from "react";
import { createClient } from "@/lib/supabase/client";
export default function CaixaPage(){
 const supabase=createClient(); const [org,setOrg]=useState<any>(null); const [summary,setSummary]=useState<any>(null); const [opening,setOpening]=useState("0"); const [msg,setMsg]=useState(""); const [loading,setLoading]=useState(false);
 async function load(){const {data}=await supabase.rpc("get_my_organization"); if(data?.[0]){setOrg(data[0]); const {data:s}=await supabase.rpc("get_cash_summary",{p_branch_id:data[0].branch_id});setSummary(s?.[0]??null);}}
 useEffect(()=>{load()},[]);
 async function open(){setLoading(true);setMsg("");const {error}=await supabase.rpc("open_cash_register",{p_branch_id:org.branch_id,p_opening_balance:Number(opening)||0});if(error)setMsg(error.message);else await load();setLoading(false);}
 return <div className="page"><div className="page-header"><div><span className="eyebrow">OPERAÇÃO</span><h1>Caixa</h1><p>Abra, acompanhe e feche o caixa da sua unidade.</p></div></div>
 {!summary?<div className="panel"><h2>Abrir caixa</h2><p>Informe o dinheiro disponível no início do expediente.</p><div className="inline-form"><input className="field" type="number" min="0" step=".01" value={opening} onChange={e=>setOpening(e.target.value)} placeholder="Saldo inicial" /><button className="button primary" onClick={open} disabled={loading}>{loading?"Abrindo...":"Abrir caixa"}</button></div>{msg&&<div className="error">{msg}</div>}</div>:
 <><div className="stats-row"><div className="stat-card"><small>Status</small><strong>{summary.status==="open"?"Aberto":"Fechado"}</strong></div><div className="stat-card"><small>Vendas</small><strong>R$ {Number(summary.total_sales).toFixed(2).replace(".",",")}</strong></div><div className="stat-card"><small>Entradas</small><strong>R$ {Number(summary.cash_in).toFixed(2).replace(".",",")}</strong></div><div className="stat-card"><small>Saldo esperado</small><strong>R$ {Number(summary.expected_balance).toFixed(2).replace(".",",")}</strong></div></div>
 <div className="panel"><h2>Caixa atual</h2><p>O caixa está vinculado à unidade <strong>{org?.branch_name}</strong>. As vendas feitas pelo PDV entram automaticamente aqui.</p></div></>}
 </div>;
}