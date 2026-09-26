import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <div className="landing-card">
        <span className="eyebrow">GESTÃO PARA PEQUENOS NEGÓCIOS</span>
        <h1>Meu<span>Caixa</span></h1>
        <p>Fluxo de caixa, vendas, estoque e gestão financeira em um só lugar.</p>
        <div className="actions">
          <Link href="/login" className="button primary">Entrar</Link>
          <Link href="/cadastro" className="button secondary">Criar conta</Link>
        </div>
      </div>
    </main>
  );
}