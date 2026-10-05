"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CadastroPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const company = String(form.get("company") || "").trim();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    if (!name || !company || !email || password.length < 8) {
      setError("Preencha os campos. A senha deve ter pelo menos 8 caracteres."); setLoading(false); return;
    }

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: name } },
    });
    if (signUpError) { setError(signUpError.message); setLoading(false); return; }

    if (!data.session) {
      setMessage("Cadastro criado. Confirme seu e-mail e depois entre no MeuCaixa para concluir a criação da empresa.");
      setLoading(false); return;
    }

    const { error: onboardingError } = await supabase.rpc("complete_onboarding", {
      p_company_name: company, p_branch_name: "Matriz",
    });
    if (onboardingError) { setError("Sua conta foi criada, mas não conseguimos criar a empresa. Entre novamente para concluir o cadastro."); setLoading(false); return; }

    const { error: trialError } = await supabase.rpc("start_my_trial");
    if (trialError) { setError("Empresa criada, mas não conseguimos iniciar o teste grátis. Tente entrar novamente."); setLoading(false); return; }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" aria-label="Voltar para MeuCaixa"><img src="/kumo-logo.svg" alt="Kumo" style={{ maxWidth: 150 }} /></Link>
        <h1>Teste o MeuCaixa por 7 dias</h1>
        <p>Crie sua empresa e sua matriz. Você só paga se decidir continuar.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Seu nome<input name="name" autoComplete="name" required /></label>
          <label>Nome da empresa<input name="company" autoComplete="organization" required /></label>
          <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
          <label>Senha<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
          <button className="button primary" disabled={loading} type="submit">{loading ? "Criando..." : "Começar teste grátis"}</button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p>{message}</p> : null}
        <p>Já tem uma conta? <Link href="/login">Entrar</Link></p>
      </section>
    </main>
  );
}
