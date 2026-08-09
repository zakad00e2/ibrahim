import { deleteJson, getJson, patchJson, postJson } from "./apiClient";
import type { Invoice, InvoiceItem, InvoiceUpdateRequest, PaymentMethod, SaleRequest } from "../types";
import { toMoneyNumber } from "../utils/money";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const parseNum = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parseMoney = (value: unknown, fallback = 0): number =>
  toMoneyNumber(typeof value === "string" || typeof value === "number" ? value : undefined, fallback);

const firstMoney = (...values: unknown[]): number => {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    return parseMoney(value);
  }

  return 0;
};

const paymentMethodMap: Record<PaymentMethod, "CASH" | "DEBT" | "PARTIAL"> = {
  cash: "CASH",
  debt: "DEBT",
  partial: "PARTIAL",
};

const paymentMethodFromApi = (raw: unknown): PaymentMethod => {
  switch (String(raw).toUpperCase()) {
    case "DEBT":
      return "debt";
    case "PARTIAL":
      return "partial";
    default:
      return "cash";
  }
};

const mapInvoiceItem = (dto: unknown): InvoiceItem => {
  if (!isRecord(dto)) throw new Error("invalid invoice item dto");
  const product = isRecord(dto.product) ? dto.product : undefined;
  const price = parseMoney(
    dto.price ??
      dto.unitPrice ??
      dto.unit_price ??
      dto.salePrice ??
      dto.sale_price ??
      dto.priceAtSale ??
      dto.price_at_sale ??
      dto.productPrice ??
      product?.price,
  );
  const quantity = parseNum(dto.quantity ?? dto.qty, 1);
  const total = parseMoney(dto.total ?? dto.lineTotal ?? dto.line_total ?? dto.subtotal ?? dto.amount, price * quantity);
  const wholesalePrice = firstMoney(
    dto.unitCost ?? dto.unit_cost,
    dto.wholesalePrice,
    dto.wholesale_price,
    dto.costPrice ?? dto.cost_price,
    product?.wholesalePrice ?? product?.wholesale_price ?? product?.costPrice ?? product?.cost_price,
  );

  return {
    productId: String(dto.productId ?? dto.product_id ?? product?.id ?? ""),
    productName: String(dto.productName ?? dto.product_name ?? dto.name ?? dto.itemName ?? dto.item_name ?? product?.name ?? ""),
    barcode: String(dto.barcode ?? dto.productBarcode ?? dto.product_barcode ?? product?.barcode ?? ""),
    price,
    wholesalePrice,
    quantity,
    total,
  };
};

export const mapInvoice = (dto: unknown): Invoice => {
  if (!isRecord(dto)) throw new Error("invalid invoice dto");

  const customer = isRecord(dto.customer) ? dto.customer : undefined;
  const customerName =
    typeof dto.customerName === "string" && dto.customerName
      ? dto.customerName
      : typeof dto.customer_name === "string" && dto.customer_name
        ? dto.customer_name
      : typeof customer?.name === "string"
        ? customer.name
        : undefined;

  const rawItems = Array.isArray(dto.items)
    ? dto.items
    : Array.isArray(dto.invoiceItems)
      ? dto.invoiceItems
      : Array.isArray(dto.invoice_items)
        ? dto.invoice_items
        : Array.isArray(dto.lines)
          ? dto.lines
          : Array.isArray(dto.invoiceLines)
            ? dto.invoiceLines
            : Array.isArray(dto.invoice_lines)
              ? dto.invoice_lines
              : Array.isArray(dto.saleItems)
                ? dto.saleItems
                : Array.isArray(dto.sale_items)
                  ? dto.sale_items
                  : [];
  const paymentMethod = paymentMethodFromApi(
    dto.paymentMethod ?? dto.payment_method ?? dto.method ?? dto.paymentType ?? dto.payment_type,
  );
  const total = parseMoney(
    dto.total ?? dto.totalAmount ?? dto.total_amount ?? dto.amount ?? dto.grandTotal ?? dto.grand_total,
  );
  const discount = parseMoney(
    dto.discount ?? dto.discountAmount ?? dto.discount_amount,
  );
  const rawPaid =
    dto.paid ??
    dto.paidAmount ??
    dto.paid_amount ??
    dto.amountPaid ??
    dto.amount_paid ??
    dto.paymentAmount ??
    dto.payment_amount ??
    dto.initialPaid ??
    dto.initial_paid ??
    dto.cashPaid ??
    dto.cash_paid;
  const rawRemaining =
    dto.remaining ??
    dto.remainingAmount ??
    dto.remaining_amount ??
    dto.balance ??
    dto.balanceAmount ??
    dto.balance_amount ??
    dto.debtAmount ??
    dto.debt_amount;
  const paidFromApi =
    rawPaid === undefined || rawPaid === null || rawPaid === "" ? undefined : parseMoney(rawPaid);
  const remainingFromApi =
    rawRemaining === undefined || rawRemaining === null || rawRemaining === "" ? undefined : parseMoney(rawRemaining);
  const remaining =
    remainingFromApi ?? Math.max(total - (paidFromApi ?? (paymentMethod === "cash" ? total : 0)), 0);
  const paid = paidFromApi ?? Math.max(total - remaining, 0);

  return {
    id: String(dto.id ?? ""),
    number: String(dto.number ?? dto.invoiceNumber ?? dto.invoice_number ?? ""),
    date: String(dto.date ?? dto.createdAt ?? dto.created_at ?? new Date().toISOString()),
    customerId:
      typeof dto.customerId === "string" && dto.customerId
        ? dto.customerId
        : typeof dto.customer_id === "string" && dto.customer_id
          ? dto.customer_id
        : typeof customer?.id === "string"
          ? customer.id
          : undefined,
    customerName,
    notes: typeof dto.notes === "string" ? dto.notes : undefined,
    items: rawItems.map(mapInvoiceItem),
    discount,
    total,
    paid,
    remaining,
    paymentMethod,
  };
};

