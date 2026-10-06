import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BillingCheckoutButton } from "@/components/billing/BillingCheckoutButton";
import { hasValidBillingAccess } from "@/lib/billing/access";

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const dateBR = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "—";

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ autocheckout?: string; checkout?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: org } = await supabase.rpc("get_my_organization");
  if (!org?.length || !["owner", "admin"].includes(String(org[0].role))) redirect("/dashboard");

  const { data: billing } = await supabase.rpc("get_my_billing_status");
  const current = billing?.[0];
  const organizationId = org[0].organization_id;

  const { data: entitlement } = organizationId
    ? await supabase.from("organization_entitlements").select("trial_started_at,trial_ends_at").eq("organization_id", organizationId).maybeSingle()
    : { data: null };

  const { data: organization } = organizationId
    ? await supabase.from("organizations").select("base_monthly_price,additional_branch_price,included_branches").eq("id", organizationId).maybeSingle()
    : { data: null };

  const status = String(current?.status || "base");
  const hasAccess = hasValidBillingAccess(current);
  if (params.autocheckout === "1" && hasAccess) redirect("/dashboard");
  const statusLabels: Record<string, string> = {
    base: "Acesso cadastrado",
    trial: "Teste grátis",
    pending: "Aguardando pagamento",
    active: "Assinatura ativa",
    past_due: "Pagamento pendente",
    grace_period: "Período de regularização",
    suspended: "Acesso suspenso",
    cancelled: "Assinatura cancelada",
    canceled: "Assinatura cancelada",
  };
  const statusLabel = statusLabels[status] || "Status de cobrança desconhecido";
  const basePrice = Number(organization?.base_monthly_price ?? 79.99);
  const branchPrice = Number(organization?.additional_branch_price ?? 50);
  const branchCount = Number(current?.branch_count ?? 1);
  const includedBranches = Number(organization?.included_branches ?? 1);
  const monthlyPrice = basePrice + Math.max(0, branchCount - includedBranches) * branchPrice;
  const trialEnd = entitlement?.trial_ends_at ? new Date(entitlement.trial_ends_at) : null;
  const now = new Date();
  const trialDays = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000)) : null;
  const billingEnabled = process.env.BILLING_ENABLED === "true";

  const descriptions: Record<string, string> = {
    base: "Sua empresa está cadastrada e ainda não possui uma assinatura ativa.",
    trial: trialDays === 0 ? "Seu período experimental termina hoje." : `Seu período experimental está ativo. ${trialDays} ${trialDays === 1 ? "dia restante" : "dias restantes"}.`,
    pending: "A assinatura foi iniciada e estamos aguardando a confirmação do pagamento.",
    active: "Sua assinatura está ativa e o MeuCaixa está liberado.",
    past_due: "Existe um pagamento pendente. Regularize para manter o acesso.",
    grace_period: "O pagamento está atrasado e a conta está no período de regularização.",
    suspended: "A assinatura precisa ser regularizada para restaurar o acesso.",
    cancelled: "A assinatura foi cancelada. Você pode contratar novamente.",
    canceled: "A assinatura foi cancelada. Você pode contratar novamente.",
  };

  const checkoutLabel = ["past_due", "grace_period", "suspended"].includes(status) ? "Regularizar pagamento" : status === "pending" ? "Continuar pagamento" : "Assinar agora";
  const showCheckout = status !== "active";

  return (
    <div className="page">
      <div className="page-header"><div><span className="eyebrow">CONFIGURAÇÕES</span><h1>Upgrade</h1><p>Gerencie o período experimental e a assinatura do MeuCaixa.</p></div></div>
      <div className="panel">
        <h2>Plano atual</h2>
        <p>{descriptions[status] || "Não foi possível identificar o estado atual da assinatura."}</p>
        <div className="stats-row" style={{ marginTop: 20 }}>
          <div className="stat-card"><small>Status</small><strong>{statusLabel}</strong></div>
          <div className="stat-card"><small>Filiais ativas</small><strong>{branchCount}</strong></div>
          <div className="stat-card"><small>Mensalidade atual</small><strong>{brl(monthlyPrice)}</strong></div>
          <div className="stat-card"><small>{status === "trial" ? "Fim do teste" : "Próximo vencimento"}</small><strong>{status === "trial" ? dateBR(entitlement?.trial_ends_at) : current?.current_period_end ? dateBR(current.current_period_end) : "Nenhuma cobrança"}</strong></div>
        </div>
      </div>
      <div className="panel">
        <h2>Assinatura MeuCaixa</h2>
        <p>Plano base de {brl(basePrice)}/mês para a matriz. Cada filial adicional custa {brl(branchPrice)}/mês. Pagamento por Pix, boleto ou cartão processado pelo Asaas.</p>
        {status === "trial" && <p style={{ marginTop: 10 }}>Você pode assinar antes do fim do teste. Assim que o pagamento for confirmado, o status muda para <strong>Assinatura ativa</strong>.</p>}
        {status === "active" ? <div className="success" style={{ marginTop: 16 }}>Pagamento confirmado. Nenhuma ação necessária.</div> : billingEnabled && showCheckout ? <div style={{ marginTop: 18 }}><BillingCheckoutButton label={checkoutLabel} autoStart={params.autocheckout === "1"} /></div> : <p style={{ marginTop: 16 }}>Cobrança online temporariamente indisponível. Fale com a equipe Kumo.</p>}
      </div>
      <Link href="/dashboard/configuracoes">Voltar para configurações</Link>
    </div>
  );
}
