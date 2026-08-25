import { getJson, postJson } from "./apiClient";
import type { ApiClientError } from "./apiClient";
import { mapCustomerPayment, mapDebt, mapDebtPayment } from "./customersApi";
import type { Debt, DebtSummary } from "../types";
import { compareMoney, minMoney, subtractMoney, sumMoney, toMoneyNumber } from "../utils/money";

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

export const OVERPAYMENT_UNSUPPORTED_MESSAGE =
  "الخادم لا يدعم حالياً حفظ الرصيد الزائد. حدّث نظام الباك اند أو نفّذ التسديد دون إنترنت.";

export const mapDebtSummaryResponse = (payload: unknown): DebtSummary => {
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
  const creditBalance =
    firstApiNumber(
      (summaryData as Record<string, unknown>).creditBalance,
      (summaryData as Record<string, unknown>).credit,
      payload.creditBalance,
      payload.credit,
    ) ?? 0;
  const balance =
    firstApiNumber(
      (summaryData as Record<string, unknown>).balance,
      payload.balance,
    ) ?? subtractMoney(creditBalance, totalRemaining);

  return {
    totalDebt,
    totalRemaining,
    creditBalance,
    balance,
    debts,
    payment: isRecord(payload.payment) ? mapCustomerPayment(payload.payment) : undefined,
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

export type StoreDebtSummary = {
  totalDebts: number;
  totalAmount: number;
  totalPaid: number;
  totalRemaining: number;
  unpaidCount: number;
  unpaidRemaining: number;
};

const mapStoreDebtSummary = (payload: unknown): StoreDebtSummary => {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  if (!isRecord(data)) throw new Error("invalid store debt summary response");

  return {
    totalDebts: firstApiNumber(data.totalDebts) ?? 0,
    totalAmount: firstApiNumber(data.totalAmount) ?? 0,
    totalPaid: firstApiNumber(data.totalPaid) ?? 0,
    totalRemaining: firstApiNumber(data.totalRemaining) ?? 0,
    unpaidCount: firstApiNumber(data.unpaidCount) ?? 0,
    unpaidRemaining: firstApiNumber(data.unpaidRemaining) ?? 0,
  };
};

export const getStoreDebtSummary = async (): Promise<StoreDebtSummary> => {
  return mapStoreDebtSummary(await getJson("/api/debts/summary"));
};

export type DebtPaymentOptions = {
  clientOperationId?: string;
  fallbackDebt?: Debt;
};

const mergeDebtFallback = (debt: Debt, fallback?: Debt): Debt => {
  if (!fallback) return debt;

  return {
    ...fallback,
    ...debt,
    id: debt.id || fallback.id,
    invoiceId: debt.invoiceId || fallback.invoiceId,
    invoiceNumber: debt.invoiceNumber ?? fallback.invoiceNumber,
    description: debt.description || fallback.description,
    date: debt.date || fallback.date,
    amount: debt.amount || fallback.amount,
    notes: debt.notes ?? fallback.notes,
    payments: debt.payments ?? fallback.payments,
    isPaid: debt.isPaid || compareMoney(debt.remaining, 0) === 0 || fallback.isPaid,
  };
};

const isEndpointUnavailable = (error: unknown): boolean => {
  const statusCode = (error as ApiClientError).statusCode;
  return statusCode === 404 || statusCode === 405;
};

export const payCustomerDebtAtomic = async (
  customerId: string,
  amount: number,
  notes?: string,
  options: DebtPaymentOptions = {},
): Promise<DebtSummary> => {
  const body: Record<string, unknown> = { amount };
  if (notes?.trim()) body.notes = notes.trim();
  if (options.clientOperationId) body.clientOperationId = options.clientOperationId;

  const payload = await postJson(
    `/api/debts/customer/${encodeURIComponent(customerId)}/pay`,
    body,
  );
  return mapDebtSummaryResponse(payload);
};

const payCustomerDebtSequential = async (
  customerId: string,
  amount: number,
  notes: string | undefined,
  options: DebtPaymentOptions,
  summary: DebtSummary,
): Promise<DebtSummary> => {
  if (!summary.debts.some((debt) => compareMoney(debt.remaining, 0) === 1)) {
    throw new Error("تعذر تحميل تفاصيل ديون العميل.");
  }

  let remainingPayment = amount;
  const updatedDebtsById = new Map<string, Debt>();

  for (const debt of summary.debts) {
    if (compareMoney(remainingPayment, 0) <= 0) break;
    if (compareMoney(debt.remaining, 0) <= 0) continue;

    const paidNow = minMoney(debt.remaining, remainingPayment);
    const updatedDebt = await payDebt(debt.id, paidNow, notes, { ...options, fallbackDebt: debt });
    updatedDebtsById.set(debt.id, updatedDebt);
    remainingPayment = subtractMoney(remainingPayment, paidNow);
  }

  const debts = summary.debts.map((debt) => updatedDebtsById.get(debt.id) ?? debt);

  return {
    totalDebt: sumMoney(debts.map((debt) => debt.amount)),
    totalRemaining: sumMoney(debts.map((debt) => debt.remaining)),
    creditBalance: summary.creditBalance ?? 0,
    balance: subtractMoney(summary.creditBalance ?? 0, sumMoney(debts.map((debt) => debt.remaining))),
    debts,
  };
};

export const payCustomerDebtAuto = async (
  customerId: string,
  amount: number,
  notes?: string,
  options: DebtPaymentOptions = {},
): Promise<DebtSummary> => {
  if (!Number.isFinite(amount) || compareMoney(amount, 0) <= 0) {
    throw new Error("أدخل مبلغ تسديد صحيح");
  }

  const summary = await getCustomerDebts(customerId);
  const isOverpayment = compareMoney(amount, summary.totalRemaining) === 1;

  try {
    return await payCustomerDebtAtomic(customerId, amount, notes, options);
  } catch (error) {
    if (!isEndpointUnavailable(error)) {
      throw error;
    }

    if (isOverpayment) {
      throw new Error(OVERPAYMENT_UNSUPPORTED_MESSAGE);
    }

    return payCustomerDebtSequential(customerId, amount, notes, options, summary);
  }
};

export const getDebtById = async (id: string): Promise<Debt> => {
  const payload = await getJson(`/api/debts/${encodeURIComponent(id)}`);
  return mapDebtWithPayments(payload);
};

export const payDebt = async (
  debtId: string,
  amount: number,
  notes?: string,
  options: DebtPaymentOptions = {},
): Promise<Debt> => {
  const body: Record<string, unknown> = { amount };
  if (notes?.trim()) body.notes = notes.trim();
  const payload = await postJson(`/api/debts/${encodeURIComponent(debtId)}/pay`, body);
  return mergeDebtFallback(mapDebtWithPayments(payload), options.fallbackDebt);
};
