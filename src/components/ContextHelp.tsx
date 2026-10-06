"use client";

import { useEffect, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";

type ContextHelpProps = { title: string; description: string };

export function ContextHelp({ title, description }: ContextHelpProps) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return <>
    <button className="context-help-trigger" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><CircleHelp size={16} /> Sobre esta área</button>
    {open && <div className="context-help-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="context-help-dialog" role="dialog" aria-modal="true" aria-labelledby="context-help-title">
        <div className="context-help-header"><div><span className="eyebrow">AJUDA RÁPIDA</span><h2 id="context-help-title">{title}</h2></div><button ref={closeRef} className="icon-button" type="button" aria-label="Fechar ajuda" onClick={() => setOpen(false)}><X size={18} /></button></div>
        <p>{description}</p>
        <div className="modal-actions"><button className="button primary" type="button" onClick={() => setOpen(false)}>Entendi</button></div>
      </section>
    </div>}
  </>;
}
