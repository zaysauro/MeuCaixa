"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function CadastroPage() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, company_name: company } },
    });

    if (error) setMessage(error.message);
    else if (data.session) window.location.href = "/dashboard";
    else setMessage("Conta criada. Confirme seu e-mail para continuar.");

    setLoading(false);
  }

  return <main className="landing"><form className="landing-card" onSubmit={handleSubmit}>
    <span className="eyebrow">COMECE AGORA</span>
    <h1>Criar conta</h1>
    <p>Crie o acesso da sua empresa ao MeuCaixa.</p>
    <input className="field" placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)} required />
    <input className="field" placeholder="Nome da empresa" value={company} onChange={e => setCompany(e.target.value)} required />
    <input className="field" type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required />
    <input className="field" type="password" minLength={6} placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} required />
    {message && <div className="error">{message}</div>}
    <button className="button primary" disabled={loading}>{loading ? "Criando..." : "Criar conta"}</button>
  </form></main>;
}