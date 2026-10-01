import { createClient } from "@/lib/supabase/client";

export type SalesHistoryRow = {
  sale_id: string;
  sale_number: number;
  branch_id: string;
  branch_name: string | null;
  status: "completed" | "cancelled";
  total: number;
  discount: number;
  customer_name: string | null;
  seller_name: string | null;
  created_at: string;
};

export async function getSalesHistory(params?: {
  branchId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<SalesHistoryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_sales_history", {
    p_branch_id: params?.branchId ?? null,
    p_limit: params?.limit ?? 50,
    p_offset: params?.offset ?? 0,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as SalesHistoryRow[];
}
