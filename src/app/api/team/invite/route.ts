import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSiteUrl } from "@/lib/site-url";

type InviteBody = { organizationId?: string; email?: string; fullName?: string; role?: "admin" | "manager" | "operator"; branchAccessMode?: "all" | "restricted"; branchIds?: string[] };

async function sendInvite(request: Request, body: InviteBody, inviteId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const organizationId = String(body.organizationId || "");
  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.fullName || "").trim();
  const role = body.role || "operator";
  const branchAccessMode = body.branchAccessMode || "restricted";
  const branchIds = Array.isArray(body.branchIds) ? body.branchIds : [];
  if (!organizationId || !email || !fullName || (branchAccessMode === "restricted" && !branchIds.length)) return NextResponse.json({ error: "Preencha nome, e-mail e pelo menos uma unidade." }, { status: 400 });

  const { data: inviteIdData, error: inviteError } = await supabase.rpc("team_create_invite", { p_organization_id: organizationId, p_email: email, p_full_name: fullName, p_role: role, p_branch_access_mode: branchAccessMode, p_branch_ids: branchIds });
  if (inviteError) return NextResponse.json({ error: inviteError.message }, { status: 403 });
  const id = inviteId || String(inviteIdData);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, invited_organization_id: organizationId }, redirectTo: `${getPublicSiteUrl(request.url)}/convite` });
    if (error) throw error;
    await admin.from("team_invites").update({ auth_user_id: data.user.id, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await supabase.rpc("team_cancel_invite", { p_invite_id: id });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível enviar o convite." }, { status: 502 });
  }
}

export async function POST(request: Request) { return sendInvite(request, await request.json() as InviteBody); }
