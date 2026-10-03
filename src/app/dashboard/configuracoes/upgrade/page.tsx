import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BillingCheckoutButton } from "@/components/billing/BillingCheckoutButton";

export default async function UpgradePage() {
  const supabase = await createClient();
  const { data: org } = await supabase.rpc("get_my_organization");
  if (!org?.length || !["owner", "admin"].includes(String(org[0].role))) redirect("/dashboard");
  const { data: billing } = await supabase.rpc("get_my_billing_status");
  const current = billing?.[0];
  const billingEnabled = process.env.BILLING_ENABLED === "true";
  const statusLabel = current?.status === "active" ? "Ativo" : current?.status === "past_due" ? "Pagamento pendente" : current?.status === "pending" ? "Aguardando pagamento" : "Legado / sem cobrança";
  return <div className="page"><div className="page-header"><div><span className="eyebrow">CONFIGURAÇÕES</span><h1>Upgrade</h1><p>Plano de R$ 59,90 por mês por empresa, com cobrança hospedada pelo Asaas.</p></div></div><div className="panel"><h2>Plano atual</h2><p>{current?.status === "active" ? "Sua assinatura está ativa." : "Organização existente preservada sem bloqueio automático."}</p><div className="stats-row"><div className="stat-card"><small>Filiais</small><strong>{current?.branch_count ?? 1} / {current?.branch_limit ?? 1}</strong></div><div className="stat-card"><small>Status</small><strong>{statusLabel}</strong></div><div className="stat-card"><small>Próximo vencimento</small><strong>{current?.current_period_end ? new Date(current.current_period_end).toLocaleDateString("pt-BR") : "A definir"}</strong></div></div></div><div className="panel"><h2>Assinatura MeuCaixa</h2><p>Pagamento mensal por Pix, boleto ou cartão. O Asaas hospeda os dados de pagamento; esta tela não armazena cartão.</p>{billingEnabled ? <BillingCheckoutButton label={current?.status === "past_due" ? "Regularizar pagamento" : "Assinar agora"} /> : <><p>Checkout integrado em preparação. Enquanto isso, fale com a equipe para contratar.</p><a className="button secondary" href="#contato">Falar com o suporte</a></>}</div><Link href="/dashboard/configuracoes">Voltar para configurações</Link></div>;
}
