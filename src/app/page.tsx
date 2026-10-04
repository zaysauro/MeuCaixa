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
import { MobileMarketingNav } from "@/components/marketing/MobileMarketingNav";
import { MarketingAnalytics } from "@/components/marketing/MarketingAnalytics";
import {
  CONTACT_MESSAGES,
  contactFallback,
  emailLink,
  marketingContact,
  whatsappLink,
} from "@/lib/marketing/contact";

const { whatsappNumber, email: contactEmail } = marketingContact;
const whatsappHref = whatsappLink(CONTACT_MESSAGES.hire);
const trialHref = contactFallback(CONTACT_MESSAGES.trial);
const asaasCheckoutUrl = process.env.NEXT_PUBLIC_ASAAS_CHECKOUT_URL?.trim() ?? "";
const TRIAL_DAYS = ""; // TODO: confirmar a duração do teste antes de publicar.
const SHOW_LAUNCH_PROGRAM = false; // TODO: ativar somente após confirmar o programa comercial.
const GUARANTEES = ["Acesso pelo navegador", "Suporte direto com a equipe"] as const; // TODO: confirmar política e canais.
const FAQS = [
  ["Quanto custa o MeuCaixa?", "R$ 79,99/mês para a operação inicial + R$ 50,00/mês por filial adicional."],
  ["Posso começar com apenas uma loja?", "Sim. Comece com uma unidade e adicione outras quando sua empresa crescer."],
  ["Posso adicionar outras lojas depois?", "Sim. A estrutura de matriz e filiais permite conectar novas unidades ao mesmo ecossistema."],
  ["Posso comparar minhas lojas?", "Sim. A estrutura de filiais permite acompanhar e comparar o desempenho das unidades."],
  ["Posso transferir produtos entre lojas?", "Sim. O módulo de estoque possui fluxo de transferência entre filiais."],
  ["Preciso trocar de sistema quando abrir outra loja?", "Não. A proposta do MeuCaixa é acompanhar o crescimento da empresa dentro do mesmo ecossistema."],
  ["Posso testar antes de pagar?", "Entre em contato pelo botão de teste grátis. A equipe confirma a disponibilidade e orienta o próximo passo."],
  ["Como pago?", "A contratação planejada aceita Pix, boleto ou cartão, com cobrança mensal. A forma disponível depende da configuração comercial."],
  ["Tem fidelidade? Posso cancelar quando quiser?", "TODO: confirmar a política de cancelamento antes de publicar esta resposta."],
  ["Funciona no celular e no computador do balcão?", "Sim. O MeuCaixa funciona pelo navegador; a experiência pode variar conforme o tamanho da tela."],
  ["Funciona com leitor de código de barras?", "A câmera do celular é compatível com leitura de códigos. Leitor USB: confirmar compatibilidade específica."],
  ["Emite nota fiscal?", "TODO: confirmar o estado atual da emissão fiscal. Não oferecemos essa promessa nesta página."],
  ["Consigo importar meus produtos de uma planilha?", "TODO: confirmar se a importação está disponível no produto atual."],
  ["Meus dados estão seguros?", "O sistema separa organizações e permissões com autenticação e políticas RLS no Supabase. Nenhuma solução deve ser descrita como risco zero."],
  ["Quantos usuários e filiais posso ter?", "O plano base começa com uma empresa e os limites exibidos no sistema. Consulte a equipe para necessidades de múltiplas filiais."],
  ["Quem me ajuda se eu tiver dificuldade?", "Fale diretamente com a equipe pelos canais de contato disponíveis nesta página."],
] as const;

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
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "MeuCaixa",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "79.99", priceCurrency: "BRL", description: "Plano mensal por empresa" },
    provider: { "@type": "Organization", name: "Kumo — Soluções em Tecnologia" },
  };
  return (
    <main className="marketing-v2">
      <MarketingAnalytics />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
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
          <a href="#perguntas">Perguntas</a>
          <a href="#contato">Contato</a>
        </nav>

        <Link href="/login" className="marketing-login-v2" data-track="login_click" data-position="menu">
          Acesso do cliente <ChevronRight size={16} />
        </Link>
        <MobileMarketingNav />
      </header>

      <section className="hero-v2">
        <div className="hero-copy-v2">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Gestão simples para pequenos negócios
          </div>

          <h1>
            Venda, estoque e caixa em um só sistema.
            <span> A partir de R$ 79,99 por mês.</span>
          </h1>

          <p className="hero-lead">
            Venda, controle seu estoque, acompanhe o caixa e entenda o
            desempenho do seu comércio em um só lugar.
          </p>

          <div className="hero-offer">
            <div className="hero-offer-price">
              <small>planos a partir de</small>
              <strong>
                <sup>R$</sup>79,99
              </strong>
              <span>/mês · por empresa</span>
            </div>
            <div className="hero-offer-copy">
              <strong>Comece com uma loja.</strong>
              <span>Adicione filiais quando o seu comércio crescer.</span>
            </div>
          </div>
          <p className="audience-note-v2"><strong>Pensado para:</strong> mercadinhos, lojas de roupas, papelarias, assistências e lanchonetes.</p>

          <div className="hero-actions-v2">
            {asaasCheckoutUrl ? <a href={asaasCheckoutUrl} target="_blank" rel="noreferrer" className="button primary" data-track="checkout_click" data-position="hero">Assinar agora <ArrowRight size={17} /></a> : null}
            <a
              href={whatsappHref}
              target={whatsappNumber ? "_blank" : undefined}
              rel={whatsappNumber ? "noreferrer" : undefined}
              className="button primary hero-cta"
              data-track="cta_whatsapp_click" data-position="hero"
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
          <a className="marketing-trial-link-v2" href={trialHref} target={whatsappNumber ? "_blank" : undefined} rel={whatsappNumber ? "noreferrer" : undefined} data-track="trial_request_click" data-position="hero">
            Ainda está na dúvida? Entre em contato e solicite um teste grátis
          </a>

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

      <section className="recognition-section-v2">
        <div className="section-heading-v2">
          <span className="section-kicker">PARA A ROTINA REAL</span>
          <h2>Feito para a rotina do seu comércio.</h2>
          <p>Se você vende no balcão, trabalha com estoque, código de barras e precisa saber se o caixa e a operação estão realmente batendo, o MeuCaixa foi feito para sua rotina.</p>
        </div>
        <div className="recognition-grid-v2">
          <article><ShoppingCart size={21} /><h3>Vende no balcão?</h3><p>Caixa rápido e simples para sua operação.</p></article>
          <article><Boxes size={21} /><h3>Trabalha com estoque?</h3><p>Saiba o que entrou, saiu e precisa de reposição.</p></article>
          <article><BarChart3 size={21} /><h3>Quer entender seus números?</h3><p>Acompanhe vendas, custos e resultados com mais clareza.</p></article>
          <article><ShieldCheck size={21} /><h3>Tem mais de uma loja?</h3><p>Conecte suas unidades e acompanhe tudo no mesmo sistema.</p></article>
        </div>
      </section>

      <section className="pain-section-v2">
        <div className="pain-copy-v2"><span className="section-kicker">MAIS CLAREZA NO DIA A DIA</span><h2>Chega de administrar sua loja no escuro.</h2><p>O pequeno comércio precisa de informação prática para decidir melhor, sem transformar cada resposta em uma busca por planilhas.</p></div>
        <div className="pain-list-v2"><div>O estoque diz que tem, mas não tem.</div><div>Vendi bastante, mas não sei quanto realmente sobrou.</div><div>Preciso procurar em várias planilhas para descobrir uma informação.</div><div>Só consigo saber como a loja está quando estou lá.</div><strong>O MeuCaixa organiza essas informações em um só lugar para você tomar decisões com mais segurança.</strong></div>
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
          <Feature icon={<Zap />} title="Código de barras pela câmera" text="Encontre produtos usando a câmera do celular no fluxo de cadastro e venda." />
          <Feature icon={<Mail />} title="Recibo em PDF" text="Prepare e exiba comprovantes da venda para o cliente." />
          <Feature icon={<BarChart3 />} title="Relatórios" text="Consulte relatórios de vendas, caixa, estoque e financeiro." />
          <Feature icon={<Boxes />} title="Múltiplas filiais" text="A arquitetura do sistema acompanha operações com mais de uma filial." />
          <Feature icon={<ShieldCheck />} title="Permissões por perfil" text="Organize acessos para owner, admin, manager, cashier e employee." />
          <Feature icon={<ArrowRight />} title="Atalhos no PDV" text="Use atalhos de teclado disponíveis para agilizar o atendimento." />
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
              <strong>Fale com a gente ou peça o teste</strong>
              <p>A equipe orienta o próximo passo sem prometer prazo ou duração.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Criamos o acesso da sua empresa</strong>
              <p>Você recebe a orientação inicial para entrar no sistema.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Cadastre produtos e comece a vender</strong>
              <p>PDV, estoque, caixa e financeiro no mesmo fluxo.</p>
            </div>
          </div>
        </div>

        <div className="workflow-card">
          <div className="workflow-card-top">
            <span>Exemplo ilustrativo</span>
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
            <div><small>Operação do dia</small><b>Resumo disponível</b></div>
          </div>
          <div className="workflow-row"><span>Produtos ativos</span><b>248</b></div>
          <div className="workflow-row"><span>Estoque baixo</span><b className="orange">7 itens</b></div>
          <div className="workflow-row"><span>Pedidos hoje</span><b>42</b></div>
        </div>
      </section>

      <section className="growth-section-v2">
        <div className="growth-copy-v2"><span className="section-kicker">CRESÇA SEM TROCAR DE SISTEMA</span><h2>Sua primeira loja não precisa ser seu limite.</h2><p>Comece com uma unidade e, quando seu negócio crescer, conecte novas lojas ao mesmo ecossistema. Você não precisa trocar de sistema quando sua empresa crescer.</p><a className="button secondary" href="#preco">Ver preço por filial</a></div>
        <div className="network-map-v2" aria-label="Empresa com matriz e filiais conectadas"><strong>EMPRESA</strong><div className="network-line-v2" /><span>MATRIZ</span><div className="network-branches-v2"><span>FILIAL 1</span><span>FILIAL 2</span><span>FILIAL 3</span></div></div>
        <div className="growth-benefits-v2"><div><strong>Preços centralizados</strong><span>Gerencie preços entre unidades com mais praticidade.</span></div><div><strong>Transferência entre lojas</strong><span>Transfira produtos e estoque quando necessário.</span></div><div><strong>Comparação de desempenho</strong><span>Entenda qual unidade está crescendo mais.</span></div><div><strong>Visão da rede</strong><span>Matriz e filiais dentro de um único ecossistema.</span></div></div>
      </section>

      <section className="pricing-section-v2" id="preco">
        <div className="pricing-header-v2">
          <span className="section-kicker">PREÇO SEM PEGADINHA</span>
          <h2>Comece pequeno. Cresça com o seu negócio.</h2>
          <p>Uma base simples + R$ 50,00/mês por filial adicional.</p>
        </div>

        <div className="pricing-card-v2">
          <div className="pricing-main">
            <span className="pricing-label">MEUCAIXA</span>
            <h3>Gestão para sua primeira loja e para as próximas.</h3>
            <p>
              Organize vendas, estoque, caixa e gestão em um só lugar, com estrutura para acompanhar o crescimento do seu comércio.
            </p>
            <div className="pricing-price-v2">
              <sup>R$</sup>
              <strong>79,99</strong>
              <span>/ mês</span>
            </div>
            <a
              href={whatsappHref}
              target={whatsappNumber ? "_blank" : undefined}
              rel={whatsappNumber ? "noreferrer" : undefined}
              className="button primary pricing-cta"
              data-track="cta_whatsapp_click" data-position="preco"
            >
              Quero contratar <ArrowRight size={18} />
            </a>
            {asaasCheckoutUrl ? <a href={asaasCheckoutUrl} target="_blank" rel="noreferrer" className="button secondary pricing-checkout-v2" data-track="checkout_click" data-position="preco">Assinar agora</a> : null}
            <a className="pricing-trial-link-v2" href={trialHref} target={whatsappNumber ? "_blank" : undefined} rel={whatsappNumber ? "noreferrer" : undefined} data-track="trial_request_click" data-position="preco">
              Ainda está na dúvida? Entre em contato e solicite um teste grátis
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
              {GUARANTEES.map((item) => <li key={item}><Check size={18} /> {item}</li>)}
            </ul>
            {TRIAL_DAYS ? <p className="pricing-guarantee-note-v2">Teste de {TRIAL_DAYS} dias sob confirmação da equipe.</p> : null}
          </div>
        </div>
        <div className="pricing-examples-v2" aria-label="Exemplos de preço por quantidade de lojas">
          <div><strong>1 loja</strong><span>R$ 79,99/mês</span></div>
          <div><strong>2 lojas</strong><span>R$ 129,99/mês</span></div>
          <div><strong>3 lojas</strong><span>R$ 179,99/mês</span></div>
          <div><strong>4 lojas</strong><span>R$ 229,99/mês</span></div>
        </div>
        <p className="pricing-footnote">R$ 79,99/mês + R$ 50,00/mês por filial adicional.</p>
      </section>

      <section className="faq-section-v2" id="perguntas">
        <div className="section-heading-v2">
          <span className="section-kicker">PERGUNTAS FREQUENTES</span>
          <h2>Resposta direta antes de começar.</h2>
        </div>
        <div className="faq-list-v2">
          {FAQS.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}<ChevronRight size={17} /></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        {SHOW_LAUNCH_PROGRAM ? <p className="launch-program-v2">Programa de lançamento: acompanhamento direto da equipe nos primeiros clientes.</p> : null}
      </section>

      <section className="contact-section-v2" id="contato">
        <div className="contact-card-v2">
          <div>
            <span className="section-kicker">PRONTO PARA COMEÇAR?</span>
            <h2>Pronto para colocar seu comércio no controle?</h2>
            <p>
              Comece por R$ 79,99/mês. Fale com a Kumo para conhecer o sistema e criar o acesso da sua empresa.
            </p>
            <a className="contact-trial-link-v2" href={trialHref} target={whatsappNumber ? "_blank" : undefined} rel={whatsappNumber ? "noreferrer" : undefined} data-track="trial_request_click" data-position="rodape">
              Ainda está na dúvida? Entre em contato e solicite um teste grátis
            </a>
          </div>
          <div className="contact-actions-v2">
            {whatsappNumber ? <a href={whatsappHref} target="_blank" rel="noreferrer" className="button primary"><MessageCircle size={19} /> Falar pelo WhatsApp</a> : null}
            {contactEmail ? <a href={emailLink(CONTACT_MESSAGES.hire)} className="button secondary"><Mail size={19} /> {contactEmail}</a> : null}
            {!whatsappNumber && !contactEmail ? <span className="contact-config-note-v2">Contato em configuração. Fale com a equipe pelo acesso do cliente.</span> : null}
          </div>
        </div>
      </section>

      <div className="marketing-mobile-cta-v2" aria-label="Contato rápido">
        <a href={whatsappNumber ? whatsappHref : emailLink(CONTACT_MESSAGES.hire)} target={whatsappNumber ? "_blank" : undefined} rel={whatsappNumber ? "noreferrer" : undefined}><MessageCircle size={16} /> {whatsappNumber ? "Falar no WhatsApp" : "Falar com a equipe"}</a>
        <a href={trialHref} target={whatsappNumber ? "_blank" : undefined} rel={whatsappNumber ? "noreferrer" : undefined}>Teste grátis</a>
        {asaasCheckoutUrl ? <a href={asaasCheckoutUrl} target="_blank" rel="noreferrer" data-track="checkout_click" data-position="barra mobile">Assinar agora</a> : null}
      </div>

      <footer className="marketing-footer-v2">
        <span><b>Kumo</b> · Soluções em Tecnologia</span>
        <span>MeuCaixa · Gestão simples para pequenos negócios</span>
        <span><Link href="/privacidade">Privacidade</Link> · <Link href="/termos">Termos</Link></span>
      </footer>
    </main>
  );
}
