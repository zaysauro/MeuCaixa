"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const [company, setCompany] = useState("");
  const [branch, setBranch] = useState("Matriz");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: status, error: statusError } = await supabase.rpc(
        "get_onboarding_status"
      );

      if (statusError) {
        setMessage(statusError.message);
        setLoading(false);
        return;
      }

      if (status?.[0]?.has_organization) {
        window.location.href = "/dashboard";
        return;
      }

      const metadata = user.user_metadata ?? {};
      const metadataCompany =
        typeof metadata.company_name === "string"
          ? metadata.company_name.trim()
          : "";

      const metadataName =
        typeof metadata.full_name === "string"
          ? metadata.full_name.trim()
          : "";

      if (metadataCompany) {
        setCompany(metadataCompany);
      } else if (metadataName) {
        setCompany("");
      }

      setLoading(false);
    }

    load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();

    const companyName = company.trim();
    const branchName = branch.trim() || "Matriz";

    if (!companyName) {
      setMessage("Informe o nome da empresa.");
      return;
    }

    setLoading(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc("complete_onboarding", {
      p_company_name: companyName,
      p_branch_name: branchName,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  if (loading) {
    return (
      <main className="landing">
        <div className="landing-card">
          <span className="eyebrow">MEUCAIXA</span>
          <h1>Preparando sua conta...</h1>
          <p>Estamos verificando a configuração da sua empresa.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="landing">
      <form className="landing-card" onSubmit={submit}>
        <div className="kumo-login-brand">
          <img
            className="kumo-logo"
            src="/kumo-logo.svg"
            alt="Kumo — Soluções em Tecnologia"
          />
        </div>

        <span className="eyebrow">PRIMEIRO ACESSO</span>

        <h1>Configure sua empresa</h1>

        <p>
          O nome da empresa aparecerá no MeuCaixa para você e para todos os
          funcionários da empresa.
        </p>

        <label>
          Nome da empresa
          <input
            className="field"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Ex.: Mercado do Bruno"
            autoComplete="organization"
            required
          />
        </label>

        <label>
          Primeira unidade
          <input
            className="field"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="Matriz"
            autoComplete="organization-title"
            required
          />
        </label>

        {message && <div className="error">{message}</div>}

        <button className="button primary" disabled={loading}>
          {loading ? "Configurando..." : "Entrar no MeuCaixa"}
        </button>
      </form>
    </main>
  );
}
