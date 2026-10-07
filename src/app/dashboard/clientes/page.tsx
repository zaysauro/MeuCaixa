"use client";

import { useEffect, useState } from "react";
import { ContextHelp } from "@/components/ContextHelp";
import { createClient } from "@/lib/supabase/client";

const wa = (value: string) => { const number = value.replace(/\D/g, ""); return number ? `https://wa.me/${number.startsWith("55") ? number : `55${number}`}` : ""; };
type Customer = { id: string; name: string; phone?: string | null; email?: string | null };

export default function ClientesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Customer[]>([]);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [message, setMessage] = useState("");
  async function load() { const { data, error } = await supabase.from("customers").select("id,name,phone,email").order("name"); if (error) setMessage(error.message); else setRows(data ?? []); }
  useEffect(() => { void load(); }, []);
  async function add(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setMessage(""); const { data: organization } = await supabase.rpc("get_my_organization"); const { error } = await supabase.from("customers").insert({ organization_id: organization?.[0]?.organization_id, name, phone: phone || null, email: email || null }); if (error) setMessage(error.message); else { setName(""); setPhone(""); setEmail(""); setMessage("Cliente cadastrado."); await load(); } }
  return <div className="page"><div className="page-header"><div><span className="eyebrow">RELACIONAMENTO</span><h1>Clientes</h1><p>Cadastre clientes para usar nas vendas.</p></div><ContextHelp title="Seus clientes" description="Cadastre seus clientes e mantenha os contatos sempre organizados. Assim fica mais fácil avisar sobre promoções, novidades e a chegada de novos produtos na sua loja." /></div><div className="panel"><h2>Novo cliente</h2><form className="form-grid" onSubmit={add}><input className="field" placeholder="Nome" value={name} onChange={event => setName(event.target.value)} required/><input className="field" placeholder="Telefone" value={phone} onChange={event => setPhone(event.target.value)}/><input className="field" type="email" placeholder="E-mail" value={email} onChange={event => setEmail(event.target.value)}/><button className="button primary">Cadastrar</button></form>{message && <div className={message === "Cliente cadastrado." ? "success" : "error"}>{message}</div>}</div><div className="panel"><h2>Clientes <span className="count">{rows.length}</span></h2><div className="table-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.phone ? <a href={wa(row.phone)} target="_blank" rel="noreferrer">{row.phone}</a> : "—"}</td><td>{row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : "—"}</td></tr>)}{!rows.length && <tr><td colSpan={3}>Nenhum cliente cadastrado.</td></tr>}</tbody></table></div></div></div>;
}
