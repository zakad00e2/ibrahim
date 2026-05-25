import { deleteJson, getJson, patchJson, postJson } from "./apiClient";
import type { Customer, CustomerInput, Debt, DebtPayment } from "../types";
import { subtractMoney, sumMoney, toMoneyNumber } from "../utils/money";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const parseApiNumber = (value: unknown): number => {
  return toMoneyNumber(typeof value === "string" || typeof value === "number" ? value : undefined);
};

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

const calculateDebtBalance = (debts: Debt[]) =>
  sumMoney(debts.map((debt) => debt.remaining));

const extractCustomerDebtBalance = (dto: Record<string, unknown>, debts: Debt[]): number | undefined => {
  const summary = isRecord(dto.summary)
    ? dto.summary
    : isRecord(dto.debtSummary)
      ? dto.debtSummary
      : undefined;
  const aggregate = isRecord(dto._sum) ? dto._sum : undefined;

  return (
    firstApiNumber(
      summary?.totalRemaining,
      summary?.remaining,
      summary?.debtBalance,
      summary?.currentDebt,
      summary?.outstandingDebt,
      aggregate?.remaining,
      dto.totalRemaining,
      dto.remaining,
      dto.debtBalance,
      dto.currentDebt,
      dto.outstandingDebt,
      dto.totalDebt,
      dto.totalAmount,
      dto.debt,
      dto.balance,
    ) ?? (debts.length > 0 ? calculateDebtBalance(debts) : undefined)
  );
};

export const mapDebtPayment = (dto: unknown): DebtPayment => {
  if (!isRecord(dto)) throw new Error("invalid debt payment dto");
  return {
    id: String(dto.id ?? ""),
    amount: parseApiNumber(dto.amount),
    date: String(dto.date ?? ""),
    notes: typeof dto.notes === "string" ? dto.notes : undefined,
  };
};

export const mapDebt = (dto: unknown): Debt => {
  if (!isRecord(dto)) throw new Error("invalid debt dto");
  const invoice = isRecord(dto.invoice) ? dto.invoice : undefined;
  const payments = Array.isArray(dto.payments)
    ? dto.payments.map(mapDebtPayment)
    : undefined;
  const amount = parseApiNumber(dto.amount ?? dto.totalAmount ?? dto.total_amount);
  const rawRemaining =
    dto.remaining ?? dto.remainingAmount ?? dto.remaining_amount ?? dto.balance ?? dto.balanceAmount ?? dto.balance_amount;
  const paid = parseApiNumber(dto.paid ?? dto.paidAmount ?? dto.paid_amount ?? dto.amountPaid ?? dto.amount_paid);
  const remaining =
    rawRemaining === undefined || rawRemaining === null || rawRemaining === ""
      ? Math.max(amount - paid, 0)
      : parseApiNumber(rawRemaining);
  return {
    id: String(dto.id ?? ""),
    invoiceId: String(dto.invoiceId ?? dto.invoice_id ?? ""),
    invoiceNumber:
      dto.invoiceNumber !== undefined || dto.invoice_number !== undefined || invoice?.number !== undefined
        ? String(dto.invoiceNumber ?? dto.invoice_number ?? invoice?.number)
        : undefined,
    description: String(dto.description ?? ""),
    date: String(dto.date ?? dto.createdAt ?? dto.created_at ?? ""),
    amount,
    paid: paid || Math.max(subtractMoney(amount, remaining), 0),
    remaining,
    isPaid: dto.isPaid === true,
    notes: typeof dto.notes === "string" ? dto.notes : undefined,
    payments,
  };
};

export const mapCustomer = (dto: unknown): Customer => {
  if (!isRecord(dto)) throw new Error("invalid customer dto");
  const debts = Array.isArray(dto.debts) ? dto.debts.map(mapDebt) : [];
  const debtBalance = extractCustomerDebtBalance(dto, debts);
  return {
    id: String(dto.id ?? ""),
    name: String(dto.name ?? ""),
    phone: String(dto.phone ?? ""),
    debts,
    debtBalance,
  };
};

const extractList = (
  payload: unknown,
): { items: unknown[]; total: number; page: number; limit: number } => {
  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length, page: 1, limit: payload.length };
  }
  if (isRecord(payload)) {
    const data = payload.data ?? payload.items ?? payload.customers;
    if (Array.isArray(data)) {
      const meta = isRecord(payload.meta) ? payload.meta : payload;
      return {
        items: data,
        total: parseApiNumber(
          (meta as Record<string, unknown>).total ??
            (meta as Record<string, unknown>).totalCount ??
            data.length,
        ),
        page: parseApiNumber(
          (meta as Record<string, unknown>).page ??
            (meta as Record<string, unknown>).currentPage ??
            1,
        ),
        limit: parseApiNumber(
          (meta as Record<string, unknown>).limit ??
            (meta as Record<string, unknown>).pageSize ??
            data.length,
        ),
      };
    }
  }
  return { items: [], total: 0, page: 1, limit: 20 };
};

export type CustomersListResult = {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
};

export type ListCustomersParams = {
  search?: string;
  page?: number;
  limit?: number;
};

export type CreateCustomerOptions = {
  clientCustomerId?: string;
};

const buildQuery = (params: ListCustomersParams): string => {
  const entries: string[] = [];
  if (params.search !== undefined && params.search !== "") {
    entries.push(`search=${encodeURIComponent(params.search)}`);
  }
  if (params.page !== undefined) {
    entries.push(`page=${params.page}`);
  }
  if (params.limit !== undefined) {
    entries.push(`limit=${params.limit}`);
  }
  return entries.length ? `?${entries.join("&")}` : "";
};

const customerFromResponse = (payload: unknown): Customer =>
  mapCustomer(
    isRecord(payload) && (isRecord(payload.customer) || isRecord(payload.data))
      ? (payload.customer ?? payload.data)
      : payload,
  );

export const listCustomers = async (
  params: ListCustomersParams = {},
): Promise<CustomersListResult> => {
  const payload = await getJson(`/api/customers${buildQuery(params)}`);
  const { items, total, page, limit } = extractList(payload);
  return { items: items.map(mapCustomer), total, page, limit };
};

export const getCustomerById = async (id: string): Promise<Customer> => {
  const payload = await getJson(`/api/customers/${encodeURIComponent(id)}`);
  return customerFromResponse(payload);
};

export const createCustomer = async (
  input: CustomerInput,
  options: CreateCustomerOptions = {},
): Promise<Customer> => {
  const body: Record<string, unknown> = {
    name: input.name.trim(),
    phone: input.phone.trim() || undefined,
    clientCustomerId: options.clientCustomerId,
  };
  if (typeof input.initialDebt === "number" && input.initialDebt > 0) {
    body.initialDebt = input.initialDebt;
  }
  const payload = await postJson("/api/customers", body);
  return customerFromResponse(payload);
};

export const updateCustomer = async (
  id: string,
  input: Pick<CustomerInput, "name" | "phone">,
): Promise<Customer> => {
  const payload = await patchJson(`/api/customers/${encodeURIComponent(id)}`, {
    name: input.name.trim(),
    phone: input.phone.trim() || undefined,
  });
  return customerFromResponse(payload);
};

export const deleteCustomer = async (id: string): Promise<void> => {
  await deleteJson(`/api/customers/${encodeURIComponent(id)}`);
};

