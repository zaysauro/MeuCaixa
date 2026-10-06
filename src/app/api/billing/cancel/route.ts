import { NextResponse } from "next/server";
import { cancelAsaasSubscription } from "@/lib/billing/asaas";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { data: org } = await supabase.rpc("get_my_organization");
  const current = org?.[0];
  if (!current || !["owner", "admin"].includes(String(current.role))) return NextResponse.json({ error: "Somente o administrador da empresa pode cancelar a assinatura." }, { status: 403 });
  const admin = createAdminClient();
  const { data: entitlement, error } = await admin.from("organization_entitlements").select("asaas_subscription_id,current_period_end,access_until,cancel_at_period_end").eq("organization_id", current.organization_id).single();
  if (error || !entitlement) return NextResponse.json({ error: "Status de cobrança indisponível." }, { status: 500 });
  if (entitlement.cancel_at_period_end) return NextResponse.json({ canceled: true, accessUntil: entitlement.access_until || entitlement.current_period_end });
  if (!entitlement.asaas_subscription_id) return NextResponse.json({ error: "Não existe uma assinatura recorrente ativa para cancelar." }, { status: 409 });
  try { await cancelAsaasSubscription(entitlement.asaas_subscription_id); }
  catch (cause) { console.error("Asaas cancellation failed", { organizationId: current.organization_id, error: cause }); return NextResponse.json({ error: "O Asaas não confirmou o cancelamento. Nenhuma alteração local foi feita." }, { status: 502 }); }
  const accessUntil = entitlement.access_until || entitlement.current_period_end || new Date().toISOString();
  const { error: updateError } = await admin.from("organization_entitlements").update({ cancel_at_period_end: true, canceled_at: new Date().toISOString(), access_until: accessUntil, updated_at: new Date().toISOString() }).eq("organization_id", current.organization_id).eq("asaas_subscription_id", entitlement.asaas_subscription_id);
  if (updateError) return NextResponse.json({ error: "O Asaas foi cancelado, mas não foi possível salvar o período de acesso. Contate o suporte antes de tentar novamente." }, { status: 500 });
  return NextResponse.json({ canceled: true, accessUntil });
}
