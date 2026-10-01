import { createClient } from "@/lib/supabase/client";
import { mapCashError } from "./errors";
import type { CashMovement, CashMovementInput } from "./types";

export async function registerCashMovement(
  input: CashMovementInput
): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("register_cash_movement", {
    p_cash_register_id: input.cashRegisterId,
    p_type: input.type,
    p_amount: Math.round(input.amount * 100) / 100,
    p_description: input.description?.trim() || null,
    p_direction: input.direction ?? null,
  });

  if (error) throw new Error(mapCashError(error.message));
  if (!data) throw new Error("A movimentação foi registrada, mas o sistema não retornou o identificador.");

  return String(data);
}

export async function getCashMovements(
  cashRegisterId: string
): Promise<CashMovement[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_cash_register_movements", {
    p_cash_register_id: cashRegisterId,
  });

  if (error) throw new Error(mapCashError(error.message));

  return (data ?? []) as CashMovement[];
}
