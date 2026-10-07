"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = {
  organizationId: string;
  initialName: string;
  canEdit: boolean;
};

export default function CompanyNameForm({ organizationId, initialName, canEdit }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(initialName);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canEdit) return;

    const nextName = name.trim();
    if (!nextName) {
      setError("Informe o nome da empresa.");
      setMessage("");
      return;
    }

    setSaving(true);
    setMessage("");
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ name: nextName, updated_at: new Date().toISOString() })
        .eq("id", organizationId)
        .select("id")
        .single();

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setName(nextName);
      setMessage("Nome da empresa atualizado com sucesso.");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível atualizar o nome da empresa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="company-name-form" onSubmit={submit}>
      <label>
        Nome da empresa
        <input className="field" value={name} onChange={(event) => setName(event.target.value)} disabled={!canEdit || saving} maxLength={160} />
      </label>
      {canEdit ? (
        <button className="button primary" type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      ) : (
        <small>Somente proprietários e administradores podem alterar este nome.</small>
      )}
      {message && <div className="success" role="status">{message}</div>}
      {error && <div className="error" role="alert">{error}</div>}
    </form>
  );
}
