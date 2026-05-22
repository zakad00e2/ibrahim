import type { Customer, CustomerInput, Invoice, InvoiceItem, Product, SaleRequest } from "../types";
import type { OfflineOperation } from "./offlineDb";
import {
  calculateCustomerDebt,
  calculateInvoiceItemTotal,
  calculateItemsTotal,
  getCustomerDebtTotal,
} from "../utils/calculations";
import { addMoney, compareMoney, maxMoney, minMoney, subtractMoney } from "../utils/money";

const networkErrorMessages = [
  "failed to fetch",
  "networkerror",
  "load failed",
  "network request failed",
];

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
};

export const isNetworkFailure = (error: unknown, isOnline = getBrowserOnlineState()): boolean => {
  if (!isOnline) return true;
  if (error instanceof TypeError) return true;

  const message = getErrorMessage(error).toLowerCase();
  return networkErrorMessages.some((knownMessage) => message.includes(knownMessage));
};

export const getBrowserOnlineState = (): boolean => {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
};

export const shouldReadFromOfflineCache = (
  isOnline: boolean,
  hasPendingOfflineOperations: boolean,
): boolean => !isOnline || hasPendingOfflineOperations;

export type OfflineQueueDrainResult = {
  processedAny: boolean;
  drained: boolean;
  wentOffline: boolean;
  failedOperation?: OfflineOperation;
  error?: unknown;
};

export type OfflineQueueDrainOptions = {
  listOperations: () => Promise<OfflineOperation[]>;
  processOperation: (
    operation: OfflineOperation,
    customerIdReplacements: Map<string, string>,
  ) => Promise<void>;
  deleteOperation: (id: number) => Promise<void>;
  isNetworkError?: (error: unknown) => boolean;
};

export const drainOfflineQueue = async ({
  listOperations,
  processOperation,
  deleteOperation,
  isNetworkError = isNetworkFailure,
}: OfflineQueueDrainOptions): Promise<OfflineQueueDrainResult> => {
  const operations = await listOperations();
  const customerIdReplacements = new Map<string, string>();
  let processedAny = false;

  for (const operation of operations) {
    if (!operation.id) continue;

    try {
      await processOperation(operation, customerIdReplacements);
      await deleteOperation(operation.id);
      processedAny = true;
    } catch (error) {
      return {
        processedAny,
        drained: false,
        wentOffline: isNetworkError(error),
        failedOperation: operation,
        error,
      };
    }
  }

  return {
    processedAny,
    drained: true,
    wentOffline: false,
  };
};

export const resolveOfflineCustomerReference = <T extends { customerId?: string }>(
  payload: T,
  customerIdReplacements: ReadonlyMap<string, string>,
): T => {
  if (!payload.customerId) return payload;

  const resolvedCustomerId = customerIdReplacements.get(payload.customerId);
  if (!resolvedCustomerId) return payload;

  return {
    ...payload,
    customerId: resolvedCustomerId,
  };
};

export const buildOfflineInvoice = (
  request: SaleRequest,
  products: Product[],
  customer: Customer | undefined,
  now = new Date(),
): Invoice => {
  const items = buildInvoiceItems(request.items, products);
  const total = calculateItemsTotal(items);
  const paid =
    request.paymentMethod === "cash"
      ? total
      : request.paymentMethod === "debt"
        ? 0
        : Number(request.paidAmount ?? 0);
  const timestamp = now.getTime();

  return {
    id: `offline-invoice-${timestamp}`,
    number: `OFFLINE-${timestamp}`,
    date: now.toISOString(),
    customerId: request.customerId,
    customerName: customer?.name ?? "بيع مباشر",
    items,
    total,
    paid,
    remaining: maxMoney(subtractMoney(total, paid), 0),
    paymentMethod: request.paymentMethod,
  };
};

export const buildOfflineCustomer = (
  input: CustomerInput,
  now = new Date(),
): Customer => {
  const timestamp = now.getTime();
  const id = `offline-customer-${timestamp}`;
  const initialDebt =
    typeof input.initialDebt === "number" && Number.isFinite(input.initialDebt) && input.initialDebt > 0
      ? input.initialDebt
      : 0;
  const debts = initialDebt > 0
    ? [
        {
          id: `offline-debt-${id}`,
          invoiceId: "",
          description: "دين افتتاحي",
          date: now.toISOString(),
          amount: initialDebt,
          paid: 0,
          remaining: initialDebt,
          isPaid: false,
        },
      ]
    : [];

  return {
    id,
    name: input.name.trim(),
    phone: input.phone.trim(),
    debtBalance: initialDebt,
    debts,
  };
};

export const buildInvoiceItems = (items: InvoiceItem[], products: Product[]): InvoiceItem[] => {
  return items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    const price = Number.isFinite(item.price) && item.price > 0 ? item.price : (product?.price ?? 0);
    const wholesalePrice =
      Number.isFinite(item.wholesalePrice) && item.wholesalePrice > 0
        ? item.wholesalePrice
        : (product?.wholesalePrice ?? 0);

    return {
      productId: item.productId,
      productName: item.productName || product?.name || "",
      barcode: item.barcode || product?.barcode || "",
      price,
      wholesalePrice,
      quantity: item.quantity,
      total: calculateInvoiceItemTotal(price, item.quantity),
    };
  });
};

export const applyOfflineSaleToProducts = (
  products: Product[],
  soldItems: InvoiceItem[],
): Product[] => {
  return products.map((product) => {
    const soldItem = soldItems.find((item) => item.productId === product.id);
    return soldItem ? { ...product, stock: Math.max(product.stock - soldItem.quantity, 0) } : product;
  });
};

export const applyCustomerDebtPayment = (
  customers: Customer[],
  customerId: string,
  amount: number,
): Customer[] => {
  return customers.map((customer) => {
    if (customer.id !== customerId) return customer;

    if (customer.debts.length === 0) {
      return {
        ...customer,
        debtBalance: maxMoney(subtractMoney(getCustomerDebtTotal(customer), amount), 0),
      };
    }

    let remainingPayment = amount;
    const debts = customer.debts.map((debt) => {
      if (compareMoney(remainingPayment, 0) <= 0 || compareMoney(debt.remaining, 0) <= 0) return debt;

      const paidNow = minMoney(debt.remaining, remainingPayment);
      remainingPayment = subtractMoney(remainingPayment, paidNow);
      const remaining = maxMoney(subtractMoney(debt.remaining, paidNow), 0);

      return {
        ...debt,
        paid: addMoney(debt.paid, paidNow),
        remaining,
        isPaid: compareMoney(remaining, 0) === 0 ? true : debt.isPaid,
      };
    });

    return {
      ...customer,
      debts,
      debtBalance: calculateCustomerDebt(debts),
    };
  });
};

export const applyDebtPayment = (
  customers: Customer[],
  debtId: string,
  amount: number,
): Customer[] => {
  return customers.map((customer) => {
    if (!customer.debts.some((debt) => debt.id === debtId)) return customer;

    const debts = customer.debts.map((debt) => {
      if (debt.id !== debtId) return debt;

      const paidNow = minMoney(debt.remaining, amount);
      const remaining = maxMoney(subtractMoney(debt.remaining, paidNow), 0);

      return {
        ...debt,
        paid: addMoney(debt.paid, paidNow),
        remaining,
        isPaid: compareMoney(remaining, 0) === 0 ? true : debt.isPaid,
      };
    });

    return {
      ...customer,
      debts,
      debtBalance: calculateCustomerDebt(debts),
    };
  });
};
