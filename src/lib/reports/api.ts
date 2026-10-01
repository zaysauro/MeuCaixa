import { createClient } from "@/lib/supabase/client";
import type {
  BranchOption,
  BranchReport,
  CashReport,
  FinancialReport,
  ProductsReport,
  ReportRange,
  SalesReport,
} from "./types";

export async function loadReportBranches(): Promise<BranchOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_my_branches");
  if (error) throw new Error(error.message);
  return (data ?? []) as BranchOption[];
}

export async function loadReports(params: {
  organizationId: string;
  branchId: string | null;
  range: ReportRange;
  compare: boolean;
  page?: number;
}): Promise<{
  sales: SalesReport;
  products: ProductsReport;
  cash: CashReport;
  branches: BranchReport;
  finance: FinancialReport;
}> {
  const supabase = createClient();
  const compareStart = params.compare ? params.range.compareStart : null;
  const compareEnd = params.compare ? params.range.compareEnd : null;

  const [sales, products, cash, branches, finance] = await Promise.all([
    supabase.rpc("get_sales_report", {
      p_organization_id: params.organizationId,
      p_branch_id: params.branchId,
      p_start: params.range.start,
      p_end: params.range.end,
      p_compare_start: compareStart,
      p_compare_end: compareEnd,
      p_page: params.page ?? 1,
      p_page_size: 50,
    }),
    supabase.rpc("get_products_report", {
      p_organization_id: params.organizationId,
      p_branch_id: params.branchId,
      p_start: params.range.start,
      p_end: params.range.end,
      p_top_n: 10,
    }),
    supabase.rpc("get_cash_report", {
      p_organization_id: params.organizationId,
      p_branch_id: params.branchId,
      p_start: params.range.start,
      p_end: params.range.end,
    }),
    supabase.rpc("get_branch_report", {
      p_organization_id: params.organizationId,
      p_branch_id: params.branchId,
      p_start: params.range.start,
      p_end: params.range.end,
    }),
    supabase.rpc("get_financial_report", {
      p_organization_id: params.organizationId,
      p_branch_id: params.branchId,
      p_start: params.range.start,
      p_end: params.range.end,
    }),
  ]);

  for (const result of [sales, products, cash, branches, finance]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    sales: sales.data as SalesReport,
    products: products.data as ProductsReport,
    cash: cash.data as CashReport,
    branches: branches.data as BranchReport,
    finance: finance.data as FinancialReport,
  };
}