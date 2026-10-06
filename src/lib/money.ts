const MONEY_PATTERN = /^[0-9.,]+$/;

function normalizeText(value: string): string {
  return value
    .replace(/R\$|BRL/gi, "")
    .replace(/[\s\u00a0]/g, "")
    .trim();
}

/** Parses a user-entered BRL amount without treating decimal dots as thousands. */
export function parseBRLMoneyInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? roundMoney(value) : null;

  const text = normalizeText(value);
  if (!text || !MONEY_PATTERN.test(text) || text.startsWith(".") || text.startsWith(",") || text.includes("..") || text.includes(",,")) return null;

  const separators = [...text].filter((character) => character === "." || character === ",");
  let integerPart = text;
  let decimalPart = "";

  if (separators.length) {
    const lastSeparator = Math.max(text.lastIndexOf("."), text.lastIndexOf(","));
    const afterLast = text.slice(lastSeparator + 1);
    const beforeLast = text.slice(0, lastSeparator);

    if (separators.length === 1 && afterLast.length === 3) {
      integerPart = text.replace(/[.,]/g, "");
    } else {
      if (afterLast.length < 1 || afterLast.length > 2) return null;
      integerPart = beforeLast.replace(/[.,]/g, "");
      decimalPart = afterLast;
    }
  }

  if (!/^\d+$/.test(integerPart) || (decimalPart && !/^\d{1,2}$/.test(decimalPart))) return null;
  const parsed = Number(`${integerPart}.${decimalPart || "0"}`);
  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

/** Parses localized non-money decimals such as stock quantities. */
export function parseLocalizedDecimalInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = normalizeText(value);
  if (!/^[0-9.,]+$/.test(text)) return null;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  const separator = Math.max(lastDot, lastComma);
  const normalized = separator >= 0
    ? `${text.slice(0, separator).replace(/[.,]/g, "")}.${text.slice(separator + 1)}`
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatBRL(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

export function formatMoneyInput(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

export function moneyToDatabase(value: string | number | null | undefined): number | null {
  return parseBRLMoneyInput(value);
}

export function databaseToMoney(value: string | number | null | undefined): number | null {
  return parseBRLMoneyInput(value);
}
