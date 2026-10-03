"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Branch={branch_id:string;branch_name:string;branch_code:string|null;is_headquarters:boolean;active:boolean;role:string};
type Product={id:string;name:string;sku:string|null;unit:string;cost_price:number;sale_price:number;minimum_stock:number};
type Stock={branch_id:string;product_id:string;stock_quantity:number;minimum_stock:number;average_cost:number};
type Movement={id:string;product_id:string;type:string;quantity:number;quantity_delta:number;previous_quantity:number;new_quantity:number;unit_cost:number;reason:string|null;created_at:string};
type Transfer={id:string;transfer_number:number;source_branch_id:string;destination_branch_id:string;status:string;notes:string|null;created_at:string};
type Supplier={id:string;name:string};

const money=(n:number)=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const statusLabel=(s:string)=>({requested:"Solicitada",sent:"Enviada",received:"Recebida",cancelled:"Cancelada"}[s]??s);

export default function StockDashboard(){
 const supabase=createClient();
 const [tab,setTab]=useState("overview");
 const [branches,setBranches]=useState<Branch[]>([]);
 const [branchId,setBranchId]=useState("");
 const [products,setProducts]=useState<Product[]>([]);
 const [suppliers,setSuppliers]=useState<Supplier[]>([]);
 const [stock,setStock]=useState<Stock[]>([]);
 const [movements,setMovements]=useState<Movement[]>([]);
 const [transfers,setTransfers]=useState<Transfer[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [selectedProduct,setSelectedProduct]=useState("");
 const [qty,setQty]=useState("");
 const [cost,setCost]=useState("");
 const [reason,setReason]=useState("");
 const [supplierId,setSupplierId]=useState("");
 const [destination,setDestination]=useState("");
 const [transferProduct,setTransferProduct]=useState("");
 const [transferQty,setTransferQty]=useState("");

 async function load(){
  setLoading(true); setMessage("");
  const b=await supabase.rpc("get_my_branches");
  const bs=(b.data??[]) as Branch[];
  setBranches(bs);
  const current=branchId||bs[0]?.branch_id||"";
  if(current&&!branchId)setBranchId(current);
  const [p,s,m,t,sup]=await Promise.all([
   supabase.from("products").select("id,name,sku,unit,cost_price,sale_price,minimum_stock").eq("active",true).order("name"),
   current?supabase.from("branch_product_stock").select("branch_id,product_id,stock_quantity,minimum_stock,average_cost").eq("branch_id",current):Promise.resolve({data:[],error:null} as any),
   current?supabase.from("inventory_movements").select("id,product_id,type,quantity,quantity_delta,previous_quantity,new_quantity,unit_cost,reason,created_at").eq("branch_id",current).order("created_at",{ascending:false}).limit(200):Promise.resolve({data:[],error:null} as any),
   supabase.from("stock_transfers").select("id,transfer_number,source_branch_id,destination_branch_id,status,notes,created_at").order("created_at",{ascending:false}).limit(100),
   supabase.from("suppliers").select("id,name").order("name")
  ]);
  if(p.error) setMessage(p.error.message); else setProducts((p.data??[]) as Product[]);
  if(s.error) setMessage(s.error.message); else setStock((s.data??[]) as Stock[]);
  if(m.error) setMessage(m.error.message); else setMovements((m.data??[]) as Movement[]);
  if(t.error) setMessage(t.error.message); else setTransfers((t.data??[]) as Transfer[]);
  if(!sup.error) setSuppliers((sup.data??[]) as Supplier[]);
  setLoading(false);
 }

 useEffect(()=>{load()},[branchId]);

 const byProduct=useMemo(()=>new Map(products.map(p=>[p.id,p])),[products]);
 const branchName=(id:string)=>branches.find(b=>b.branch_id===id)?.branch_name??"—";
 const rows=useMemo(()=>stock.map(s=>({...s,product:byProduct.get(s.product_id)})).filter(x=>x.product),[stock,byProduct]);
 const low=rows.filter(x=>Number(x.stock_quantity)<=Number(x.minimum_stock));
 const totalUnits=rows.reduce((a,x)=>a+Number(x.stock_quantity),0);
 const stockValue=rows.reduce((a,x)=>a+Number(x.stock_quantity)*Number(x.average_cost),0);

 async function call(fn:string,args:any){
  setBusy(true);setMessage("");
  const {error}=await supabase.rpc(fn,args);
  if(error)setMessage(error.message);else{setMessage("Operação concluída.");await load();}
  setBusy(false);
 }

 function clearForm(){setSelectedProduct("");setQty("");setCost("");setReason("");setSupplierId("");setTransferProduct("");setTransferQty("");}

 return <div className="stock-module">
  <div className="page-header">
   <div><span className="eyebrow">OPERAÇÃO</span><h1>Estoque</h1><p>Kardex, entradas, saídas, inventário e transferências entre filiais.</p></div>
   <select value={branchId} onChange={e=>setBranchId(e.target.value)} className="stock-branch-select">{branches.map(b=><option key={b.branch_id} value={b.branch_id}>{b.branch_name}{b.is_headquarters?" · Matriz":""}</option>)}</select>
  </div>

  {message&&<div className="stock-message">{message}</div>}
  <div className="stock-tabs">{[
   ["overview","Visão geral"],["kardex","Kardex"],["entry","Entrada"],["exit","Saída"],["inventory","Inventário"],["transfer","Transferências"]
  ].filter(([id])=>id!=="transfer"||branches.length>1).map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);clearForm()}}>{label}</button>)}</div>
  {!loading&&branches.length<2&&<div className="panel"><h2>Transferências entre lojas</h2><p>Recurso disponível em planos com múltiplas lojas.</p><a className="button secondary" href="/dashboard/configuracoes/upgrade">Conhecer planos</a></div>}

  {loading?<div className="panel"><p>Carregando estoque...</p></div>:<>
   {tab==="overview"&&<div className="stock-grid">
    <div className="stock-stat"><span>Produtos ativos</span><strong>{rows.length}</strong></div>
    <div className="stock-stat"><span>Unidades em estoque</span><strong>{totalUnits.toLocaleString("pt-BR")}</strong></div>
    <div className="stock-stat"><span>Valor pelo custo médio</span><strong>{money(stockValue)}</strong></div>
    <div className="stock-stat"><span>Estoque baixo</span><strong>{low.length}</strong></div>
    <div className="panel stock-wide"><div className="panel-title"><h2>Estoque da filial</h2><span>{branchName(branchId)}</span></div>
     <div className="table-wrap"><table><thead><tr><th>Produto</th><th>Saldo</th><th>Mínimo</th><th>Custo médio</th><th>Venda</th></tr></thead><tbody>
      {rows.map(x=><tr key={x.product_id}><td><strong>{x.product!.name}</strong><small>{x.product!.sku||"Sem SKU"}</small></td><td className={Number(x.stock_quantity)<=Number(x.minimum_stock)?"low-stock":""}>{x.stock_quantity} {x.product!.unit}</td><td>{x.minimum_stock}</td><td>{money(Number(x.average_cost))}</td><td>{money(Number(x.product!.sale_price))}</td></tr>)}
     </tbody></table></div>
    </div>
   </div>}

   {tab==="kardex"&&<div className="panel"><div className="panel-title"><h2>Kardex</h2><span>{movements.length} movimentos recentes</span></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Quantidade</th><th>Saldo</th><th>Custo</th><th>Motivo</th></tr></thead><tbody>
    {movements.map(m=><tr key={m.id}><td>{new Date(m.created_at).toLocaleString("pt-BR")}</td><td>{byProduct.get(m.product_id)?.name??"Produto"}</td><td>{m.type}</td><td className={Number(m.quantity_delta)<0?"negative":"positive"}>{Number(m.quantity_delta)>0?"+":""}{m.quantity_delta}</td><td>{m.new_quantity}</td><td>{money(Number(m.unit_cost||0))}</td><td>{m.reason||"—"}</td></tr>)}
   </tbody></table></div></div>}

   {["entry","exit","inventory"].includes(tab)&&<div className="panel stock-form"><h2>{tab==="entry"?"Entrada de estoque":tab==="exit"?"Saída de estoque":"Inventário físico"}</h2>
    <label>Produto<select value={selectedProduct} onChange={e=>setSelectedProduct(e.target.value)}><option value="">Selecione</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku||"sem SKU"}</option>)}</select></label>
    <label>{tab==="inventory"?"Quantidade contada":"Quantidade"}<input type="number" min="0" step="0.001" value={qty} onChange={e=>setQty(e.target.value)}/></label>
    {tab==="entry"&&<>
    <label>Custo unitário<input type="number" min="0" step="0.0001" value={cost} onChange={e=>setCost(e.target.value)}/></label>
    <label>Fornecedor<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">Sem fornecedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   </>}
    <label>Motivo{tab!=="entry"&&<span className="required"> obrigatório</span>}<input value={reason} onChange={e=>setReason(e.target.value)} placeholder={tab==="entry"?"Compra/recebimento":"Informe o motivo da operação"}/></label>
    <button className="primary" disabled={busy||!selectedProduct||!qty||(tab!=="entry"&&!reason.trim())} onClick={()=>tab==="entry"?call("stock_entry",{p_branch_id:branchId,p_product_id:selectedProduct,p_quantity:Number(qty),p_unit_cost:Number(cost),p_reason:reason||"Entrada de estoque",p_supplier_id:supplierId||null}):tab==="exit"?call("stock_exit",{p_branch_id:branchId,p_product_id:selectedProduct,p_quantity:Number(qty),p_reason:reason}):call("quick_inventory",{p_branch_id:branchId,p_product_id:selectedProduct,p_counted_quantity:Number(qty),p_reason:reason||"Inventário físico"})}>{busy?"Processando...":"Confirmar operação"}</button>
   </div>}

   {tab==="transfer"&&<div className="stock-transfer-grid"><div className="panel stock-form"><h2>Nova transferência</h2><label>Filial de destino<select value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Selecione</option>{branches.filter(b=>b.branch_id!==branchId).map(b=><option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></label><label>Produto<select value={transferProduct} onChange={e=>setTransferProduct(e.target.value)}><option value="">Selecione</option>{rows.filter(x=>Number(x.stock_quantity)>0).map(x=><option key={x.product_id} value={x.product_id}>{x.product!.name} · saldo {x.stock_quantity}</option>)}</select></label><label>Quantidade<input type="number" min="0.001" step="0.001" value={transferQty} onChange={e=>setTransferQty(e.target.value)}/></label><button className="primary" disabled={busy||!destination||!transferProduct||!transferQty} onClick={async()=>{await call("create_stock_transfer",{p_source_branch_id:branchId,p_destination_branch_id:destination,p_items:[{product_id:transferProduct,quantity:Number(transferQty)}],p_request_key:crypto.randomUUID(),p_notes:null});clearForm()}}>Solicitar transferência</button></div>
    <div className="panel"><div className="panel-title"><h2>Transferências</h2></div><div className="transfer-list">{transfers.map(t=><div className="transfer-card" key={t.id}><div><strong>#{t.transfer_number}</strong><span>{statusLabel(t.status)}</span><small>{branchName(t.source_branch_id)} → {branchName(t.destination_branch_id)}</small></div><div className="transfer-actions">{t.status==="requested"&&t.source_branch_id===branchId&&<button onClick={()=>call("send_stock_transfer",{p_transfer_id:t.id})}>Enviar</button>}{t.status==="sent"&&t.destination_branch_id===branchId&&<button onClick={()=>call("receive_stock_transfer",{p_transfer_id:t.id,p_items:null})}>Receber</button>}{["requested","sent","received"].includes(t.status)&&<button className="danger" onClick={()=>{const r=prompt("Motivo do cancelamento/estorno:");if(r)call("cancel_stock_transfer",{p_transfer_id:t.id,p_reason:r})}}>Cancelar/estornar</button>}</div></div>)}</div></div>
   </div>}
  </>}
 </div>;
}
