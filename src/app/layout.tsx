import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://meucaixa.sistemakumo.com.br"),
  title: "MeuCaixa — sistema de PDV, estoque e caixa para pequenos negócios",
  description: "PDV, estoque, caixa e financeiro para pequenos negócios a partir de R$ 79,99/mês. Solicite um teste grátis falando com a equipe.",
  alternates: { canonical: "/" },
  openGraph: { title: "MeuCaixa — PDV, estoque e caixa", description: "Venda, estoque e caixa em um só sistema.", type: "website", locale: "pt_BR" },
  twitter: { card: "summary_large_image", title: "MeuCaixa — PDV, estoque e caixa", description: "Venda, estoque e caixa em um só sistema." },
  icons: { icon: "/kumo-logo.svg", shortcut: "/kumo-logo.svg", apple: "/kumo-logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}<Analytics /></body>
    </html>
  );
}
