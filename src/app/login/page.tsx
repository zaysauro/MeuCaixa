"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import PasswordField from "@/components/PasswordField";
import { hasValidBillingAccess, sanitizeLoginNext } from "@/lib/billing/access";
import { getPublicSiteUrl } from "@/lib/site-url";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const confirmed = searchParams.get("confirmed") === "1";
  const authError = searchParams.get("auth_error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(confirmed ? "E-mail confirmado com sucesso. Entre na sua conta para continuar." : authError || "");
  const [loading, setLoading] = useState(false);
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage("");
    setCanResendConfirmation(false);

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
        if (error.code === "email_not_confirmed" || error.message.toLowerCase().includes("email not confirmed")) {
          setMessage("Confirme seu e-mail para continuar. Enviamos um link de confirmação para você.");
          setCanResendConfirmation(true);
        } else {
          setMessage("Não foi possível entrar. Verifique seu e-mail e sua senha.");
        }
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const metadata = userData.user?.user_metadata ?? {};
      const { data: organization } = await supabase.rpc("get_my_organization");

      if (next === "/convite") {
        window.location.assign("/convite");
        return;
      }

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
            setMessage("Não foi possível concluir a configuração da sua conta. Tente novamente ou entre em contato com o suporte.");
            setLoading(false);
            return;
          }
        }
      }

      if (organization?.length && metadata.signup_mode === "trial") {
        const { data: billing } = await supabase.rpc("get_my_billing_status");
        const billingStatus = billing?.[0]?.status;
        if (!billing?.length || billingStatus === "base" || billingStatus === "trial") {
          const { error: trialError } = await supabase.rpc("start_my_trial");
          if (trialError) {
            setMessage("Não foi possível concluir a configuração da sua conta. Tente novamente ou entre em contato com o suporte.");
            setLoading(false);
            return;
          }
        }
      }

      const { data: billing } = await supabase.rpc("get_my_billing_status");
      const hasAccess = hasValidBillingAccess(billing?.[0]);
      const destination = sanitizeLoginNext(next, hasAccess);
      console.info("login access decision", { hasAccess, billingStatus: billing?.[0]?.status ?? "missing" });
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

  async function resendConfirmation() {
    if (loading || !email.trim()) return;
    setLoading(true);
    const { error } = await createClient().auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${getPublicSiteUrl()}/auth/callback?flow=signup` },
    });
    setMessage(error ? "Não foi possível reenviar o e-mail de confirmação." : "Enviamos um novo e-mail de confirmação para você.");
    setLoading(false);
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
          <PasswordField label="Senha" className="login-password-field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>

        {message && <div className="error">{message}</div>}
        {canResendConfirmation && <button className="login-links" type="button" onClick={resendConfirmation}>Reenviar e-mail de confirmação</button>}

        <button className="button primary login-button" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
        <Link href="/esqueci-senha" className="login-forgot">Esqueci minha senha</Link>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
