import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const encoder = new TextEncoder();
async function sameToken(actual: string, expected: string) {
  const a = encoder.encode(actual); const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  let result = 0; for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}

type AsaasPayload = {
  id?: string;
  event?: string;
  checkout?: { id?: string; status?: string; externalReference?: string };
  payment?: { subscription?: string; customer?: string; status?: string; billingType?: string; dueDate?: string; externalReference?: string };
  subscription?: { id?: string; customer?: string; status?: string; billingType?: string; nextDueDate?: string; externalReference?: string };
};

export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  const actual = request.headers.get("asaas-access-token") ?? "";
  if (!expected || !(await sameToken(actual, expected))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null) as AsaasPayload | null;
  if (!payload?.id || !payload.event) return NextResponse.json({ error: "Invalid event" }, { status: 400 });

  const admin = createAdminClient();
  const { error: eventError } = await admin.from("billing_events").insert({
    provider_event_id: payload.id,
    event_type: payload.event,
    payload,
  });
  if (eventError?.code !== "23505" && eventError) return NextResponse.json({ error: "Event storage failed" }, { status: 500 });

  const graceDays = Number.isFinite(Number(process.env.BILLING_GRACE_DAYS))
    ? Math.max(0, Number(process.env.BILLING_GRACE_DAYS))
    : 7;
  const { data, error } = await admin.rpc("process_asaas_webhook", {
    p_event_id: payload.id,
    p_event_type: payload.event,
    p_payload: payload,
    p_grace_days: graceDays,
  });
  if (error) {
    await admin.from("billing_events").update({ error: error.message }).eq("provider_event_id", payload.id);
    return NextResponse.json({ error: "Event processing failed" }, { status: 500 });
  }
  if (payload.event === "SUBSCRIPTION_DELETED" || payload.event === "SUBSCRIPTION_INACTIVATED") {
    const subscriptionId = payload.subscription?.id || payload.payment?.subscription;
    if (subscriptionId) {
      const { data: existing } = await admin.from("organization_entitlements").select("organization_id,current_period_end,access_until,canceled_at").eq("asaas_subscription_id", subscriptionId).maybeSingle();
      if (existing?.organization_id) await admin.from("organization_entitlements").update({ status: "active", payment_confirmed: true, cancel_at_period_end: true, canceled_at: existing.canceled_at || new Date().toISOString(), access_until: existing.access_until || existing.current_period_end || new Date().toISOString(), updated_at: new Date().toISOString() }).eq("organization_id", existing.organization_id);
    }
  }
  return NextResponse.json({ received: true, duplicate: data?.duplicate === true });
}

function methodNotAllowed() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
