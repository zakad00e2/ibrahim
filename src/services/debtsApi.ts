import { getJson, postJson } from "./apiClient";
import { mapDebt, mapDebtPayment } from "./customersApi";
import type { Debt, DebtSummary } from "../types";
import { sumMoney, toMoneyNumber } from "../utils/money";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const firstApiNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const n = toMoneyNumber(
      typeof value === "string" || typeof value === "number" ? value : undefined,
      Number.NaN,
    );
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const mapDebtSummaryResponse = (payload: unknown): DebtSummary => {
  if (!isRecord(payload)) throw new Error("invalid debt summary response");

  const summaryData = isRecord(payload.summary) ? payload.summary : payload;
  const rawDebts = Array.isArray(payload.debts) ? payload.debts : [];
  const debts = rawDebts.map(mapDebt);
  const debtsTotal = sumMoney(debts.map((debt) => debt.amount));
  const debtsRemaining = sumMoney(debts.map((debt) => debt.remaining));
  const totalDebt =
    firstApiNumber(
      (summaryData as Record<string, unknown>).totalAmount,
      (summaryData as Record<string, unknown>).totalDebt,
      payload.totalDebt,
      payload.totalAmount,
    ) ?? debtsTotal;
  const totalRemaining =
    firstApiNumber(
      (summaryData as Record<string, unknown>).totalRemaining,
      (summaryData as Record<string, unknown>).remaining,
      payload.totalRemaining,
      payload.remaining,
    ) ?? (debts.length > 0 ? debtsRemaining : totalDebt);

  return {
    totalDebt,
    totalRemaining,
    debts,
  };
};

const mapDebtWithPayments = (payload: unknown): Debt => {
  if (!isRecord(payload)) throw new Error("invalid debt response");
  const debtData = isRecord(payload.debt) ? payload.debt : isRecord(payload.data) ? payload.data : payload;
  if (!isRecord(debtData)) throw new Error("invalid debt data");

  const payments = Array.isArray(debtData.payments)
    ? debtData.payments.map(mapDebtPayment)
    : Array.isArray((payload as Record<string, unknown>).payments)
      ? ((payload as Record<string, unknown>).payments as unknown[]).map(mapDebtPayment)
      : undefined;

  return {
    ...mapDebt(debtData),
    payments,
  };
};

export const getCustomerDebts = async (customerId: string): Promise<DebtSummary> => {
  const payload = await getJson(`/api/debts/customer/${encodeURIComponent(customerId)}`);
  return mapDebtSummaryResponse(payload);
};

export type DebtPaymentOptions = {
  clientOperationId?: string;
};

export const payCustomerDebtAuto = async (
  customerId: string,
  amount: number,
  notes?: string,
  _options: DebtPaymentOptions = {},
): Promise<DebtSummary> => {
  const body: Record<string, unknown> = { amount };
  if (notes?.trim()) body.notes = notes.trim();
  await postJson(`/api/debts/customer/${encodeURIComponent(customerId)}/pay`, body);
  return getCustomerDebts(customerId);
};

export const getDebtById = async (id: string): Promise<Debt> => {
  const payload = await getJson(`/api/debts/${encodeURIComponent(id)}`);
  return mapDebtWithPayments(payload);
};

export const payDebt = async (
  debtId: string,
  amount: number,
  notes?: string,
  _options: DebtPaymentOptions = {},
): Promise<Debt> => {
  const body: Record<string, unknown> = { amount };
  if (notes?.trim()) body.notes = notes.trim();
  const payload = await postJson(`/api/debts/${encodeURIComponent(debtId)}/pay`, body);
  return mapDebtWithPayments(payload);
};
