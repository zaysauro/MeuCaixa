import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function UpgradePage() {
  const supabase = await createClient();
  const { data: org } = await supabase.rpc("get_my_organization");
  if (!org?.length || !["owner", "admin"].includes(String(org[0].role))) redirect("/dashboard");
  const { data: billing } = await supabase.rpc("get_my_billing_status");
  const current = billing?.[0];
  return <div className="page"><div className="page-header"><div><span className="eyebrow">CONFIGURAÇÕES</span><h1>Upgrade</h1><p>Quando a cobrança estiver disponível, este será o ponto de ativação de recursos comerciais.</p></div></div><div className="panel"><h2>Plano atual</h2><p>Base, sem contratação ativa.</p><div className="stats-row"><div className="stat-card"><small>Filiais</small><strong>{current?.branch_count ?? 1} / {current?.branch_limit ?? 1}</strong></div><div className="stat-card"><small>Status</small><strong>Não contratado</strong></div></div></div><div className="panel"><h2>Mais unidades</h2><p>A arquitetura de cobrança e limites já está preparada, mas nenhum pagamento é simulado ou ativado por esta tela.</p><button className="button secondary" disabled>Checkout em preparação</button></div><Link href="/dashboard/configuracoes">Voltar para configurações</Link></div>;
}
