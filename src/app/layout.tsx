import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { getPublicSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getPublicSiteUrl()),
  title: "Sistema PDV Barato para Comércio | MeuCaixa a partir de R$ 79,99",
  description: "Sistema PDV online para comércio: controle vendas, estoque, caixa e financeiro em um só lugar. MeuCaixa a partir de R$ 79,99/mês, com teste grátis por 7 dias.",
  alternates: { canonical: "/" },\n  robots: { index: true, follow: true },\n  keywords: ["sistema PDV barato", "sistema de caixa para loja", "controle de estoque", "sistema para comércio", "PDV online", "MeuCaixa"],
  openGraph: { title: "MeuCaixa | Sistema PDV, Estoque e Caixa", description: "Sistema de vendas e gestão para pequenos negócios a partir de R$ 79,99/mês. Teste grátis por 7 dias.", url: getPublicSiteUrl(), siteName: "MeuCaixa — Kumo", type: "website", locale: "pt_BR" },
  twitter: { card: "summary", title: "MeuCaixa | Sistema PDV Barato", description: "PDV, controle de estoque, vendas e caixa a partir de R$ 79,99/mês." },
  icons: { icon: "/kumo-logo.svg", shortcut: "/kumo-logo.svg", apple: "/kumo-logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}<Analytics /></body>
    </html>
  );
}
