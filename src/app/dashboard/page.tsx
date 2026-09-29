import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const money=(v:number)=>"R$ "+v.toFixed(2).replace(".",",");

export default async function DashboardPage(){
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) redirect("/login");
 const {data:org}=await supabase.rpc("get_my_organization");
 if(!org?.length) redirect("/onboarding");
 const organizationId=org[0].organization_id;
 const start=new Date(); start.setHours(0,0,0,0);
 const [{data:sales},{data:expenses},{data:products},{data:members}]=await Promise.all([
  supabase.from("sales").select("total").eq("organization_id",organizationId).eq("status","completed").gte("created_at",start.toISOString()),
  supabase.from("financial_transactions").select("amount,type").eq("organization_id",organizationId),
  supabase.from("products").select("stock_quantity,minimum_stock").eq("organization_id",organizationId).eq("active",true),
  supabase.from("organization_members").select("user_id,role").eq("organization_id",organizationId)
 ]);
 const salesTotal=(sales??[]).reduce((n,r)=>n+Number(r.total),0);
 const income=(expenses??[]).filter(r=>r.type==="income").reduce((n,r)=>n+Number(r.amount),0);
 const expense=(expenses??[]).filter(r=>r.type==="expense").reduce((n,r)=>n+Number(r.amount),0);
 const low=(products??[]).filter(r=>Number(r.stock_quantity)<=Number(r.minimum_stock)).length;
 return <div className="page"><div className="page-header"><div><span className="eyebrow">MEUCAIXA · VISÃO GERAL</span><h1>Olá!</h1><p>{org[0].organization_name} · {org[0].branch_name}</p></div></div>
 <div className="stats-row">
  <div className="stat-card"><small>Vendas hoje</small><strong>{money(salesTotal)}</strong></div>
  <div className="stat-card"><small>Receitas registradas</small><strong>{money(income)}</strong></div>
  <div className="stat-card"><small>Despesas registradas</small><strong>{money(expense)}</strong></div>
  <div className="stat-card"><small>Resultado</small><strong>{money(income-expense)}</strong></div>
 </div>
 <div className="stats-row"><div className="stat-card"><small>Produtos ativos</small><strong>{products?.length??0}</strong></div><div className="stat-card"><small>Estoque baixo</small><strong>{low}</strong></div><div className="stat-card"><small>Usuários</small><strong>{members?.length??0}</strong></div><div className="stat-card"><small>Seu acesso</small><strong>{org[0].role}</strong></div></div>
 <div className="panel"><h2>Comece pelo caixa</h2><p>Abra o caixa em <a href="/dashboard/caixa"><strong>Caixa</strong></a>, cadastre seus produtos e use o <a href="/dashboard/vendas"><strong>PDV</strong></a> para registrar as primeiras vendas.</p></div>
 </div>;
}