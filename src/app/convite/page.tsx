"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordField from "@/components/PasswordField";

export default function ConvitePage() {
  const router = useRouter(); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [message, setMessage] = useState("Validando seu convite..."); const [ready, setReady] = useState(false); const [existingUser, setExistingUser] = useState(false); const [saving, setSaving] = useState(false);
  useEffect(() => { void (async () => { const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) { setMessage("Entre na sua conta para aceitar o convite."); return; } const isNewInviteUser = typeof user.user_metadata?.invited_organization_id === "string"; if (isNewInviteUser) { setReady(true); setMessage("Crie sua senha para acessar sua conta."); return; } const { error } = await supabase.rpc("team_accept_invite"); if (error && error.message !== "already_member") { setMessage("Este convite é inválido ou expirou."); return; } setExistingUser(true); setMessage("Convite aceito. Sua conta já está pronta para acessar a empresa."); })(); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (password.length < 8 || password !== confirm) { setMessage("Confira a senha e a confirmação."); return; } setSaving(true); const supabase = createClient(); const { error: passwordError } = await supabase.auth.updateUser({ password }); if (passwordError) { setMessage("Não foi possível definir a senha."); setSaving(false); return; } const { error: inviteError } = await supabase.rpc("team_accept_invite"); if (inviteError && inviteError.message !== "already_member") setMessage("A senha foi criada, mas não conseguimos ativar o acesso à empresa."); else router.replace("/dashboard"); setSaving(false); }
  return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="kumo-login-brand"><img className="kumo-logo" src="/kumo-logo.svg" alt="Kumo — Soluções em Tecnologia" /></div><span className="eyebrow">MEUCAIXA</span><h1>Acesso à empresa</h1><p>{message}</p>{!ready && !existingUser && <Link className="login-links" href="/login?next=/convite">Entrar para aceitar o convite</Link>}{existingUser && <button type="button" className="button primary login-button" onClick={() => router.replace("/dashboard")}>Acessar o MeuCaixa</button>}{ready && <><PasswordField label="Senha" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /><PasswordField label="Confirmar senha" value={confirm} confirmValue={password} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} required /><button className="button primary login-button" disabled={saving}>{saving ? "Salvando..." : "Criar senha e acessar"}</button></>}</form></main>;
}
