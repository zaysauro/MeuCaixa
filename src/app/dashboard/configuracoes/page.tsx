import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Building2, FileText, Mail, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { roleHasPermission, roleLabel } from "@/lib/rbac";

const items = [
  {
    href: "/dashboard/configuracoes/usuarios",
    title: "Usuários e acessos",
    description: "Convide funcionários, defina funções, filiais e status de acesso.",
    icon: Users,
    permission: "users.view",
  },
  {
    href: "/dashboard/configuracoes/comprovante",
    title: "Comprovante",
    description: "Formato térmico, rodapé, dados exibidos e impressão automática.",
    icon: FileText,
    permission: "settings.receipt",
  },
];

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org } = await supabase.rpc("get_my_organization");
  if (!org?.length) redirect("/onboarding");

  const role = String(org[0].role || "operator");

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO</span>
          <h1>Configurações</h1>
          <p>Controle empresa, usuários, acesso e preferências do MeuCaixa.</p>
        </div>
        <ShieldCheck size={34} />
      </div>

      <div className="settings-hub">
        {(["owner", "admin"].includes(role)) && <Link className="settings-hub-card" href="/dashboard/configuracoes/upgrade"><span className="settings-hub-icon"><Building2 size={21} /></span><span><strong>Upgrade</strong><small>Consulte limites e a preparação para contratar mais unidades.</small></span><span className="settings-hub-arrow">→</span></Link>}
        {items.filter((item) => roleHasPermission(role, item.permission)).map((item) => {
          const Icon = item.icon;
          return (
            <Link className="settings-hub-card" href={item.href} key={item.href}>
              <span className="settings-hub-icon"><Icon size={21} /></span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <span className="settings-hub-arrow">→</span>
            </Link>
          );
        })}

        <section className="support-card">
          <div className="support-card-heading">
            <div><span className="eyebrow">SUPORTE KUMO</span><h2>Falar com o suporte</h2><p>Escolha como prefere falar com a nossa equipe.</p></div>
            <span className="support-online"><i /> Suporte online: segunda a sexta, das 9h às 18h</span>
          </div>
          <div className="support-actions">
            <a className="button secondary" href="mailto:kumosoftwares@gmail.com?subject=Suporte%20MeuCaixa"><Mail size={17}/> Por e-mail</a>
            <a className="button primary" href="https://wa.me/5541997084653?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20com%20o%20MeuCaixa." target="_blank" rel="noreferrer"><MessageCircle size={17}/> Por WhatsApp</a>
          </div>
        </section>

        <div className="settings-hub-card settings-hub-card-muted">
          <span className="settings-hub-icon"><Building2 size={21} /></span>
          <span>
            <strong>Empresa</strong>
            <small>Dados comerciais e identidade da empresa ficarão aqui.</small>
          </span>
          <span className="settings-coming-soon">{roleLabel(role)}</span>
        </div>
      </div>
    </div>
  );
}
