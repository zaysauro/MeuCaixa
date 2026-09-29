import { createClient } from "@/lib/supabase/server";
export default async function EstoquePage(){
 const supabase=await createClient();
 const {data}=await supabase.from("products").select("id,name,sku,stock_quantity,minimum_stock,unit,cost_price,sale_price").eq("active",true).order("name");
 const products=data??[];
 return <div className="page"><div className="page-header"><div><span className="eyebrow">OPERAÇÃO</span><h1>Estoque</h1><p>Acompanhe quantidade, custo e itens que precisam de reposição.</p></div></div>
 <div className="stats-row"><div className="stat-card"><small>Produtos</small><strong>{products.length}</strong></div><div className="stat-card"><small>Estoque baixo</small><strong>{products.filter(p=>Number(p.stock_quantity)<=Number(p.minimum_stock)).length}</strong></div><div className="stat-card"><small>Unidades</small><strong>{products.reduce((n,p)=>n+Number(p.stock_quantity),0).toLocaleString("pt-BR")}</strong></div></div>
 <div className="panel"><div className="table-wrap"><table><thead><tr><th>Produto</th><th>Estoque</th><th>Mínimo</th><th>Custo</th><th>Venda</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small>{p.sku||"Sem SKU"}</small></td><td className={Number(p.stock_quantity)<=Number(p.minimum_stock)?"low-stock":""}>{p.stock_quantity} {p.unit}</td><td>{p.minimum_stock}</td><td>R$ {Number(p.cost_price).toFixed(2).replace(".",",")}</td><td>R$ {Number(p.sale_price).toFixed(2).replace(".",",")}</td></tr>)}{!products.length&&<tr><td colSpan={5}>Cadastre produtos para começar a controlar o estoque.</td></tr>}</tbody></table></div></div>
 </div>;
}