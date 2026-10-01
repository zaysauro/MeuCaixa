import { createClient } from "@/lib/supabase/client";
import type { POSCustomer } from "./types";

type CustomerRow = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
};

export async function getPOSOrganization(): Promise<{
  organizationId: string;
  organizationName: string;
  branchId: string | null;
  branchName: string | null;
  role: string;
}> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_my_organization");

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row?.organization_id) {
    throw new Error("Nenhuma empresa configurada para este usuário.");
  }

  return {
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    branchId: row.branch_id ?? null,
    branchName: row.branch_name ?? null,
    role: row.role,
  };
}

export async function searchCustomers(
  organizationId: string,
  query = "",
  limit = 10
): Promise<POSCustomer[]> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("search_pos_customers", {
    p_organization_id: organizationId,
    p_query: query.trim(),
    p_limit: Math.min(Math.max(limit, 1), 30),
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CustomerRow[];
}
