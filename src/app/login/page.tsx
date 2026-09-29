"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setMessage(error.message);
    else window.location.href = "/dashboard";

    setLoading(false);
  }

  return <main className="landing"><form className="landing-card" onSubmit={handleSubmit}>
    <div className="kumo-login-brand"><img className="kumo-logo" src="/kumo-logo.svg" alt="Kumo — Soluções em Tecnologia" /></div><span className="eyebrow">MEUCAIXA</span>
    <h1>Entrar</h1>
    <p>Acesse o painel da sua empresa.</p>
    <input className="field" type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required />
    <input className="field" type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} required />
    {message && <div className="error">{message}</div>}
    <button className="button primary" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
  </form></main>;
}