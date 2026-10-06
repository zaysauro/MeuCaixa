import { createClient } from "@/lib/supabase/client";
import { mapCashError } from "./errors";
import type { CashSummary } from "./types";

export async function openCashRegister(
  branchId: string,
  openingBalance = 0,
  employeeId?: string | null
): Promise<string> {
  const normalized = Math.round(Math.max(Number(openingBalance), 0) * 100) / 100;

  if (!Number.isFinite(normalized)) {
    throw new Error("O saldo inicial informado é inválido.");
  }

  const supabase = createClient();

  const { data, error } = await supabase.rpc("open_cash_register", {
    p_branch_id: branchId,
    p_opening_balance: normalized,
    p_operator_user_id: employeeId || null,
  });

  if (error) throw new Error(mapCashError(error.message));
  if (!data) throw new Error("O caixa foi aberto, mas o sistema não retornou o identificador.");

  return String(data);
}

export async function getCurrentCash(
  branchId: string
): Promise<CashSummary | null> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_cash_current_summary_with_employee", {
    p_branch_id: branchId,
  });

  if (error) throw new Error(mapCashError(error.message));

  const row = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return null;

  return {
    registerId: String(row.register_id),
    branchId: String(row.branch_id),
    status: row.status as CashSummary["status"],
    terminalNumber: Number(row.terminal_number),
    terminalName: row.terminal_name ? String(row.terminal_name) : null,
    openedBy: row.opened_by ? String(row.opened_by) : null,
    employeeId: row.employee_id ? String(row.employee_id) : null,
    employeeName: row.employee_name ? String(row.employee_name) : null,
    employeeTitle: row.employee_title ? String(row.employee_title) : null,
    openedAt: String(row.opened_at),
    openingBalance: Number(row.opening_balance ?? 0),
    cashSales: Number(row.cash_sales ?? 0),
    cashEntries: Number(row.cash_entries ?? 0),
    cashWithdrawals: Number(row.cash_withdrawals ?? 0),
    cashRefunds: Number(row.cash_refunds ?? 0),
    expectedBalance: Number(row.expected_balance ?? 0),
    pixTotal: Number(row.pix_total ?? 0),
    debitTotal: Number(row.debit_total ?? 0),
    creditTotal: Number(row.credit_total ?? 0),
    otherTotal: Number(row.other_total ?? 0),
  };
}
