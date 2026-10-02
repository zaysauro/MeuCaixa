export type AppRole = "owner" | "admin" | "manager" | "operator" | "cashier" | "employee";

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
  cashier: "Operador",
  employee: "Operador",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  owner: "Acesso total à empresa e às configurações.",
  admin: "Administração operacional, usuários e configurações permitidas.",
  manager: "Gestão da operação da unidade, caixa, estoque e relatórios.",
  operator: "PDV, clientes, consulta de produtos e caixa próprio.",
  cashier: "Perfil legado equivalente ao operador.",
  employee: "Perfil legado equivalente ao operador.",
};

export const PERMISSIONS = {
  sales: ["sales.view","sales.create","sales.edit","sales.cancel","sales.discount","sales.history","sales.receipt.view","sales.receipt.reprint"],
  cash: ["cash.view","cash.open","cash.close","cash.withdrawal","cash.reinforcement","cash.count","cash.history","cash.view_all_registers"],
  products: ["products.view","products.create","products.edit","products.delete","products.price_edit","products.cost_edit","products.category_manage"],
  stock: ["stock.view","stock.adjust","stock.entry","stock.transfer","stock.history","stock.inventory"],
  customers: ["customers.view","customers.create","customers.edit","customers.delete"],
  reports: ["reports.view","reports.view_branch","reports.view_all_branches","reports.export","reports.financial"],
  finance: ["finance.view","finance.create","finance.edit","finance.delete","finance.pay","finance.export"],
  branches: ["branches.view","branches.create","branches.edit","branches.deactivate","branches.manage_access"],
  users: ["users.view","users.invite","users.edit","users.change_role","users.manage_branches","users.deactivate","users.reactivate","users.resend_invite","users.cancel_invite"],
  settings: ["settings.view","settings.edit","settings.receipt","settings.company","settings.permissions"],
  billing: ["billing.view","billing.manage","billing.cancel"],
  company: ["company.view","company.edit","company.delete","company.transfer_ownership"],
  audit: ["audit.view"],
  security: ["sales.discount_limit.manage","sensitive_operation.authorize"],
} as const;

const ADMIN_EXCLUDED = new Set([
  "company.delete",
  "company.transfer_ownership",
  "billing.cancel",
  "billing.manage",
  "settings.permissions",
]);

const MANAGER_PERMISSIONS = new Set([
  ...PERMISSIONS.sales,
  ...PERMISSIONS.cash,
  ...PERMISSIONS.products,
  ...PERMISSIONS.stock,
  ...PERMISSIONS.customers,
  "reports.view",
  "reports.view_branch",
  "reports.export",
  "reports.financial",
  "finance.view",
  "finance.create",
  "finance.edit",
  "finance.pay",
  "finance.export",
  "settings.view",
  "settings.receipt",
  "company.view",
  "branches.view",
  "sensitive_operation.authorize",
]);

const OPERATOR_PERMISSIONS = new Set([
  "sales.view","sales.create","sales.discount","sales.history",
  "sales.receipt.view","sales.receipt.reprint",
  "cash.view","cash.open","cash.close","cash.history",
  "products.view",
  "customers.view","customers.create","customers.edit",
  "reports.view_branch",
]);

export function roleLabel(role?: string | null) {
  return ROLE_LABELS[(role || "operator") as AppRole] ?? role ?? "Usuário";
}

export function roleDescription(role: string) {
  return ROLE_DESCRIPTIONS[role as AppRole] ?? "Acesso definido pela empresa.";
}

/**
 * Frontend-only permission helper.
 * The database remains the authoritative security layer.
 */
export function roleHasPermission(role: string | null | undefined, permission: string) {
  const normalized = (role || "").toLowerCase();

  if (normalized === "owner") return true;
  if (normalized === "admin") return !ADMIN_EXCLUDED.has(permission);
  if (normalized === "manager") return MANAGER_PERMISSIONS.has(permission);
  if (normalized === "operator" || normalized === "cashier" || normalized === "employee") {
    return OPERATOR_PERMISSIONS.has(permission);
  }

  return false;
}

export function canAccessRoute(role: string | null | undefined, route: string) {
  const checks: Array<[string, string]> = [
    ["/dashboard/filiais", "branches.view"],
    ["/dashboard/vendas", "sales.view"],
    ["/dashboard/produtos", "products.view"],
    ["/dashboard/estoque", "stock.view"],
    ["/dashboard/caixa", "cash.view"],
    ["/dashboard/financeiro", "finance.view"],
    ["/dashboard/clientes", "customers.view"],
    ["/dashboard/fornecedores", "products.view"],
    ["/dashboard/relatorios", "reports.view"],
    ["/dashboard/configuracoes/usuarios", "users.view"],
    ["/dashboard/configuracoes/comprovante", "settings.receipt"],
    ["/dashboard/configuracoes", "settings.view"],
  ];

  const match = checks.find(([prefix]) => route === prefix || route.startsWith(prefix + "/"));
  return match ? roleHasPermission(role, match[1]) : true;
}
