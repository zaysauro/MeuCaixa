import Link from "next/link";

export default function TermsPage() {
  return <main className="legal-page"><Link href="/">← Voltar ao MeuCaixa</Link><span className="eyebrow">DOCUMENTO BASE</span><h1>Termos de Uso</h1><p className="legal-warning">TODO: revisar com assessoria jurídica antes de publicar.</p><h2>Uso do serviço</h2><p>O MeuCaixa é uma ferramenta de apoio à operação comercial. A empresa contratante deve manter seus dados e acessos atualizados e usar o sistema conforme a legislação aplicável.</p><h2>Conta e cobrança</h2><p>Plano, preço, formas de pagamento, cancelamento e eventual período de teste devem ser confirmados na contratação.</p><h2>Contato</h2><p>Este documento base não substitui os termos comerciais e jurídicos finais da Kumo.</p></main>;
}
