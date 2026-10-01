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

      // Navegação completa para garantir que os cookies da sessão
      // sejam reconhecidos pelo middleware/server do Next.js.
      window.location.assign("/dashboard");
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
