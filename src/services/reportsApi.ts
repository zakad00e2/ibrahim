import { getJson } from "./apiClient";
import { toMoneyNumber } from "../utils/money";

export type DailyProfit = {
  date: string;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
};

export type DailySalesSummary = {
  date: string;
  invoiceCount: number;
  totalSales: number;
  totalPaid: number;
  totalCash: number;
  totalOnline: number;
  totalDebt: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const parseMoney = (v: unknown): number =>
  toMoneyNumber(typeof v === "string" || typeof v === "number" ? v : undefined);

export const getDailyProfit = async (date: string): Promise<DailyProfit> => {
  const payload = await getJson(
    `/api/reports/daily-profit?date=${encodeURIComponent(date)}`,
  );
  const dto = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  if (!isRecord(dto)) {
    return { date, totalRevenue: 0, totalCost: 0, netProfit: 0 };
  }
  return {
    date: String(dto.date ?? date),
    totalRevenue: parseMoney(dto.totalRevenue ?? dto.revenue ?? dto.sales),
    totalCost: parseMoney(dto.totalCost ?? dto.cost),
    netProfit: parseMoney(dto.netProfit ?? dto.profit),
  };
};

export const getDailySales = async (date: string): Promise<DailySalesSummary> => {
  const payload = await getJson(
    `/api/invoices/daily-sales?date=${encodeURIComponent(date)}`,
  );
  const dto = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  const summary = isRecord(dto) && isRecord(dto.summary) ? dto.summary : undefined;
  if (!isRecord(dto) || !summary) {
    throw new Error("invalid daily sales response");
  }

  return {
    date: String(dto.date ?? date),
    invoiceCount: Math.max(0, Math.trunc(parseMoney(summary.invoiceCount))),
    totalSales: parseMoney(summary.totalSales),
    totalPaid: parseMoney(summary.totalPaid),
    totalCash: parseMoney(summary.totalCash),
    totalOnline: parseMoney(summary.totalOnline),
    totalDebt: parseMoney(summary.totalDebt),
  };
};
