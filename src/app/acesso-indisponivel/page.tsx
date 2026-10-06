import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AccessUnavailablePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: access } = await supabase.rpc("get_my_company_access");
  const current = access?.[0];
  if (current?.has_access) redirect("/dashboard");
  if (current?.can_manage_billing) redirect("/dashboard/configuracoes/upgrade");

  return (
    <main className="page access-unavailable-page">
      <div className="panel access-unavailable-panel">
        <span className="eyebrow">ACESSO INDISPONÍVEL</span>
        <h1>O acesso da sua empresa está temporariamente indisponível.</h1>
        <p>Entre em contato com o administrador da sua empresa para regularizar o acesso ao MeuCaixa.</p>
      </div>
    </main>
  );
}
