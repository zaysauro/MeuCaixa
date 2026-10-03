import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const encoder = new TextEncoder();
async function sameToken(actual: string, expected: string) {
  const a = encoder.encode(actual); const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  let result = 0; for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
  return result === 0;
}

export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  const actual = request.headers.get("asaas-access-token") ?? "";
  if (!expected || !(await sameToken(actual, expected))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null) as { id?: string; event?: string; payment?: { subscription?: string; customer?: string; status?: string; billingType?: string; dueDate?: string }; subscription?: { id?: string; status?: string; billingType?: string; nextDueDate?: string } } | null;
  if (!payload?.id || !payload.event) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const admin = createAdminClient();
  const { error: eventError } = await admin.from("billing_events").insert({ provider_event_id: payload.id, event_type: payload.event, payload, processed_at: new Date().toISOString() });
  if (eventError?.code === "23505") return NextResponse.json({ received: true });
  if (eventError) return NextResponse.json({ error: "Event storage failed" }, { status: 500 });

  const payment = payload.payment;
  const subscriptionId = payment?.subscription ?? payload.subscription?.id;
  if (subscriptionId) {
    const event = payload.event;
    const update = event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED" || payment?.status === "RECEIVED" || payment?.status === "CONFIRMED"
      ? { status: "active", payment_confirmed: true, payment_method: payment?.billingType ?? payload.subscription?.billingType ?? null, current_period_end: payment?.dueDate ?? payload.subscription?.nextDueDate ?? null }
      : event === "PAYMENT_OVERDUE" || payment?.status === "OVERDUE" ? { status: "past_due", payment_confirmed: false, grace_until: new Date(Date.now() + Number(process.env.BILLING_GRACE_DAYS || 7) * 86_400_000).toISOString() }
        : ["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL"].includes(event) || payment?.status === "REFUNDED" ? { status: "canceled", payment_confirmed: false }
          : event === "SUBSCRIPTION_INACTIVATED" || event === "SUBSCRIPTION_DELETED" ? { status: "canceled", payment_confirmed: false } : null;
    if (update) await admin.from("organization_entitlements").update(update).eq("asaas_subscription_id", subscriptionId);
  }
  return NextResponse.json({ received: true });
}
