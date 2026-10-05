"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      const signIn = supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "A conexão com o servidor demorou demais. Verifique as configurações do Supabase e tente novamente."
              )
            ),
          15000
        )
      );

      const { error } = await Promise.race([signIn, timeout]);

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const metadata = userData.user?.user_metadata ?? {};
      const { data: organization } = await supabase.rpc("get_my_organization");

      if (!organization?.length && metadata.company_name) {
        const { error: onboardingError } = await supabase.rpc("complete_onboarding", {
          p_company_name: String(metadata.company_name),
          p_branch_name: "Matriz",
        });
        if (onboardingError) {
          setMessage("Login realizado, mas não conseguimos concluir a criação da empresa.");
          setLoading(false);
          return;
        }
        if (metadata.signup_mode !== "subscribe") {
          const { error: trialError } = await supabase.rpc("start_my_trial");
          if (trialError) {
            setMessage("Empresa criada, mas não conseguimos iniciar o período experimental.");
            setLoading(false);
            return;
          }
        }
      }

      if (organization?.length && metadata.signup_mode === "trial") {
        const { data: billing } = await supabase.rpc("get_my_billing_status");
        if (billing?.[0]?.status === "base") {
          const { error: trialError } = await supabase.rpc("start_my_trial");
          if (trialError) {
            setMessage("Não conseguimos iniciar o período experimental.");
            setLoading(false);
            return;
          }
        }
      }

      const destination = metadata.signup_mode === "subscribe" && !next
        ? "/dashboard/configuracoes/upgrade?autocheckout=1"
        : next?.startsWith("/") ? next : "/dashboard";
      window.location.assign(destination);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível entrar. Tente novamente."
      );
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="kumo-login-brand">
          <img
            className="kumo-logo"
            src="/kumo-logo.svg"
            alt="Kumo — Soluções em Tecnologia"
          />
        </div>

        <span className="eyebrow">MEUCAIXA</span>
        <h1>Entrar</h1>
        <p>Acesse o painel da sua empresa.</p>

        <div className="login-fields">
          <input
            className="field"
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="field"
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {message && <div className="error">{message}</div>}

        <button className="button primary login-button" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
