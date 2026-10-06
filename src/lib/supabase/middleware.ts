import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response = NextResponse.next({ request });
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isDashboardRoute = pathname.startsWith("/dashboard");
  const isBillingRoute = pathname === "/dashboard/configuracoes/upgrade";
  const isAccessBlockedRoute = pathname === "/acesso-indisponivel";
  if (isDashboardRoute && !isBillingRoute && !isAccessBlockedRoute) {
    const { data: access, error: accessError } = await supabase.rpc("get_my_company_access");
    const current = access?.[0];
    if (user && accessError) {
      const redirectResponse = NextResponse.redirect(new URL("/acesso-indisponivel", request.url));
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    }
    if (current && !current.has_access) {
      const destination = current.can_manage_billing
        ? "/dashboard/configuracoes/upgrade"
        : "/acesso-indisponivel";
      const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
      response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
      return redirectResponse;
    }
  }

  return response;
}
