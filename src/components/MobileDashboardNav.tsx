"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type MobileDashboardNavProps = {
  items: readonly (readonly [string, string])[];
  organizationName: string;
  branchName: string;
  role: string;
};

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export default function MobileDashboardNav({ items, organizationName, branchName, role }: MobileDashboardNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.classList.toggle("mobile-nav-open", open);
    return () => document.body.classList.remove("mobile-nav-open");
  }, [open]);

  return (
    <>
      <header className="mobile-dashboard-header">
        <Link href="/dashboard" className="mobile-dashboard-brand" aria-label="MeuCaixa - Visão geral">
          <img src="/kumo-logo.svg" alt="Kumo" />
          <span>MeuCaixa</span>
        </Link>
        <button type="button" className="mobile-menu-button" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}><Menu size={22} /></button>
      </header>
      {open && <button type="button" className="mobile-nav-backdrop" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <aside className={`mobile-dashboard-drawer${open ? " is-open" : ""}`} aria-label="Navegação do MeuCaixa" aria-hidden={!open}>
        <div className="mobile-drawer-header">
          <div><span className="eyebrow">MEUCAIXA</span><strong>{organizationName}</strong><small>{branchName} · {role}</small></div>
          <button type="button" className="mobile-menu-button" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={21} /></button>
        </div>
        <nav className="mobile-dashboard-links">
          {items.map(([label, href]) => <Link href={href} key={href} className={isActive(pathname, href) ? "is-active" : undefined} aria-current={isActive(pathname, href) ? "page" : undefined}>{label}</Link>)}
          <Link href="/dashboard/ajuda" className={isActive(pathname, "/dashboard/ajuda") ? "is-active" : undefined}>Ajuda</Link>
          <a href="https://sistemakumo.com.br" target="_blank" rel="noreferrer">Kumo institucional ↗</a>
        </nav>
        <form action="/auth/signout" method="post" className="mobile-drawer-footer"><button type="submit">Sair do MeuCaixa</button></form>
      </aside>
    </>
  );
}
