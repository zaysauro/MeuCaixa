"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasswordField from "@/components/PasswordField";

export default function ConvitePage() {
  const router = useRouter(); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [message, setMessage] = useState("Validando seu convite..."); const [ready, setReady] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => { void (async () => { const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setMessage("Abra o convite pelo e-mail recebido para continuar."); return; } const { error } = await supabase.rpc("team_accept_invite"); if (error && error.message !== "already_member") { setMessage("Este convite é inválido ou expirou."); return; } setReady(true); setMessage("Crie sua senha para acessar a empresa."); })(); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (password.length < 8 || password !== confirm) { setMessage("Confira a senha e a confirmação."); return; } setSaving(true); const { error } = await createClient().auth.updateUser({ password }); if (error) setMessage("Não foi possível definir a senha."); else router.replace("/dashboard"); setSaving(false); }
  return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="kumo-login-brand"><img className="kumo-logo" src="/kumo-logo.svg" alt="Kumo — Soluções em Tecnologia" /></div><span className="eyebrow">MEUCAIXA</span><h1>Acesso à empresa</h1><p>{message}</p>{ready && <><PasswordField label="Senha" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /><PasswordField label="Confirmar senha" value={confirm} confirmValue={password} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} required /><button className="button primary login-button" disabled={saving}>{saving ? "Salvando..." : "Entrar no MeuCaixa"}</button></>}</form></main>;
}
