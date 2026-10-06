import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type AuthFlow = "signup" | "invite" | "recovery";

function getFlow(value: string | null, authType: string | null): AuthFlow {
  if (value === "invite" || authType === "invite") return "invite";
  if (value === "recovery" || authType === "recovery") return "recovery";
  return "signup";
}

function getDestination(request: NextRequest, flow: AuthFlow, error?: string) {
  const destination = request.nextUrl.clone();
  destination.pathname = flow === "invite" ? "/convite" : flow === "recovery" ? "/redefinir-senha" : "/login";
  destination.search = "";
  destination.searchParams.set("flow", flow);
  if (flow === "signup") destination.searchParams.set("confirmed", error ? "0" : "1");
  if (error) destination.searchParams.set("auth_error", error);
  return destination;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const authType = request.nextUrl.searchParams.get("type");
  const flow = getFlow(request.nextUrl.searchParams.get("flow"), authType);
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(getDestination(request, flow, "Não foi possível validar este link."));
  } else if (tokenHash) {
    const supportedTypes: EmailOtpType[] = ["signup", "invite", "recovery", "email_change", "email"];
    if (!authType || !supportedTypes.includes(authType as EmailOtpType)) {
      return NextResponse.redirect(getDestination(request, flow, "Tipo de link inválido."));
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: authType as EmailOtpType });
    if (error) return NextResponse.redirect(getDestination(request, flow, "Este link é inválido ou expirou."));
  }

  return NextResponse.redirect(getDestination(request, flow));
}
