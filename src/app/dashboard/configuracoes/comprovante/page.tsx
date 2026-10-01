"use client";

import { useEffect, useState } from "react";
import { Save, ReceiptText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Branch = {
  branch_id: string;
  branch_name: string;
  branch_code: string | null;
  role: string;
  can_manage: boolean;
};

type Settings = {
  width: "80mm" | "58mm";
  footer_text: string;
  show_cnpj: boolean;
  show_address: boolean;
  show_seller: boolean;
  show_customer: boolean;
  auto_print: boolean;
};

const defaults: Settings = {
  width: "80mm",
  footer_text: "Obrigado pela preferência!",
  show_cnpj: true,
  show_address: true,
  show_seller: true,
  show_customer: true,
  auto_print: false,
};

export default function ComprovanteSettingsPage() {
  const supabase = createClient();
  const [organizationId, setOrganizationId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [settings, setSettings] = useState<Settings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [{ data: org }, { data: branchRows, error: branchError }] =
        await Promise.all([
          supabase.rpc("get_my_organization"),
          supabase.rpc("get_my_branches"),
        ]);

      if (branchError) throw new Error(branchError.message);
      if (!org?.length) throw new Error("Empresa não encontrada.");

      const available = (branchRows ?? []) as Branch[];
      setOrganizationId(org[0].organization_id);
      setBranches(available);

      const selected = available[0];
      if (!selected) throw new Error("Nenhuma filial disponível.");
      setBranchId(selected.branch_id);

      const { data, error: settingsError } = await supabase
        .from("receipt_settings")
        .select("width,footer_text,show_cnpj,show_address,show_seller,show_customer,auto_print")
        .eq("branch_id", selected.branch_id)
        .maybeSingle();

      if (settingsError) throw new Error(settingsError.message);
      setSettings({ ...defaults, ...(data ?? {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar as configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function changeBranch(id: string) {
    setBranchId(id);
    setMessage("");
    setError("");

    const { data, error: settingsError } = await supabase
      .from("receipt_settings")
      .select("width,footer_text,show_cnpj,show_address,show_seller,show_customer,auto_print")
      .eq("branch_id", id)
      .maybeSingle();

    if (settingsError) {
      setError(settingsError.message);
      return;
    }

    setSettings({ ...defaults, ...(data ?? {}) });
  }

  async function save() {
    const branch = branches.find((item) => item.branch_id === branchId);
    if (!branch?.can_manage) {
      setError("Apenas administrador ou proprietário pode alterar estas configurações.");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const { error: saveError } = await supabase
        .from("receipt_settings")
        .upsert(
          {
            organization_id: organizationId,
            branch_id: branchId,
            ...settings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "branch_id" }
        );

      if (saveError) throw new Error(saveError.message);
      setMessage("Configurações salvas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="page"><div className="panel">Carregando configurações...</div></div>;
  }

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">CONFIGURAÇÕES</span>
          <h1>Comprovante</h1>
          <p>Defina o formato e as informações do comprovante não fiscal.</p>
        </div>
        <ReceiptText size={34} />
      </div>

      <div className="settings-grid">
        <section className="panel">
          <label className="field-label">Filial</label>
          <select className="input" value={branchId} onChange={(event) => void changeBranch(event.target.value)}>
            {branches.map((branch) => (
              <option key={branch.branch_id} value={branch.branch_id}>
                {branch.branch_name}
              </option>
            ))}
          </select>

          <label className="field-label">Largura térmica</label>
          <div className="settings-choice-grid">
            {(["80mm", "58mm"] as const).map((width) => (
              <button
                key={width}
                type="button"
                className={"settings-choice " + (settings.width === width ? "active" : "")}
                onClick={() => setSettings((current) => ({ ...current, width }))}
              >
                {width}
              </button>
            ))}
          </div>

          <label className="field-label">Rodapé</label>
          <input
            className="input"
            value={settings.footer_text}
            onChange={(event) => setSettings((current) => ({ ...current, footer_text: event.target.value }))}
            placeholder="Obrigado pela preferência!"
          />

          <div className="settings-toggles">
            <label><input type="checkbox" checked={settings.show_address} onChange={(e) => setSettings((s) => ({ ...s, show_address: e.target.checked }))} /> Mostrar endereço</label>
            <label><input type="checkbox" checked={settings.show_seller} onChange={(e) => setSettings((s) => ({ ...s, show_seller: e.target.checked }))} /> Mostrar operador/vendedor</label>
            <label><input type="checkbox" checked={settings.show_customer} onChange={(e) => setSettings((s) => ({ ...s, show_customer: e.target.checked }))} /> Mostrar cliente</label>
            <label className="settings-disabled"><input type="checkbox" checked={settings.show_cnpj} disabled /> Mostrar CNPJ <small>Nenhum CNPJ está cadastrado no cadastro atual.</small></label>
            <label><input type="checkbox" checked={settings.auto_print} onChange={(e) => setSettings((s) => ({ ...s, auto_print: e.target.checked }))} /> Imprimir automaticamente após a venda</label>
          </div>

          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}

          <button className="button primary" type="button" disabled={saving} onClick={() => void save()}>
            <Save size={16} /> {saving ? "Salvando..." : "Salvar configurações"}
          </button>
        </section>

        <aside className="panel receipt-settings-preview">
          <span className="eyebrow">PRÉVIA</span>
          <div className={"receipt-settings-paper receipt-width-" + settings.width.replace("mm", "")}>
            <strong>MEUCAIXA</strong>
            <b>Sua empresa</b>
            <span>Venda #000123</span>
            <hr />
            <span>Produto de exemplo</span>
            <span>1 × R$ 10,00</span>
            <hr />
            <b>TOTAL R$ 10,00</b>
            <span>{settings.footer_text || "Obrigado pela preferência!"}</span>
            <small>Documento sem valor fiscal</small>
          </div>
        </aside>
      </div>
    </div>
  );
}
