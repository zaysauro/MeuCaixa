const messages: Record<string, string> = {
  not_authenticated: "Sua sessão expirou. Entre novamente.",
  invalid_branch: "Você não tem acesso a esta filial.",
  cash_already_open: "Já existe um caixa aberto nesta filial.",
  cash_not_open: "Este caixa não está aberto.",
  cash_not_found: "Caixa não encontrado.",
  cash_already_closed: "Este caixa já foi fechado.",
  opening_balance_invalid: "O saldo inicial não pode ser negativo.",
  counted_balance_invalid: "O valor contado não pode ser negativo.",
  cash_movement_amount_invalid: "O valor da movimentação deve ser maior que zero.",
  cash_movement_type_invalid: "Tipo de movimentação inválido.",
  cash_movement_direction_invalid: "Direção da movimentação inválida.",
  withdrawal_reason_required: "Informe o motivo da retirada.",
  closing_observation_required: "Informe uma observação quando houver diferença no fechamento.",
  cash_movement_immutable: "Movimentações de caixa não podem ser editadas ou apagadas.",
  cash_closed_immutable: "Caixas fechados não podem ser alterados.",
  invalid_cash_close: "Os dados do fechamento estão incompletos.",
};

export function mapCashError(message: string): string {
  const normalized = message.toLowerCase();

  for (const [key, value] of Object.entries(messages)) {
    if (normalized.includes(key)) return value;
  }

  return message;
}
