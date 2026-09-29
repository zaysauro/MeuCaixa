import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeuCaixa",
  description: "Fluxo de caixa, vendas e gestão para pequenos negócios.",
  icons: { icon: "/kumo-logo.svg", shortcut: "/kumo-logo.svg", apple: "/kumo-logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}