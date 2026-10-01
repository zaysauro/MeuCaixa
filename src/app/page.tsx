import Link from "next/link";
import { ArrowRight, BarChart3, Boxes, Check, MessageCircle, Wallet, Mail, ShieldCheck } from "lucide-react";

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\\D/g, "") || "";
const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

export default function Home() {
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Olá! Quero conhecer o MeuCaixa.")}`
    : "#contato";

  return (
    <main className="marketing">
      <header className="marketing-nav">
        <Link href="/" className="marketing-brand">
          <img src="/kumo-logo.svg" alt="Kumo" />
          <span>Meu<span>Caixa</span></span>
        </Link>
        <Link href="/login" className="marketing-login">Acesso do cliente</Link>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">KUMO · MEUCAIXA</span>
          <h1>Seu negócio no controle.<br /><span>Seu caixa sem complicação.</span></h1>
          <p>
            Vendas, caixa, estoque, produtos, clientes e financeiro em um único sistema,
            feito para pequenos negócios.
          </p>
          <div className="hero-actions">
            <a href={whatsappHref} target={whatsappNumber ? "_blank" : undefined} rel={whatsappNumber ? "noreferrer" : undefined} className="button primary">
              <MessageCircle size={19} /> Falar pelo WhatsApp
            </a>
            <a href={contactEmail ? `mailto:${contactEmail}?subject=Quero conhecer o MeuCaixa` : "#contato"} className="button secondary">
              <Mail size={19} /> Falar por e-mail
            </a>
          </div>
          <p className="hero-note">Sem cadastro automático. Nós configuramos sua conta e entregamos o acesso à sua empresa.</p>
        </div>

        <div className="hero-card">
          <div className="mock-window">
            <div className="mock-top"><span></span><span></span><span></span><b>MeuCaixa</b></div>
            <div className="mock-content">
              <div className="mock-label">Vendas hoje</div>
              <strong>R$ 2.847,90</strong>
              <div className="mock-bars"><i></i><i></i><i></i><i></i><i></i><i></i></div>
              <div className="mock-row"><span>Produtos ativos</span><b>248</b></div>
              <div className="mock-row"><span>Estoque baixo</span><b>7</b></div>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-section">
        <div className="section-heading">
          <span className="eyebrow">TUDO EM UM SÓ LUGAR</span>
          <h2>O básico do seu negócio, bem feito.</h2>
          <p>Uma ferramenta direta para você vender e acompanhar sua operação sem depender de planilhas espalhadas.</p>
        </div>
        <div className="feature-grid">
          <Feature icon={<Wallet />} title="PDV e vendas" text="Registre vendas, pagamentos, descontos e acompanhe o movimento do caixa." />
          <Feature icon={<Boxes />} title="Estoque" text="Produtos, categorias, entradas, saídas e alertas de estoque baixo." />
          <Feature icon={<BarChart3 />} title="Financeiro" text="Receitas, despesas e visão clara do resultado da sua operação." />
          <Feature icon={<ShieldCheck />} title="Acesso por equipe" text="Cada funcionário recebe seu próprio acesso, com permissões definidas." />
        </div>
      </section>

      <section className="pricing-section">
        <div className="pricing-card">
          <div>
            <span className="eyebrow">PLANO MEUCAIXA</span>
            <h2>Gestão completa por um preço simples.</h2>
            <p>Sem complicar a contratação. Você fala com a Kumo, nós configuramos sua empresa e liberamos o acesso.</p>
          </div>
          <div className="price">
            <small>por mês</small>
            <strong><sup>R$</sup>59,90</strong>
            <span>por empresa</span>
          </div>
          <ul>
            <li><Check size={18} /> PDV e vendas</li>
            <li><Check size={18} /> Controle de estoque</li>
            <li><Check size={18} /> Fluxo financeiro</li>
            <li><Check size={18} /> Clientes e fornecedores</li>
            <li><Check size={18} /> Usuários e permissões</li>
          </ul>
          <a href={whatsappHref} target={whatsappNumber ? "_blank" : undefined} rel={whatsappNumber ? "noreferrer" : undefined} className="button primary pricing-button">
            Quero contratar <ArrowRight size={18} />
          </a>
        </div>
      </section>

      <section className="contact-section" id="contato">
        <span className="eyebrow">FALE COM A KUMO</span>
        <h2>Quer colocar sua empresa para rodar?</h2>
        <p>Entre em contato. Nós criamos o usuário da sua empresa, configuramos o acesso e orientamos os primeiros passos.</p>
        <div className="contact-actions">
          {whatsappNumber && <a href={whatsappHref} target="_blank" rel="noreferrer" className="contact-link"><MessageCircle size={20} /> WhatsApp</a>}
          {contactEmail && <a href={`mailto:${contactEmail}`} className="contact-link"><Mail size={20} /> {contactEmail}</a>}
        </div>
      </section>

      <footer className="marketing-footer">
        <span>Kumo · Soluções em Tecnologia</span>
        <span>MeuCaixa · R$ 59,90/mês</span>
      </footer>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="feature-card">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}
