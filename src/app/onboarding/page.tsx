"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const [company, setCompany] = useState("");
  const [branch, setBranch] = useState("Matriz");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("create_organization", {
      organization_name: company,
      branch_name: branch,
    });
    if (error) setMessage(error.message);
    else window.location.href = "/dashboard";
    setLoading(false);
  }

  return <main className="landing">
    <form className="landing-card" onSubmit={submit}>
      <span className="eyebrow">PRIMEIRO ACESSO</span>
      <h1>Configure sua empresa</h1>
      <p>Essas informações serão usadas para organizar seu caixa, estoque e vendas.</p>
      <label>Nome da empresa<input className="field" value={company} onChange={e=>setCompany(e.target.value)} placeholder="Ex.: Mercado do Bruno" required /></label>
      <label>Primeira unidade<input className="field" value={branch} onChange={e=>setBranch(e.target.value)} placeholder="Matriz" required /></label>
      {message && <div className="error">{message}</div>}
      <button className="button primary" disabled={loading}>{loading ? "Configurando..." : "Continuar"}</button>
    </form>
  </main>;
}