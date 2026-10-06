import { createClient } from "@/lib/supabase/client";
import { mapCashError } from "./errors";
import type { CashCloseResult, CashHistoryItem } from "./types";

export async function closeCashRegister(
  cashRegisterId: string,
  countedBalance: number,
  observation?: string
): Promise<CashCloseResult> {
  const normalized = Math.round(Number(countedBalance) * 100) / 100;

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error("O valor contado é inválido.");
  }

  const supabase = createClient();

  const { data, error } = await supabase.rpc("close_cash_register", {
    p_cash_register_id: cashRegisterId,
    p_counted_balance: normalized,
    p_observation: observation?.trim() || null,
  });

  if (error) throw new Error(mapCashError(error.message));

  const row = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) throw new Error("O fechamento foi processado, mas o sistema não retornou os valores.");

  return {
    registerId: String(row.register_id),
    expectedBalance: Number(row.expected_balance ?? 0),
    countedBalance: Number(row.counted_balance ?? 0),
    difference: Number(row.difference ?? 0),
    closedAt: String(row.closed_at),
  };
}

export async function getCashHistory(params?: {
  branchId?: string | null;
  status?: "open" | "closed" | null;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<CashHistoryItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_cash_register_history_with_employee", {
    p_branch_id: params?.branchId ?? null,
    p_status: params?.status ?? null,
    p_start_date: params?.startDate ?? null,
    p_end_date: params?.endDate ?? null,
  });

  if (error) throw new Error(mapCashError(error.message));

  return (data ?? []) as CashHistoryItem[];
}
