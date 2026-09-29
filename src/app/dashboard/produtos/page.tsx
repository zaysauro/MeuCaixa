"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Product = { id:string; name:string; sku:string|null; barcode:string|null; unit:string; cost_price:number; sale_price:number; stock_quantity:number; minimum_stock:number; active:boolean };

export default function ProductsPage() {
  const [products,setProducts]=useState<Product[]>([]);
  const [name,setName]=useState(""); const [sku,setSku]=useState(""); const [barcode,setBarcode]=useState("");
  const [cost,setCost]=useState(""); const [price,setPrice]=useState(""); const [stock,setStock]=useState("");
  const [message,setMessage]=useState(""); const [loading,setLoading]=useState(false);
  const supabase=createClient();

  async function load() {
    const {data,error}=await supabase.from("products").select("id,name,sku,barcode,unit,cost_price,sale_price,stock_quantity,minimum_stock,active").eq("active",true).order("name");
    if(error) setMessage(error.message); else setProducts((data??[]) as Product[]);
  }
  useEffect(()=>{load()},[]);

  async function submit(e:FormEvent) {
    e.preventDefault(); setLoading(true); setMessage("");
    const {data:org}=await supabase.rpc("get_my_organization");
    const organization_id=org?.[0]?.organization_id;
    if(!organization_id){setMessage("Empresa não configurada.");setLoading(false);return;}
    const {error}=await supabase.from("products").insert({organization_id,name:name.trim(),sku:sku||null,barcode:barcode||null,cost_price:Number(cost)||0,sale_price:Number(price)||0,stock_quantity:Number(stock)||0});
    if(error)setMessage(error.message); else {setName("");setSku("");setBarcode("");setCost("");setPrice("");setStock("");await load();}
    setLoading(false);
  }

  return <div className="page">
    <div className="page-header"><div><span className="eyebrow">CATÁLOGO</span><h1>Produtos</h1><p>Cadastre os itens vendidos pela empresa.</p></div></div>
    <div className="panel">
      <h2>Novo produto</h2>
      <form className="form-grid" onSubmit={submit}>
        <input className="field" placeholder="Nome do produto" value={name} onChange={e=>setName(e.target.value)} required />
        <input className="field" placeholder="SKU" value={sku} onChange={e=>setSku(e.target.value)} />
        <input className="field" placeholder="Código de barras" value={barcode} onChange={e=>setBarcode(e.target.value)} />
        <input className="field" type="number" step="0.01" min="0" placeholder="Preço de custo" value={cost} onChange={e=>setCost(e.target.value)} />
        <input className="field" type="number" step="0.01" min="0" placeholder="Preço de venda" value={price} onChange={e=>setPrice(e.target.value)} required />
        <input className="field" type="number" step="0.001" min="0" placeholder="Estoque inicial" value={stock} onChange={e=>setStock(e.target.value)} />
        <button className="button primary" disabled={loading}>{loading?"Salvando...":"Cadastrar produto"}</button>
      </form>
      {message && <div className="error">{message}</div>}
    </div>
    <div className="panel">
      <h2>Produtos cadastrados <span className="count">{products.length}</span></h2>
      <div className="table-wrap"><table><thead><tr><th>Produto</th><th>SKU</th><th>Preço</th><th>Estoque</th></tr></thead><tbody>
        {products.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small>{p.barcode||"Sem código"}</small></td><td>{p.sku||"—"}</td><td>R$ {Number(p.sale_price).toFixed(2).replace(".",",")}</td><td className={Number(p.stock_quantity)<=Number(p.minimum_stock)?"low-stock":""}>{p.stock_quantity} {p.unit}</td></tr>)}
        {!products.length && <tr><td colSpan={4}>Nenhum produto cadastrado.</td></tr>}
      </tbody></table></div>
    </div>
  </div>;
}