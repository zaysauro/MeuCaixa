'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getPublicSiteUrl } from '@/lib/site-url';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(''); setMessage(''); const origin = getPublicSiteUrl(); const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${origin}/redefinir-senha` }); if (resetError) setError('Não foi possível enviar o e-mail de recuperação.'); else setMessage('Se o e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.'); setLoading(false); }
  return <main className="login-page"><section className="login-card"><div className="kumo-login-brand"><img className="kumo-logo" src="/kumo-logo.svg" alt="Kumo — Soluções em Tecnologia" /></div><span className="eyebrow">MEUCAIXA</span><h1>Esqueci minha senha</h1><p>Informe o e-mail usado no MeuCaixa.</p><form onSubmit={submit} className="login-form"><input className="field" type="email" placeholder="E-mail" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required />{error && <div className="error">{error}</div>}{message && <div className="success">{message}</div>}<button className="button primary login-button" disabled={loading}>{loading ? 'Enviando...' : 'Enviar link de recuperação'}</button></form><div className="login-links"><Link href="/login">Voltar para o login</Link></div></section></main>;
}
