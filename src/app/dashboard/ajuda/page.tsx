import Link from "next/link";
import { ArrowRight, BookOpen, Bug, CheckCircle2, Mail, MessageCircle, Package, Store, WalletCards, BarChart3, Boxes, Users } from "lucide-react";

const SUPPORT_WHATSAPP = "5541997084653";
const SUPPORT_EMAIL = "kumosoftwares@gmail.com";
const APP_VERSION = "0.1.0";

const steps = [
  {
    icon: Store,
    title: "1. Configure sua empresa",
    text: "Depois do cadastro, informe o nome da empresa e da matriz. Em Matriz e filiais você pode adicionar outras unidades.",
  },
  {
    icon: Package,
    title: "2. Cadastre os produtos",
    text: "Em Produtos, informe nome, SKU, código de barras, unidade, custo, preço de venda e estoque inicial.",
  },
  {
    icon: WalletCards,
    title: "3. Abra o caixa",
    text: "Antes de vender, entre em Caixa e abra o caixa da unidade em que a operação será realizada.",
  },
  {
    icon: CheckCircle2,
    title: "4. Faça suas vendas",
    text: "Em Vendas, selecione os produtos, confira o total e registre a forma de pagamento.",
  },
  {
    icon: Boxes,
    title: "5. Acompanhe o estoque",
    text: "As vendas movimentam o estoque da filial. Use Estoque para acompanhar quantidades e itens com estoque baixo.",
  },
  {
    icon: BarChart3,
    title: "6. Acompanhe os resultados",
    text: "A Visão geral mostra a operação de cada unidade ou o consolidado. Relatórios e Financeiro ajudam no acompanhamento.",
  },
];

export default function AjudaPage() {
  const whatsappUrl = SUPPORT_WHATSAPP
    ? "https://wa.me/" + SUPPORT_WHATSAPP + "?text=" + encodeURIComponent("Olá! Estou usando o MeuCaixa e preciso de ajuda.")
    : null;

  return (
    <div className="page">
      <div className="help-header">
        <div>
          <span className="eyebrow">MEUCAIXA · CENTRAL DE AJUDA</span>
          <h1>Como usar o sistema</h1>
          <p>Um guia rápido para começar e encontrar as principais funções.</p>
        </div>
        <span className="help-version">Versão {APP_VERSION}</span>
      </div>

      <div className="help-grid">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <article className="help-card" key={step.title}>
              <div className="help-icon"><Icon size={20} /></div>
              <h2>{step.title}</h2>
              <p>{step.text}</p>
            </article>
          );
        })}
      </div>

      <section className="panel help-section">
        <div className="help-section-heading">
          <div className="help-icon"><BookOpen size={20} /></div>
          <div>
            <span className="eyebrow">CONCEITOS IMPORTANTES</span>
            <h2>Como funciona o MeuCaixa</h2>
          </div>
        </div>

        <div className="help-list">
          <div>
            <strong>Matriz e filiais</strong>
            <p>Uma empresa pode ter uma matriz e várias filiais. O dono pode visualizar as unidades individualmente ou de forma consolidada.</p>
          </div>
          <div>
            <strong>Estoque por unidade</strong>
            <p>O catálogo de produtos pertence à empresa, mas o estoque é controlado separadamente em cada filial.</p>
          </div>
          <div>
            <strong>Faturamento não é lucro</strong>
            <p>Vendas representam o valor vendido. Lucro bruto considera também o custo dos produtos vendidos.</p>
          </div>
          <div>
            <strong>Histórico</strong>
            <p>Alterações importantes em produtos ficam registradas para facilitar conferências e identificar ajustes, perdas ou exclusões.</p>
          </div>
        </div>
      </section>

      <section className="help-support">
        <div>
          <span className="eyebrow">PRECISOU DE AJUDA?</span>
          <h2>Encontrou um problema?</h2>
          <p>Se alguma função apresentar erro ou comportamento inesperado, fale diretamente com o suporte. Se puder, informe a tela, o que você estava fazendo e uma captura de tela.</p>
        </div>

        <div className="help-contact-actions">
          {whatsappUrl ? (
            <a className="button primary" href={whatsappUrl} target="_blank" rel="noreferrer">
              <MessageCircle size={17} /> Reportar pelo WhatsApp
            </a>
          ) : (
            <span className="help-contact-disabled"><MessageCircle size={17} /> WhatsApp — configurar</span>
          )}

          {SUPPORT_EMAIL ? (
            <a className="button secondary" href={"mailto:" + SUPPORT_EMAIL}>
              <Mail size={17} /> Enviar por e-mail
            </a>
          ) : (
            <span className="help-contact-disabled"><Mail size={17} /> E-mail — configurar</span>
          )}
        </div>
      </section>
    </div>
  );
}
