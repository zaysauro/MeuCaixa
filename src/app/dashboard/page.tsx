import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const organization = Array.isArray(membership?.organizations)
    ? membership.organizations[0]
    : membership?.organizations;

  return (
    <main style={{minHeight:"100vh",padding:"32px",fontFamily:"Arial, sans-serif"}}>
      <div style={{maxWidth:1200,margin:"0 auto"}}>
        <span className="eyebrow">MEUCAIXA · DASHBOARD</span>
        <h1 style={{fontSize:48,margin:"12px 0"}}>Visão geral</h1>
        <p>{organization?.name ?? "Sua empresa"} · {membership?.role ?? "usuário"}</p>
        <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16,marginTop:32}}>
          {[
            ["Vendas hoje","R$ 0,00"],
            ["Entradas","R$ 0,00"],
            ["Saídas","R$ 0,00"],
            ["Saldo","R$ 0,00"]
          ].map(([label,value]) => (
            <article key={label} style={{background:"white",border:"1px solid #e4e6e9",borderRadius:16,padding:24}}>
              <small style={{color:"#667085"}}>{label}</small>
              <strong style={{display:"block",fontSize:28,marginTop:10}}>{value}</strong>
            </article>
          ))}
        </section>
        <div style={{marginTop:32,padding:28,borderRadius:16,background:"white",border:"1px solid #e4e6e9"}}>
          <h2 style={{marginTop:0}}>Seu painel está pronto para receber os módulos</h2>
          <p>O próximo ciclo conecta vendas, caixa, produtos, estoque e financeiro ao Supabase.</p>
        </div>
      </div>
    </main>
  );
}