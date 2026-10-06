import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSiteUrl } from "@/lib/site-url";

export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { inviteId } = await request.json() as { inviteId?: string }; const { data, error } = await supabase.rpc("team_invite_delivery_data", { p_invite_id: inviteId }); if (error || !data?.[0]) return NextResponse.json({ error: "Convite não encontrado ou expirado." }, { status: 404 });
  const admin = createAdminClient(); const result = await admin.auth.admin.inviteUserByEmail(data[0].email, { data: { full_name: data[0].full_name }, redirectTo: `${getPublicSiteUrl(request.url)}/convite` }); if (result.error) return NextResponse.json({ error: result.error.message }, { status: 502 });
  await admin.from("team_invites").update({ auth_user_id: result.data.user.id, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), updated_at: new Date().toISOString() }).eq("id", inviteId);
  return NextResponse.json({ ok: true });
}