const invoiceFromResponse = (payload: unknown): Invoice =>
  mapInvoice(
    isRecord(payload) && (isRecord(payload.invoice) || isRecord(payload.data))
      ? (payload.invoice ?? payload.data)
      : payload,
  );

const extractList = (
  payload: unknown,
): { items: unknown[]; total: number; page: number; limit: number } => {
  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length, page: 1, limit: payload.length };
  }
  if (isRecord(payload)) {
    const container = isRecord(payload.data) ? payload.data : payload;
    const data = Array.isArray(payload.data)
      ? payload.data
      : container.items ?? container.invoices ?? container.results;
    if (Array.isArray(data)) {
      const meta = isRecord(payload.meta) ? payload.meta : container;
      return {
        items: data,
        total: parseNum(
          (meta as Record<string, unknown>).total ??
            (meta as Record<string, unknown>).totalCount ??
            data.length,
        ),
        page: parseNum(
          (meta as Record<string, unknown>).page ??
            (meta as Record<string, unknown>).currentPage ??
            1,
        ),
        limit: parseNum(
          (meta as Record<string, unknown>).limit ??
            (meta as Record<string, unknown>).pageSize ??
            data.length,
        ),
      };
    }
  }
  return { items: [], total: 0, page: 1, limit: 20 };
};

export type InvoicesListResult = {
  items: Invoice[];
  total: number;
  page: number;
  limit: number;
};

export type ListInvoicesParams = {
  search?: string;
  page?: number;
  limit?: number;
};

export type CreateInvoiceOptions = {
  clientInvoiceId?: string;
  clientOperationId?: string;
};

const buildQuery = (params: ListInvoicesParams): string => {
  const entries: string[] = [];
  if (params.search !== undefined && params.search !== "") {
    entries.push(`search=${encodeURIComponent(params.search)}`);
  }
  if (params.page !== undefined) entries.push(`page=${params.page}`);
  if (params.limit !== undefined) entries.push(`limit=${params.limit}`);
  return entries.length ? `?${entries.join("&")}` : "";
};

export const listInvoices = async (
  params: ListInvoicesParams = {},
): Promise<InvoicesListResult> => {
  const payload = await getJson(`/api/invoices${buildQuery(params)}`);
  const { items, total, page, limit } = extractList(payload);
  return { items: items.map(mapInvoice), total, page, limit };
};

export const getInvoiceById = async (id: string): Promise<Invoice> => {
  const payload = await getJson(`/api/invoices/${encodeURIComponent(id)}`);
  return invoiceFromResponse(payload);
};

export const getInvoiceByNumber = async (number: string): Promise<Invoice> => {
  const payload = await getJson(
    `/api/invoices/by-number/${encodeURIComponent(number)}`,
  );
  return invoiceFromResponse(payload);
};

export const createInvoice = async (
  request: SaleRequest,
  options: CreateInvoiceOptions = {},
): Promise<Invoice> => {
  const body = {
    paymentMethod: paymentMethodMap[request.paymentMethod],
    customerId: request.customerId,
    paid: request.paymentMethod === "partial" ? request.paidAmount : undefined,
    discount: request.discount ?? 0,
    clientInvoiceId: options.clientInvoiceId,
    items: request.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
  };

  const payload = await postJson("/api/invoices", body);
  return invoiceFromResponse(payload);
};

export const updateInvoice = async (
  id: string,
  request: InvoiceUpdateRequest,
): Promise<Invoice> => {
  const body = {
    paymentMethod: request.paymentMethod ? paymentMethodMap[request.paymentMethod] : undefined,
    paid: request.paid,
    customerId: request.customerId,
    notes: request.notes?.trim() || undefined,
    items: request.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
  };

  const payload = await patchJson(`/api/invoices/${encodeURIComponent(id)}`, body);
  return invoiceFromResponse(payload);
};

export const deleteInvoice = async (id: string): Promise<void> => {
  await deleteJson(`/api/invoices/${encodeURIComponent(id)}`);
};
