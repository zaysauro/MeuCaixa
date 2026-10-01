export type ReportPeriod =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "previous_month"
  | "custom";

export type ReportView = "individual" | "consolidated";

export type ReportFilters = {
  period: ReportPeriod;
  branchId: string | null;
  view: ReportView;
  compare: boolean;
  from?: string;
  to?: string;
};

export type ReportRange = {
  start: string;
  end: string;
  compareStart: string | null;
  compareEnd: string | null;
  label: string;
};

export type BranchOption = {
  branch_id: string;
  organization_id: string;
  branch_name: string;
  branch_code: string;
  is_headquarters: boolean;
  active: boolean;
  role: string;
  can_manage: boolean;
};

export type SalesReport = {
  summary: {
    sales_count: number;
    revenue: number;
    gross_before_discount: number;
    discount: number;
    average_ticket: number;
    cancelled_count: number;
    cancelled_value: number;
  };
  comparison: {
    sales_count: number;
    revenue: number;
    discount: number;
  };
  payment_breakdown: Array<{ method: string; amount: number }>;
  trend: Array<{ bucket: string; label: string; revenue: number; sales_count: number }>;
  rows: Array<{
    id: string;
    sale_number: number;
    branch_id: string;
    branch_name: string;
    status: string;
    subtotal: number;
    discount: number;
    total: number;
    total_discount: number;
    created_at: string;
    customer_name: string | null;
    seller_name: string | null;
  }>;
  total_rows: number;
};

export type ProductsReport = {
  summary: {
    active_products: number;
    products_sold: number;
    products_without_cost: number;
    items_without_cost: number;
    low_stock_count: number;
    zero_stock_count: number;
  };
  top_by_quantity: ProductReportRow[];
  top_by_revenue: ProductReportRow[];
  low_stock: StockReportRow[];
  zero_stock: StockReportRow[];
  no_sales: NoSaleProductRow[];
};

export type ProductReportRow = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  revenue: number;
  known_cost: number;
  known_profit: number;
  margin: number | null;
  quantity_without_cost: number;
};

export type StockReportRow = {
  product_id: string;
  product_name: string;
  branch_name: string;
  stock_quantity: number;
  minimum_stock: number;
};

export type NoSaleProductRow = {
  product_id: string;
  product_name: string;
  sale_price: number;
  unit: string;
  stock_quantity: number | null;
};

export type CashReport = {
  summary: {
    register_count: number;
    open_count: number;
    difference_total: number;
    cash_out_total: number;
    cash_in_total: number;
  };
  registers: Array<{
    register_id: string;
    branch_id: string;
    branch_name: string;
    terminal_number: number | null;
    terminal_name: string | null;
    status: string;
    opened_at: string;
    closed_at: string | null;
    opening_balance: number;
    expected_balance: number | null;
    counted_balance: number | null;
    difference: number | null;
    closing_observation: string | null;
    opened_by_name: string | null;
    closed_by_name: string | null;
  }>;
  operator_summary: Array<{
    operator_name: string;
    register_count: number;
    difference_total: number;
    cash_out_total: number;
  }>;
};

export type BranchReport = {
  rows: Array<{
    branch_id: string;
    branch_name: string;
    is_headquarters: boolean;
    sales_count: number;
    revenue: number;
    discount: number;
    average_ticket: number;
    cancelled_count: number;
    cancelled_value: number;
    cash_difference: number;
    low_stock_count: number;
    participation: number;
  }>;
  total: {
    sales_count: number;
    revenue: number;
    discount: number;
    cancelled_count: number;
    cancelled_value: number;
    cash_difference: number;
    low_stock_count: number;
  };
};

export type FinancialReport = {
  basis: {
    competence: string;
    cash: string;
  };
  competence: { income: number; expense: number };
  cash: { income: number; expense: number };
  open_payables: number;
  open_receivables: number;
  overdue_payables: number;
  overdue_receivables: number;
  categories: Array<{
    category: string;
    income: number;
    expense: number;
  }>;
};