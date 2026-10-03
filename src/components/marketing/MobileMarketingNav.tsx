"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

export function MobileMarketingNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="marketing-mobile-nav-v2">
      <button
        type="button"
        className="marketing-menu-button-v2"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls="marketing-mobile-menu"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && (
        <nav id="marketing-mobile-menu" className="marketing-mobile-menu-v2" aria-label="Navegação principal">
          <a href="#recursos" onClick={() => setOpen(false)}>Recursos</a>
          <a href="#preco" onClick={() => setOpen(false)}>Preço</a>
          <a href="#perguntas" onClick={() => setOpen(false)}>Perguntas</a>
          <a href="#contato" onClick={() => setOpen(false)}>Contato</a>
          <a href="/login" onClick={() => setOpen(false)}>Acesso do cliente</a>
        </nav>
      )}
    </div>
  );
}
