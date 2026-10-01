"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Branch = {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  is_headquarters: boolean;
  can_manage: boolean;
};

export default function FiliaisPage() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const { data, error } = await supabase.rpc("get_my_branches");
    if (error) setMessage(error.message);
    else setBranches((data ?? []) as Branch[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.rpc("create_branch", {
      p_name: name.trim(),
      p_code: code.trim() || null,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setName("");
      setCode("");
      setMessage("Filial criada com sucesso.");
      await load();
    }

    setLoading(false);
  }

  const canManage = branches.some((branch) => branch.can_manage);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <span className="eyebrow">ESTRUTURA DA EMPRESA</span>
          <h1>Matriz e filiais</h1>
          <p>
            Uma única empresa pode administrar várias unidades. Cada filial
            possui seu próprio caixa, estoque, vendas e resultados.
          </p>
        </div>
      </div>

      {canManage && (
        <div className="panel">
          <h2>Adicionar filial</h2>
          <p>
            A matriz já existe. Use este formulário para adicionar novas lojas
            à mesma empresa.
          </p>

          <form className="form-grid" onSubmit={submit}>
            <label>
              Nome da filial
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Loja Centro"
                required
              />
            </label>

            <label>
              Código
              <input
                className="field"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Automático se vazio"
              />
            </label>

            <div className="product-form-action">
              <button className="button primary" disabled={loading}>
                {loading ? "Criando..." : "Adicionar filial"}
              </button>
            </div>
          </form>
        </div>
      )}

      {message && (
        <div className={message.includes("sucesso") ? "success" : "error"}>
          {message}
        </div>
      )}

      <div className="panel">
        <h2>Unidades da empresa</h2>

        <div className="branch-cards">
          {branches.map((branch) => (
            <div className="branch-card" key={branch.branch_id}>
              <div>
                <span className="eyebrow">
                  {branch.is_headquarters ? "MATRIZ" : "FILIAL"}
                </span>
                <h3>{branch.branch_name}</h3>
                <p>Código: {branch.branch_code}</p>
              </div>

              <a
                className="button secondary compact-button"
                href={"/dashboard?branch=" + branch.branch_id}
              >
                Ver unidade
              </a>
            </div>
          ))}

          {!branches.length && <p>Nenhuma unidade encontrada.</p>}
        </div>
      </div>
    </div>
  );
}
