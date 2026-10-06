"use client";

import { useEffect, useState } from "react";
import { Pencil, Power, RefreshCw, UserPlus, Users } from "lucide-react";
import { ContextHelp } from "@/components/ContextHelp";
import { createClient } from "@/lib/supabase/client";
import { createEmployee, listEmployees, setEmployeeActive, updateEmployee, type Employee } from "@/lib/employees";

type Branch = { branch_id: string; branch_name: string };
type FormState = { name: string; title: string; email: string; phone: string; branchId: string };
const emptyForm: FormState = { name: "", title: "Caixa", email: "", phone: "", branchId: "" };

export default function FuncionariosPage() {
  const supabase = createClient();
  const [organizationId, setOrganizationId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function load() {
    setError("");
    const { data: org, error: orgError } = await supabase.rpc("get_my_organization");
    const id = org?.[0]?.organization_id;
    if (orgError || !id) { setError(orgError?.message || "Empresa não configurada."); return; }
    setOrganizationId(id);
    try {
      const [items, branchResult] = await Promise.all([listEmployees(id), supabase.rpc("get_my_branches")]);
      setEmployees(items);
      if (!branchResult.error) setBranches((branchResult.data ?? []) as Branch[]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar os funcionários."); }
  }

  useEffect(() => { void load(); }, []);
  function openCreate() { setEditing(null); setForm(emptyForm); setMessage(""); setError(""); setShowForm(true); }
  function openEdit(employee: Employee) { setEditing(employee); setForm({ name: employee.name, title: employee.title, email: employee.email ?? "", phone: employee.phone ?? "", branchId: employee.branch_id ?? "" }); setMessage(""); setError(""); setShowForm(true); }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!organizationId) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (editing) await updateEmployee({ id: editing.id, name: form.name, title: form.title, email: form.email, phone: form.phone, branchId: form.branchId || null });
      else await createEmployee({ organizationId, name: form.name, title: form.title, email: form.email, phone: form.phone, branchId: form.branchId || null });
      setShowForm(false); setForm(emptyForm); setMessage(editing ? "Funcionário atualizado." : "Funcionário cadastrado."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar o funcionário."); }
    finally { setBusy(false); }
  }

  async function toggle(employee: Employee) {
    if (employee.active && !window.confirm(`Deseja desativar ${employee.name}? O histórico será preservado.`)) return;
    setBusyId(employee.id); setError(""); setMessage("");
    try { await setEmployeeActive(employee.id, !employee.active); setMessage(employee.active ? "Funcionário desativado." : "Funcionário reativado."); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o funcionário."); }
    finally { setBusyId(""); }
  }

  return <div className="page users-page">
    <div className="page-header users-header"><div><span className="eyebrow">OPERAÇÃO</span><h1>Funcionários</h1><p>Cadastre os funcionários da sua empresa para identificar quem está operando o caixa e registrar responsáveis pelas operações.</p></div><div className="actions"><ContextHelp title="Sobre funcionários" description="O cadastro é operacional e não cria login, senha, convite ou conta no Supabase Auth."/><button className="button primary" onClick={openCreate}><UserPlus size={16}/> Adicionar funcionário</button></div></div>
    {error && <div className="error">{error}</div>}{message && <div className="success">{message}</div>}
    <section className="panel"><div className="users-table-heading"><div><h2>{employees.filter((employee) => employee.active).length} funcionário(s) ativo(s)</h2><p>O cadastro é opcional e não cria novos acessos ao sistema.</p></div><button className="button secondary" onClick={() => void load()}><RefreshCw size={15}/> Atualizar</button></div><div className="table-wrap"><table className="users-table"><thead><tr><th>Funcionário</th><th>Função</th><th>Filial</th><th>Status</th><th>Ações</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td><strong>{employee.name}</strong><small>{[employee.email, employee.phone].filter(Boolean).join(" · ") || "Sem contato informado"}</small></td><td>{employee.title}</td><td>{employee.branch_name || "Todas"}</td><td>{employee.active ? "Ativo" : "Desativado"}</td><td><button className="button small" onClick={() => openEdit(employee)}><Pencil size={14}/> Editar</button> <button className="button small" disabled={busyId === employee.id} onClick={() => void toggle(employee)}><Power size={14}/> {employee.active ? "Desativar" : "Reativar"}</button></td></tr>)}</tbody></table>{!employees.length && <div className="users-empty"><Users size={27}/><h3>Nenhum funcionário cadastrado</h3><p>Adicione funcionários somente para identificar os operadores das sessões de caixa.</p></div>}</div></section>
    <section className="support-card"><div><span className="eyebrow">SOBRE ESTA ÁREA</span><h2>Cadastro operacional</h2><p>O funcionário não recebe e-mail, senha ou convite. Ao abrir uma sessão de caixa, você poderá selecionar um funcionário ativo como operador.</p></div></section>
    {showForm && <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="users-modal" onSubmit={save}><div className="users-modal-header"><div><span className="eyebrow">{editing ? "EDITAR FUNCIONÁRIO" : "NOVO FUNCIONÁRIO"}</span><h2>{editing ? "Editar funcionário" : "Adicionar funcionário"}</h2></div><button type="button" className="icon-button" onClick={() => setShowForm(false)}>×</button></div><div className="users-form-grid"><label>Nome *<input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus/></label><label>Função<select className="field" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}><option>Caixa</option><option>Gerente</option><option>Vendedor</option><option>Estoquista</option><option>Atendente</option><option>Outro</option></select></label><label>E-mail opcional<input className="field" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></label><label>Telefone opcional<input className="field" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })}/></label><label>Filial opcional<select className="field" value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })}><option value="">Todas as filiais</option>{branches.map((branch) => <option key={branch.branch_id} value={branch.branch_id}>{branch.branch_name}</option>)}</select></label></div><div className="users-modal-actions"><button type="button" className="button secondary" onClick={() => setShowForm(false)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar funcionário"}</button></div></form></div>}
  </div>;
}
