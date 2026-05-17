import { getJson } from "./apiClient";

export type DailyProfit = {
  date: string;
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const parseNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

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
    totalRevenue: parseNum(dto.totalRevenue ?? dto.revenue ?? dto.sales),
    totalCost: parseNum(dto.totalCost ?? dto.cost),
    netProfit: parseNum(dto.netProfit ?? dto.profit),
  };
};
