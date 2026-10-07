const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  credit_card: "Crédito",
  debit_card: "Débito",
  other: "Outro",
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  cash_in: "Entrada",
  supply: "Reforço",
  cash_out: "Saída",
  withdrawal: "Sangria",
  adjustment: "Ajuste",
  sale: "Venda",
  sale_reversal: "Estorno",
};

const FINANCE_STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  partial: "Parcial",
  paid: "Paga",
  received: "Recebida",
  overdue: "Vencida",
  cancelled: "Cancelada",
};

const FINANCE_ORIGIN_LABELS: Record<string, string> = {
  manual: "Manual",
  purchase: "Compra",
  sale_credit: "Venda a prazo",
  recurrence: "Recorrência",
  other_income: "Outra receita",
  other_expense: "Outra despesa",
  legacy: "Legado",
};

const ACCOUNT_KIND_LABELS: Record<string, string> = {
  cash: "Caixa",
  bank: "Banco",
  digital_wallet: "Carteira digital",
  other: "Outra",
};

function labelFrom(map: Record<string, string>, value: string | null | undefined, fallback: string): string {
  return (value && map[value]) || fallback;
}

export function paymentMethodLabel(value: string | null | undefined): string {
  return labelFrom(PAYMENT_METHOD_LABELS, value, "Outro");
}

export function movementTypeLabel(value: string | null | undefined): string {
  return labelFrom(MOVEMENT_TYPE_LABELS, value, "Movimentação");
}

export function financeStatusLabel(value: string | null | undefined): string {
  return labelFrom(FINANCE_STATUS_LABELS, value, "Status não informado");
}

export function financeOriginLabel(value: string | null | undefined): string {
  return labelFrom(FINANCE_ORIGIN_LABELS, value, "Origem não informada");
}

export function accountKindLabel(value: string | null | undefined): string {
  return labelFrom(ACCOUNT_KIND_LABELS, value, "Outra");
}
