import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  MessageCircle,
  Mail,
  ShieldCheck,
  ShoppingCart,
  Wallet,
  Zap,
} from "lucide-react";

const whatsappNumber =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "") || "";
const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

const whatsappHref = whatsappNumber
  ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
      "Olá! Quero contratar o MeuCaixa por R$ 59,90/mês."
    )}`
  : "#contato";

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="feature-card-v2">
      <div className="feature-icon-v2">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

export default function Home() {
  return (
    <main className="marketing-v2">
      <header className="marketing-nav-v2">
        <Link href="/" className="marketing-brand-v2" aria-label="MeuCaixa">
          <img src="/kumo-logo.svg" alt="Kumo" />
          <span>
            Meu<span>Caixa</span>
          </span>
        </Link>

        <nav className="marketing-nav-links">
          <a href="#recursos">Recursos</a>
          <a href="#preco">Preço</a>
          <a href="#contato">Contato</a>
        </nav>

        <Link href="/login" className="marketing-login-v2">
          Acesso do cliente <ChevronRight size={16} />
        </Link>
      </header>

      <section className="hero-v2">
        <div className="hero-copy-v2">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Gestão simples para pequenos negócios
          </div>

          <h1>
            Seu negócio no controle.
            <span> Sem complicação.</span>
          </h1>

          <p className="hero-lead">
            Venda, controle o estoque, acompanhe o caixa e organize suas
            finanças em um único sistema.
          </p>

          <div className="hero-offer">
            <div className="hero-offer-price">
              <small>por apenas</small>
              <strong>
                <sup>R$</sup>59,90
              </strong>
              <span>por mês · por empresa</span>
            </div>
            <div className="hero-offer-copy">
              <strong>Menos de R$ 2 por dia.</strong>
              <span>Para deixar a operação da sua empresa organizada.</span>
            </div>
          </div>

          <div className="hero-actions-v2">
            <a
              href={whatsappHref}
              target={whatsappNumber ? "_blank" : undefined}
              rel={whatsappNumber ? "noreferrer" : undefined}
              className="button primary hero-cta"
            >
              <MessageCircle size={19} />
              Quero contratar
              <ArrowRight size={17} />
            </a>
            <a
              href="#recursos"
              className="button secondary hero-secondary"
            >
              Conhecer o sistema
            </a>
          </div>

          <div className="hero-trust">
            <span>
              <Check size={15} /> PDV e vendas
            </span>
            <span>
              <Check size={15} /> Estoque
            </span>
            <span>
              <Check size={15} /> Financeiro
            </span>
          </div>
        </div>

        <div className="dashboard-preview-v2" aria-label="Prévia do MeuCaixa">
          <div className="preview-glow" />
          <div className="preview-window">
            <div className="preview-topbar">
              <div className="preview-dots">
                <i />
                <i />
                <i />
              </div>
              <span>MeuCaixa</span>
              <div className="preview-avatar">MC</div>
            </div>

            <div className="preview-body">
              <div className="preview-sidebar">
                <b>MeuCaixa</b>
                <span className="active">Visão geral</span>
                <span>Vendas</span>
                <span>Produtos</span>
                <span>Estoque</span>
                <span>Financeiro</span>
              </div>

              <div className="preview-main">
                <div className="preview-heading">
                  <div>
                    <small>VISÃO GERAL</small>
                    <h3>Bom dia!</h3>
                  </div>
                  <span className="preview-date">Hoje</span>
                </div>

                <div className="preview-stats">
                  <div>
                    <small>Vendas hoje</small>
                    <strong>R$ 2.847,90</strong>
                    <em>+12,8%</em>
                  </div>
                  <div>
                    <small>Pedidos</small>
                    <strong>42</strong>
                    <em>+8,4%</em>
                  </div>
                  <div>
                    <small>Estoque baixo</small>
                    <strong>07</strong>
                    <em className="warning">Atenção</em>
                  </div>
                </div>

                <div className="preview-chart">
                  <div className="preview-chart-head">
                    <strong>Vendas da semana</strong>
                    <span>Últimos 7 dias</span>
                  </div>
                  <div className="chart-lines">
                    <i /><i /><i /><i />
                  </div>
                  <div className="chart-bars">
                    <i /><i /><i /><i /><i /><i /><i />
                  </div>
                </div>

                <div className="preview-bottom">
                  <div><span /> Venda concluída <b>R$ 189,90</b></div>
                  <div><span /> Venda concluída <b>R$ 74,50</b></div>
                  <div><span /> Venda concluída <b>R$ 329,00</b></div>
                </div>
              </div>
            </div>
          </div>
          <div className="preview-float preview-float-stock">
            <Boxes size={17} />
            <span><b>Estoque</b> atualizado</span>
            <Check size={15} />
          </div>
          <div className="preview-float preview-float-sale">
            <ShoppingCart size={17} />
            <span><b>Venda</b> concluída</span>
          </div>
        </div>
      </section>

      <section className="proof-strip">
        <div>
          <strong>Um sistema.</strong>
          <span>As ferramentas essenciais para sua operação.</span>
        </div>
        <div><Zap size={18} /> Rápido de aprender</div>
        <div><ShieldCheck size={18} /> Acessos por equipe</div>
        <div><Wallet size={18} /> Controle financeiro</div>
      </section>

      <section className="feature-section-v2" id="recursos">
        <div className="section-heading-v2">
          <span className="section-kicker">FEITO PARA A ROTINA REAL</span>
          <h2>Menos tempo organizando.<br /><span>Mais tempo vendendo.</span></h2>
          <p>
            O MeuCaixa reúne o que você precisa para cuidar da operação sem
            depender de várias planilhas ou sistemas diferentes.
          </p>
        </div>

        <div className="feature-grid-v2">
          <Feature
            icon={<ShoppingCart />}
            title="PDV e vendas"
            text="Registre vendas, pagamentos e descontos com rapidez. Tenha o movimento do dia sempre à mão."
          />
          <Feature
            icon={<Boxes />}
            title="Estoque sob controle"
            text="Cadastre produtos, acompanhe entradas e saídas e saiba quando um item está ficando baixo."
          />
          <Feature
            icon={<Wallet />}
            title="Caixa e financeiro"
            text="Acompanhe receitas, despesas e movimentações para entender melhor o dinheiro da empresa."
          />
          <Feature
            icon={<BarChart3 />}
            title="Visão do negócio"
            text="Veja os principais números da operação em um painel simples, direto e fácil de entender."
          />
        </div>
      </section>

      <section className="workflow-v2">
        <div className="workflow-copy">
          <span className="section-kicker">DO BALCÃO AO FINANCEIRO</span>
          <h2>Uma operação que conversa entre si.</h2>
          <p>
            Venda um produto e o estoque acompanha. Movimente o caixa e o
            financeiro registra. Tudo dentro do mesmo sistema.
          </p>

          <div className="workflow-list">
            <div>
              <span>01</span>
              <strong>Cadastre seus produtos</strong>
              <p>Preço, custo, estoque e informações essenciais.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Registre suas vendas</strong>
              <p>PDV simples para o atendimento do dia a dia.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Acompanhe o resultado</strong>
              <p>Caixa, estoque e financeiro em um só lugar.</p>
            </div>
          </div>
        </div>

        <div className="workflow-card">
          <div className="workflow-card-top">
            <span>Resumo do dia</span>
            <small>Hoje</small>
          </div>
          <div className="workflow-total">
            <small>Saldo do caixa</small>
            <strong>R$ 4.281,70</strong>
          </div>
          <div className="workflow-metrics">
            <div><small>Vendas</small><b>R$ 3.847,90</b></div>
            <div><small>Despesas</small><b>R$ 566,20</b></div>
          </div>
          <div className="workflow-progress">
            <span><i /></span>
            <div><small>Operação do dia</small><b>84% acompanhado</b></div>
          </div>
          <div className="workflow-row"><span>Produtos ativos</span><b>248</b></div>
          <div className="workflow-row"><span>Estoque baixo</span><b className="orange">7 itens</b></div>
          <div className="workflow-row"><span>Pedidos hoje</span><b>42</b></div>
        </div>
      </section>

      <section className="pricing-section-v2" id="preco">
        <div className="pricing-header-v2">
          <span className="section-kicker">PREÇO SEM PEGADINHA</span>
          <h2>Um preço que cabe no pequeno negócio.</h2>
          <p>Sem planos complicados. Sem escolher recurso por recurso.</p>
        </div>

        <div className="pricing-card-v2">
          <div className="pricing-main">
            <span className="pricing-label">MEUCAIXA</span>
            <h3>Gestão completa para sua empresa.</h3>
            <p>
              Tudo o que você precisa para começar a organizar sua operação
              por um único preço mensal.
            </p>
            <div className="pricing-price-v2">
              <sup>R$</sup>
              <strong>59,90</strong>
              <span>/ mês</span>
            </div>
            <a
              href={whatsappHref}
              target={whatsappNumber ? "_blank" : undefined}
              rel={whatsappNumber ? "noreferrer" : undefined}
              className="button primary pricing-cta"
            >
              Quero contratar <ArrowRight size={18} />
            </a>
          </div>

          <div className="pricing-includes">
            <strong>Você recebe:</strong>
            <ul>
              <li><Check size={18} /> PDV e vendas</li>
              <li><Check size={18} /> Controle de estoque</li>
              <li><Check size={18} /> Caixa e financeiro</li>
              <li><Check size={18} /> Clientes e fornecedores</li>
              <li><Check size={18} /> Usuários e permissões</li>
              <li><Check size={18} /> Acesso pelo navegador</li>
            </ul>
          </div>
        </div>
        <p className="pricing-footnote">R$ 59,90 por mês por empresa.</p>
      </section>

      <section className="contact-section-v2" id="contato">
        <div className="contact-card-v2">
          <div>
            <span className="section-kicker">PRONTO PARA COMEÇAR?</span>
            <h2>Coloque seu negócio no controle.</h2>
            <p>
              Fale com a Kumo para contratar o MeuCaixa. Nós criamos o acesso
              da sua empresa e você começa a usar.
            </p>
          </div>
          <div className="contact-actions-v2">
            {whatsappNumber && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="button primary"
              >
                <MessageCircle size={19} /> Falar pelo WhatsApp
              </a>
            )}
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}?subject=Quero contratar o MeuCaixa`}
                className="button secondary"
              >
                <Mail size={19} /> {contactEmail}
              </a>
            )}
          </div>
        </div>
      </section>

      <footer className="marketing-footer-v2">
        <span><b>Kumo</b> · Soluções em Tecnologia</span>
        <span>MeuCaixa · Gestão simples para pequenos negócios</span>
      </footer>
    </main>
  );
}
