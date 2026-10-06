"use client";

import { useEffect, useState } from "react";
import { ContextHelp } from "@/components/ContextHelp";
import { createClient } from "@/lib/supabase/client";

type Supplier = { id: string; name: string; document?: string | null; phone?: string | null };
export default function FornecedoresPage() {
  const supabase = createClient(); const [rows, setRows] = useState<Supplier[]>([]); const [name, setName] = useState(""); const [document, setDocument] = useState(""); const [phone, setPhone] = useState(""); const [message, setMessage] = useState("");
  async function load() { const { data, error } = await supabase.from("suppliers").select("id,name,document,phone").order("name"); if (error) setMessage(error.message); else setRows(data ?? []); }
  useEffect(() => { void load(); }, []);
  async function add(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setMessage(""); const { data: organization } = await supabase.rpc("get_my_organization"); const { error } = await supabase.from("suppliers").insert({ organization_id: organization?.[0]?.organization_id, name, document: document || null, phone: phone || null }); if (error) setMessage(error.message); else { setName(""); setDocument(""); setPhone(""); setMessage("Fornecedor cadastrado."); await load(); } }
  return <div className="page"><div className="page-header"><div><span className="eyebrow">COMPRAS</span><h1>Fornecedores</h1><p>Organize os parceiros que abastecem sua empresa.</p></div><ContextHelp title="Seus fornecedores" description="Mantenha os contatos dos seus fornecedores organizados para encontrar rapidamente quem fornece cada mercadoria e facilitar seus pedidos de reposição." /></div><div className="panel"><h2>Novo fornecedor</h2><form className="form-grid" onSubmit={add}><input className="field" placeholder="Nome da empresa" value={name} onChange={event => setName(event.target.value)} required/><input className="field" placeholder="CNPJ/CPF" value={document} onChange={event => setDocument(event.target.value)}/><input className="field" placeholder="Telefone" value={phone} onChange={event => setPhone(event.target.value)}/><button className="button primary">Cadastrar</button></form>{message && <div className={message === "Fornecedor cadastrado." ? "success" : "error"}>{message}</div>}</div><div className="panel"><h2>Fornecedores <span className="count">{rows.length}</span></h2><div className="table-wrap"><table><thead><tr><th>Empresa</th><th>Documento</th><th>Telefone</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.document || "—"}</td><td>{row.phone || "—"}</td></tr>)}{!rows.length && <tr><td colSpan={3}>Nenhum fornecedor cadastrado.</td></tr>}</tbody></table></div></div></div>;
}
