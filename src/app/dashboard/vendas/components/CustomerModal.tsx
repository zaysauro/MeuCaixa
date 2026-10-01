"use client";

import { useEffect, useState } from "react";
import { Plus, Search, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { searchCustomers } from "@/lib/pos/customers";
import type { POSCustomer } from "@/lib/pos/types";

type Props = { organizationId: string; selected: POSCustomer | null; onSelect: (customer: POSCustomer | null) => void; onClose: () => void; };

export default function CustomerModal({ organizationId, selected, onSelect, onClose }: Props) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<POSCustomer[]>([]); const [newCustomer, setNewCustomer] = useState(false);
  const [name, setName] = useState(""); const [document, setDocument] = useState(""); const [phone, setPhone] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try { setResults(await searchCustomers(organizationId, query, 8)); }
      catch (err) { setError(err instanceof Error ? err.message : "Erro ao buscar clientes."); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [organizationId, query]);

  async function createCustomer() {
    if (!name.trim()) { setError("Informe o nome do cliente."); return; }
    setSaving(true); setError("");
    const supabase = createClient();
    const { data, error: insertError } = await supabase.from("customers").insert({
      organization_id: organizationId, name: name.trim(), document: document.trim() || null, phone: phone.trim() || null,
    }).select("id,name,document,phone,email").single();
    if (insertError) setError(insertError.message);
    else if (data) { onSelect(data as POSCustomer); onClose(); }
    setSaving(false);
  }

  return (
    <div className="pos-modal-backdrop" onMouseDown={onClose}><div className="pos-modal pos-customer-modal" onMouseDown={(event) => event.stopPropagation()}>
      <div className="pos-modal-header"><div><span className="eyebrow">CLIENTE</span><h2>{newCustomer ? "Novo cliente" : "Selecionar cliente"}</h2></div><button type="button" className="modal-close" onClick={onClose}>×</button></div>
      {!newCustomer ? <>
        <div className="pos-customer-search"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, CPF ou CNPJ" onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} /></div>
        <div className="pos-customer-results">
          <button type="button" className="pos-customer-result final" onClick={() => { onSelect(null); onClose(); }}><UserRound size={18} /><span><strong>Consumidor final</strong><small>Sem cliente vinculado</small></span></button>
          {results.map((customer) => <button type="button" className="pos-customer-result" key={customer.id} onClick={() => { onSelect(customer); onClose(); }}><UserRound size={18} /><span><strong>{customer.name}</strong><small>{customer.document || customer.phone || "Sem documento"}</small></span>{selected?.id === customer.id && <b>Selecionado</b>}</button>)}
          {!results.length && query && <div className="pos-suggestion-empty">Nenhum cliente encontrado.</div>}
        </div>
        <button type="button" className="button secondary full-button" onClick={() => setNewCustomer(true)}><Plus size={16} /> Cadastrar cliente</button>
      </> : <>
        <div className="form-grid pos-form-grid">
          <label>Nome<input className="field" autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>CPF/CNPJ<input className="field" value={document} onChange={(event) => setDocument(event.target.value)} /></label>
          <label>Telefone<input className="field" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="actions"><button type="button" className="button secondary" onClick={() => setNewCustomer(false)}>Voltar</button><button type="button" className="button primary" disabled={saving} onClick={() => void createCustomer()}>{saving ? "Salvando..." : "Cadastrar e selecionar"}</button></div>
      </>}
    </div></div>
  );
}
