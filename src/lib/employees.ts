import { createClient } from "@/lib/supabase/client";

export type Employee = {
  id: string;
  organization_id: string;
  branch_id: string | null;
  branch_name: string | null;
  name: string;
  title: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listEmployees(organizationId: string) {
  const { data, error } = await createClient().rpc("employee_list", { p_organization_id: organizationId });
  if (error) throw new Error(error.message);
  return (data ?? []) as Employee[];
}

export async function createEmployee(input: { organizationId: string; name: string; title: string; email?: string; phone?: string; branchId?: string | null }) {
  const { data, error } = await createClient().rpc("employee_create", {
    p_organization_id: input.organizationId,
    p_name: input.name,
    p_title: input.title,
    p_email: input.email || null,
    p_phone: input.phone || null,
    p_branch_id: input.branchId || null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function updateEmployee(input: { id: string; name: string; title: string; email?: string; phone?: string; branchId?: string | null }) {
  const { error } = await createClient().rpc("employee_update", {
    p_employee_id: input.id,
    p_name: input.name,
    p_title: input.title,
    p_email: input.email || null,
    p_phone: input.phone || null,
    p_branch_id: input.branchId || null,
  });
  if (error) throw new Error(error.message);
}

export async function setEmployeeActive(id: string, active: boolean) {
  const { error } = await createClient().rpc("employee_set_active", { p_employee_id: id, p_active: active });
  if (error) throw new Error(error.message);
}
