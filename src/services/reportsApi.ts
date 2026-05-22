import { getJson } from "./apiClient";
import { toMoneyNumber } from "../utils/money";

export type DailyProfit = {
  date: string;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
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
