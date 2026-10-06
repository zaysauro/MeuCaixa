"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Check, LockKeyhole, Store } from "lucide-react";
import PasswordField from "@/components/PasswordField";

function CadastroForm() {
  const searchParams = useSearchParams();
  const subscribe = searchParams.get("mode") === "subscribe";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const company = String(form.get("company") || "").trim();
    const email = String(form.get("email") || "").trim();
    if (!name || !company || !email || password.length < 8) {
      setError("Preencha os campos. A senha deve ter pelo menos 8 caracteres."); setLoading(false); return;
    }
    if (password !== confirmPassword) { setError("As senhas não coincidem."); setLoading(false); return; }
    if (!accepted) { setError("Aceite os Termos de Uso e a Política de Privacidade para continuar."); setLoading(false); return; }

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: "https://meucaixa.sistemakumo.com.br/login",
        data: {
          full_name: name,
          company_name: company,
          signup_mode: subscribe ? "subscribe" : "trial", terms_version: "2026-10-06", privacy_version: "2026-10-06",
        },
      },
    });
    if (signUpError) { setError(signUpError.message); setLoading(false); return; }

    if (subscribe) {
      if (data.user?.identities?.length === 0) {
        setError("Este e-mail já possui uma conta. Entre no MeuCaixa para continuar a assinatura.");
        setLoading(false);
        return;
      }

      if (!data.user?.id) {
        setError("Sua conta foi criada, mas não conseguimos iniciar o pagamento. Tente novamente.");
        setLoading(false);
        return;
      }

      const checkoutResponse = await fetch("/api/billing/subscribe-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id, email, company, acceptedTerms: true }),
      });
      const checkoutBody = await checkoutResponse.json().catch(() => ({}));
      if (!checkoutResponse.ok || !checkoutBody.url) {
        setError(checkoutBody.error || "Não foi possível abrir o pagamento agora.");
        setLoading(false);
        return;
      }

      window.location.assign(checkoutBody.url);
      return;
    }

    if (!data.session) {
      setMessage("Cadastro criado. Confirme seu e-mail e entre no MeuCaixa para iniciar seus 7 dias grátis.");
      setLoading(false);
      return;
    }

    const { error: onboardingError } = await supabase.rpc("complete_onboarding", {
      p_company_name: company, p_branch_name: "Matriz",
    });
    if (onboardingError) { setError("Sua conta foi criada, mas não conseguimos criar a empresa. Entre novamente para concluir o cadastro."); setLoading(false); return; }

    const { error: trialError } = await supabase.rpc("start_my_trial");
    if (trialError) { setError("Empresa criada, mas não conseguimos iniciar o teste grátis. Tente entrar novamente."); setLoading(false); return; }
    const { data: createdOrg } = await supabase.rpc("get_my_organization");
    const acceptedUserId = data.user?.id;
    if (acceptedUserId) await supabase.from("legal_acceptances").upsert({ user_id: acceptedUserId, organization_id: createdOrg?.[0]?.organization_id ?? null, terms_version: "2026-10-06", privacy_version: "2026-10-06", source: "trial_signup" }, { onConflict: "user_id,terms_version,privacy_version" });

    window.location.assign("/dashboard");
  }

  return (
    <main className="signup-page">
      <div className="signup-shell">
        <section className="signup-intro">
          <Link href="/" className="signup-back"><ArrowLeft size={16} /> Voltar ao MeuCaixa</Link>
          <div className="signup-brand"><img src="/kumo-logo.svg" alt="Kumo — Soluções em Tecnologia" /><span>Meu<span>Caixa</span></span></div>
          <div className="signup-copy">
            <span className="signup-kicker">{subscribe ? "ASSINATURA MEUCAIXA" : "7 DIAS GRÁTIS"}</span>
            <h1>{subscribe ? "Comece a usar o MeuCaixa hoje." : "Sua operação organizada em poucos minutos."}</h1>
            <p>{subscribe ? "Crie sua empresa e siga para o pagamento mensal seguro pelo Asaas." : "Crie sua conta, cadastre sua empresa e teste vendas, estoque, caixa e financeiro antes de assinar."}</p>
          </div>
          <div className="signup-benefits">
            <span><Check size={16} /> PDV, estoque, caixa e financeiro</span>
            <span><Check size={16} /> R$ 79,99/mês para a matriz</span>
            <span><Check size={16} /> Filiais adicionais por R$ 50/mês</span>
          </div>
          <div className="signup-security"><LockKeyhole size={15} /> Seus dados ficam vinculados somente à sua empresa.</div>
        </section>

        <section className="signup-form-side">
          <div className="signup-card">
            <div className="signup-card-icon"><Store size={20} /></div>
            <span className="signup-step">CRIE SUA EMPRESA</span>
            <h2>{subscribe ? "Criar conta e assinar" : "Começar teste grátis"}</h2>
            <p>{subscribe ? "Depois do cadastro, você será direcionado ao pagamento seguro." : "Sem cobrança agora. O teste dura 7 dias."}</p>
            <form onSubmit={submit} className="signup-form">
              <label>Seu nome<input className="field" name="name" autoComplete="name" placeholder="Como devemos chamar você?" required /></label>
              <label>Nome da empresa<input className="field" name="company" autoComplete="organization" placeholder="Ex.: Mercado Central" required /></label>
              <label>E-mail<input className="field" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required /></label>
              <PasswordField label="Senha" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
              <PasswordField label="Confirmar senha" value={confirmPassword} confirmValue={password} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
              <label className="check-row"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /> Li e aceito os <a href="https://sistemakumo.com.br/termos" target="_blank" rel="noreferrer">Termos de Uso</a> e a <a href="https://sistemakumo.com.br/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>.</label>
              <button className="button primary signup-submit" disabled={loading} type="submit">{loading ? "Criando sua conta..." : subscribe ? "Criar conta e continuar" : "Começar meus 7 dias grátis"}</button>
            </form>
            {error ? <div className="error signup-feedback">{error}</div> : null}
            {message ? <div className="success signup-feedback">{message}</div> : null}
            <div className="signup-login">Já tem uma conta? <Link href={subscribe ? "/login?next=/dashboard/configuracoes/upgrade?autocheckout=1" : "/login"}>Entrar no MeuCaixa</Link></div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function CadastroPage() {
  return <Suspense fallback={null}><CadastroForm /></Suspense>;
}
