import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BillingCheckoutButton } from "@/components/billing/BillingCheckoutButton";
import { hasValidBillingAccess } from "@/lib/billing/access";
import { CancelSubscriptionButton } from "@/components/billing/CancelSubscriptionButton";
import { Mail, MessageCircle } from "lucide-react";
import { emailLink, whatsappLink } from "@/lib/marketing/contact";

const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const dateBR = (value?: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "—";

export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ autocheckout?: string; checkout?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: org } = await supabase.rpc("get_my_organization");
  if (!org?.length || !["owner", "admin"].includes(String(org[0].role))) redirect("/dashboard");

  const { data: billing } = await supabase.rpc("get_my_billing_status");
  const current = billing?.[0];
  const { data: access } = await supabase.rpc("get_my_company_access");
  const accessState = access?.[0];
  const organizationId = org[0].organization_id;

  const { data: entitlement } = organizationId
    ? await supabase.from("organization_entitlements").select("trial_started_at,trial_ends_at,cancel_at_period_end,canceled_at,access_until").eq("organization_id", organizationId).maybeSingle()
    : { data: null };

  const { data: organization } = organizationId
    ? await supabase.from("organizations").select("base_monthly_price,additional_branch_price,included_branches,billing_branch_count").eq("id", organizationId).maybeSingle()
    : { data: null };

  const status = String(current?.status || "base");
  const hasAccess = hasValidBillingAccess(current);
  const accessGranted = accessState?.has_access === true || hasAccess;
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
  const canceling = current?.cancel_at_period_end === true;
  const statusLabel = canceling ? "Cancelamento agendado" : statusLabels[status] || "Status de cobrança desconhecido";
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
  const blockedMessage = !accessGranted ? ({
    trial_expired: {
      title: "Seu período de teste terminou",
      text: "Seu teste gratuito chegou ao fim. Assine o MeuCaixa para continuar acessando sua empresa.",
    },
    payment_overdue: {
      title: "Pagamento pendente",
      text: "Ainda não identificamos a regularização do pagamento da sua assinatura.",
    },
    entitlement_invalid: {
      title: "Acesso temporariamente suspenso",
      text: "Não identificamos uma assinatura ou período de teste válido para esta empresa.",
    },
    entitlement_missing: {
      title: "Acesso temporariamente suspenso",
      text: "Esta empresa ainda não possui um período de acesso ativo.",
    },
    subscription_expired: {
      title: "Assinatura expirada",
      text: "A assinatura desta empresa não está mais ativa. Regularize o acesso para continuar usando o MeuCaixa.",
    },
  } as Record<string, { title: string; text: string }>)[String(accessState?.access_reason || status)] || {
    title: "Acesso temporariamente suspenso",
    text: "Não identificamos um período de acesso ativo para esta empresa.",
  } : null;
  const supportMessage = "Olá! Preciso de ajuda para regularizar o acesso da minha empresa no MeuCaixa.";

  return (
    <div className="page">
      <div className="page-header"><div><span className="eyebrow">CONFIGURAÇÕES</span><h1>Upgrade</h1><p>Gerencie o período experimental e a assinatura do MeuCaixa.</p></div></div>
      {blockedMessage && <div className="billing-blocked-alert" role="alert">
        <div><span className="eyebrow">ACESSO DA EMPRESA</span><h2>{blockedMessage.title}</h2><p>{blockedMessage.text}</p><p>Se você já realizou o pagamento ou está com dificuldades para regularizar o acesso, fale com nosso suporte.</p></div>
        <div className="billing-blocked-actions">
          {billingEnabled && showCheckout && !canceling && <BillingCheckoutButton label={checkoutLabel === "Assinar agora" ? "Regularizar assinatura" : checkoutLabel} initialBranches={Number(organization?.billing_branch_count ?? organization?.included_branches ?? 1)} basePrice={basePrice} branchPrice={branchPrice} />}
          <a className="button secondary" href={whatsappLink(supportMessage)} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Falar com o suporte</a>
          <a className="button secondary" href={emailLink(supportMessage)}><Mail size={16} /> Por e-mail</a>
        </div>
      </div>}
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
        {canceling && <div className="success" style={{ marginTop: 16 }}>A renovação foi cancelada. Seu acesso permanece até {dateBR(current?.access_until || current?.current_period_end)}.</div>}
        {status === "active" && !canceling ? <div style={{ marginTop: 16 }}><div className="success">Pagamento confirmado. Nenhuma ação necessária.</div><div style={{ marginTop: 14 }}><CancelSubscriptionButton /></div></div> : billingEnabled && showCheckout && !canceling ? <div style={{ marginTop: 18 }}><BillingCheckoutButton label={checkoutLabel} autoStart={params.autocheckout === "1"} initialBranches={Number(organization?.billing_branch_count ?? organization?.included_branches ?? 1)} basePrice={basePrice} branchPrice={branchPrice} /></div> : !canceling && <p style={{ marginTop: 16 }}>Cobrança online temporariamente indisponível. Fale com a equipe Kumo.</p>}
      </div>
      <p className="sub" style={{ marginTop: 14 }}><a href="https://sistemakumo.com.br/termos" target="_blank" rel="noreferrer">Termos de Uso</a> · <a href="https://sistemakumo.com.br/privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a></p>
      <Link href="/dashboard/configuracoes">Voltar para configurações</Link>
    </div>
  );
}
