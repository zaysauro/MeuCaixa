import type { ReportFilters, ReportPeriod, ReportRange } from "./types";

const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

function localDateParts(date: Date): { y: number; m: number; d: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = formatter.format(date).split("-").map(Number);
  return { y, m, d };
}

function localMidnightUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d) + SAO_PAULO_OFFSET_MS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

function startOfWeek(date: Date): Date {
  const parts = localDateParts(date);
  const base = localMidnightUtc(parts.y, parts.m, parts.d);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(base);
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const day = map[weekday] ?? 1;
  const daysFromMonday = day === 0 ? -6 : 1 - day;
  return addDays(base, daysFromMonday);
}

function monthStart(date: Date, deltaMonths = 0): Date {
  const { y, m } = localDateParts(date);
  return localMidnightUtc(y, m + deltaMonths, 1);
}

function rangeForPeriod(period: ReportPeriod, customFrom?: string, customTo?: string): ReportRange {
  const now = new Date();

  if (period === "today") {
    const p = localDateParts(now);
    const start = localMidnightUtc(p.y, p.m, p.d);
    const end = addDays(start, 1);
    const previous = addDays(start, -1);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      compareStart: previous.toISOString(),
      compareEnd: start.toISOString(),
      label: "Hoje",
    };
  }

  if (period === "yesterday") {
    const p = localDateParts(now);
    const today = localMidnightUtc(p.y, p.m, p.d);
    const start = addDays(today, -1);
    return {
      start: start.toISOString(),
      end: today.toISOString(),
      compareStart: addDays(start, -1).toISOString(),
      compareEnd: start.toISOString(),
      label: "Ontem",
    };
  }

  if (period === "week") {
    const start = startOfWeek(now);
    const end = addDays(start, 7);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      compareStart: addDays(start, -7).toISOString(),
      compareEnd: start.toISOString(),
      label: "Semana atual",
    };
  }

  if (period === "month") {
    const start = monthStart(now);
    const end = monthStart(now, 1);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      compareStart: monthStart(now, -1).toISOString(),
      compareEnd: start.toISOString(),
      label: "Mês atual",
    };
  }

  if (period === "previous_month") {
    const start = monthStart(now, -1);
    const end = monthStart(now);
    const previousStart = monthStart(now, -2);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      compareStart: previousStart.toISOString(),
      compareEnd: start.toISOString(),
      label: "Mês anterior",
    };
  }

  if (!customFrom || !customTo) {
    return rangeForPeriod("month");
  }

  const [fy, fm, fd] = customFrom.split("-").map(Number);
  const [ty, tm, td] = customTo.split("-").map(Number);
  const start = localMidnightUtc(fy, fm, fd);
  const end = addDays(localMidnightUtc(ty, tm, td), 1);

  if (end <= start) {
    throw new Error("A data final deve ser igual ou posterior à data inicial.");
  }

  const duration = end.getTime() - start.getTime();
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    compareStart: new Date(start.getTime() - duration).toISOString(),
    compareEnd: start.toISOString(),
    label: `${customFrom} a ${customTo}`,
  };
}

export function getReportRange(filters: ReportFilters): ReportRange {
  return rangeForPeriod(filters.period, filters.from, filters.to);
}

export function getTodayInput(): string {
  const p = localDateParts(new Date());
  return [p.y, String(p.m).padStart(2, "0"), String(p.d).padStart(2, "0")].join("-");
}

export function filtersToQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  params.set("period", filters.period);
  params.set("branch", filters.branchId ?? "all");
  params.set("view", filters.view);
  params.set("compare", filters.compare ? "1" : "0");
  if (filters.period === "custom") {
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
  }
  return params.toString();
}