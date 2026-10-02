"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  MailPlus,
  MoreHorizontal,
  Search,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";
import { roleDescription, roleLabel, type AppRole } from "@/lib/rbac";

type UserStatus = "active" | "pending" | "inactive";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  branches: string[];
  status: UserStatus;
  lastAccess: string | null;
};

const emptyUsers: UserRow[] = [];

const statusLabels: Record<UserStatus, string> = {
  active: "Ativo",
  pending: "Convite pendente",
  inactive: "Desativado",
};

export default function UsuariosPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | UserStatus>("all");
  const [role, setRole] = useState<"all" | AppRole>("all");
  const [showInvite, setShowInvite] = useState(false);
  const [users] = useState<UserRow[]>(emptyUsers);
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery =
        !q ||
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q);
      const matchesStatus = status === "all" || user.status === status;
      const matchesRole = role === "all" || user.role === role;
      return matchesQuery && matchesStatus && matchesRole;
    });
  }, [users, query, status, role]);

  function comingSoon(action: string) {
    setNotice(action + " ficará disponível após a conexão com o backend de usuários.");
  }

  return (
    <div className="page users-page">
      <div className="page-header users-header">
        <div>
          <span className="eyebrow">ACESSO DA EMPRESA</span>
          <h1>Usuários</h1>
          <p>Gerencie quem pode acessar esta empresa e quais operações cada pessoa pode executar.</p>
        </div>
        <button className="button primary users-invite-button" onClick={() => setShowInvite(true)}>
          <UserPlus size={16} /> Convidar usuário
        </button>
      </div>

      <div className="users-role-strip">
        {(["owner", "admin", "manager", "operator"] as AppRole[]).map((item) => (
          <div className="users-role-card" key={item}>
            <div className="users-role-icon"><Shield size={16} /></div>
            <div>
              <strong>{roleLabel(item)}</strong>
              <small>{roleDescription(item)}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="panel users-toolbar">
        <label className="users-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou e-mail"
          />
        </label>

        <label>
          <span>Função</span>
          <select className="field" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="all">Todas</option>
            <option value="owner">Proprietário</option>
            <option value="admin">Administrador</option>
            <option value="manager">Gerente</option>
            <option value="operator">Operador</option>
          </select>
        </label>

        <label>
          <span>Status</span>
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="pending">Convites pendentes</option>
            <option value="inactive">Desativados</option>
          </select>
        </label>
      </div>

      {notice && (
        <div className="info-banner">
          <span>{notice}</span>
          <button onClick={() => setNotice("")}>Fechar</button>
        </div>
      )}

      <div className="panel users-table-panel">
        <div className="users-table-heading">
          <div>
            <h2>Equipe</h2>
            <p>{users.length} usuário(s) cadastrado(s).</p>
          </div>
          <button className="button secondary compact-button" onClick={() => comingSoon("Atualização da lista")}>
            Atualizar
          </button>
        </div>

        {filtered.length > 0 ? (
          <div className="table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Função</th>
                  <th>Filiais</th>
                  <th>Status</th>
                  <th>Último acesso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.name}</strong><small>{user.email}</small></td>
                    <td><span className="role-pill">{roleLabel(user.role)}</span></td>
                    <td>{user.branches.join(", ") || "Todas"}</td>
                    <td><span className={"user-status " + user.status}>{statusLabels[user.status]}</span></td>
                    <td>{user.lastAccess || "Nunca acessou"}</td>
                    <td>
                      <button className="icon-button" title="Mais ações" onClick={() => comingSoon("Ações do usuário")}>
                        <MoreHorizontal size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="users-empty">
            <div className="users-empty-icon"><Users size={27} /></div>
            <h3>Nenhum usuário para exibir</h3>
            <p>
              A estrutura de usuários está pronta. Os dados reais entrarão aqui
              quando conectarmos convites, memberships e autenticação ao Supabase.
            </p>
            <button className="button primary" onClick={() => setShowInvite(true)}>
              <MailPlus size={16} /> Preparar convite
            </button>
          </div>
        )}
      </div>

      {showInvite && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="users-modal">
            <div className="users-modal-header">
              <div>
                <span className="eyebrow">NOVO ACESSO</span>
                <h2>Convidar usuário</h2>
              </div>
              <button className="icon-button" onClick={() => setShowInvite(false)}>×</button>
            </div>

            <div className="users-form-grid">
              <label>
                Nome
                <input className="field" placeholder="Nome do funcionário" />
              </label>
              <label>
                E-mail individual
                <input className="field" type="email" placeholder="funcionario@empresa.com" />
              </label>
              <label>
                Função
                <select className="field" defaultValue="operator">
                  <option value="operator">Operador</option>
                  <option value="manager">Gerente</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              <label>
                Filiais
                <select className="field" defaultValue="all">
                  <option value="all">Todas as filiais</option>
                  <option value="selected">Selecionar depois</option>
                </select>
              </label>
            </div>

            <div className="users-modal-note">
              <CheckCircle2 size={16} />
              <span>Cada funcionário terá uma conta individual. O compartilhamento de senha não faz parte do modelo.</span>
            </div>

            <div className="users-modal-actions">
              <button className="button secondary" onClick={() => setShowInvite(false)}>Cancelar</button>
              <button className="button primary" onClick={() => comingSoon("Envio do convite")}>
                <MailPlus size={16} /> Enviar convite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
