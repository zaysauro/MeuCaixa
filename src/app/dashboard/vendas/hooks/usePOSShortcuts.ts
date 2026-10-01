"use client";

import { useEffect } from "react";
type Handlers = { onSearch: () => void; onCustomer: () => void; onDiscount: () => void; onPayment: () => void; onEscape: () => void; onConfirm: () => void; };
export function usePOSShortcuts({ onSearch, onCustomer, onDiscount, onPayment, onEscape, onConfirm }: Handlers) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;
      if (event.key === "F2") { event.preventDefault(); onSearch(); return; }
      if (event.key === "F4") { event.preventDefault(); onCustomer(); return; }
      if (event.key === "F8") { event.preventDefault(); onDiscount(); return; }
      if (event.key === "F9") { event.preventDefault(); onPayment(); return; }
      if (event.key === "Escape") { event.preventDefault(); onEscape(); return; }
      if (event.key === "Enter" && !isTyping) { event.preventDefault(); onConfirm(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSearch, onCustomer, onDiscount, onPayment, onEscape, onConfirm]);
}
