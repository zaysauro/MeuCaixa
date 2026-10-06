export type CashStatus = "open" | "closed";

export type CashMovementType =
  | "sale"
  | "sale_reversal"
  | "cash_in"
  | "cash_out"
  | "withdrawal"
  | "supply"
  | "adjustment";

export type CashMovementDirection = 1 | -1;

export type CashRegister = {
  register_id: string;
  branch_id: string;
  status: CashStatus;
  terminal_number: number;
  terminal_name: string | null;
  opened_by: string | null;
  opened_at: string;
  opening_balance: number;
  expected_balance: number | null;
  counted_balance: number | null;
  difference: number | null;
  closed_by?: string | null;
  closed_at?: string | null;
  closing_observation?: string | null;
};

export type CashSummary = {
  registerId: string;
  branchId: string;
  status: CashStatus;
  terminalNumber: number;
  terminalName: string | null;
  openedBy: string | null;
  employeeId: string | null;
  employeeName: string | null;
  employeeTitle: string | null;
  openedAt: string;
  openingBalance: number;
  cashSales: number;
  cashEntries: number;
  cashWithdrawals: number;
  cashRefunds: number;
  expectedBalance: number;
  pixTotal: number;
  debitTotal: number;
  creditTotal: number;
  otherTotal: number;
};

export type CashMovement = {
  movement_id: string;
  cash_register_id: string;
  branch_id: string;
  type: CashMovementType;
  amount: number;
  direction: CashMovementDirection;
  description: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type CashHistoryItem = {
  register_id: string;
  branch_id: string;
  branch_name: string;
  terminal_number: number;
  terminal_name: string | null;
  status: CashStatus;
  opened_by: string | null;
  employee_id: string | null;
  employee_name: string | null;
  employee_title: string | null;
  opened_at: string;
  opening_balance: number;
  closed_by: string | null;
  closed_at: string | null;
  expected_balance: number | null;
  counted_balance: number | null;
  difference: number | null;
  closing_observation: string | null;
};

export type CashCloseResult = {
  registerId: string;
  expectedBalance: number;
  countedBalance: number;
  difference: number;
  closedAt: string;
};

export type CashMovementInput = {
  cashRegisterId: string;
  type: Exclude<CashMovementType, "sale" | "sale_reversal">;
  amount: number;
  description?: string;
  direction?: CashMovementDirection;
};
