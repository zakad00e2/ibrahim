import Dexie, { type Table } from "dexie";
import type {
  Customer,
  CustomerInput,
  Debt,
  Invoice,
  Product,
  SaleRequest,
} from "../types";

export type CachedDebt = Debt & {
  customerId?: string;
};

export type OfflineOperation =
  | {
      id?: number;
      type: "createInvoice";
      payload: SaleRequest;
      localId?: string;
      createdAt: string;
    }
  | {
      id?: number;
      type: "createCustomer";
      payload: CustomerInput;
      localId?: string;
      createdAt: string;
    }
  | {
      id?: number;
      type: "payCustomerDebt";
      payload: { customerId: string; amount: number; notes?: string };
      createdAt: string;
    }
  | {
      id?: number;
      type: "payDebt";
      payload: { debtId: string; amount: number; notes?: string };
      createdAt: string;
    };

export type QueueOfflineOperationInput =
  OfflineOperation extends infer Operation
    ? Operation extends OfflineOperation
      ? Omit<Operation, "id" | "createdAt"> & { createdAt?: string }
      : never
    : never;

export type OfflineListQuery = {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
};

export type OfflineListResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

class CashierOfflineDb extends Dexie {
  products!: Table<Product, string>;
  customers!: Table<Customer, string>;
  invoices!: Table<Invoice, string>;
  debts!: Table<CachedDebt, string>;
  offlineQueue!: Table<OfflineOperation, number>;

  constructor() {
    super("cashier-offline-db");

    this.version(1).stores({
      products: "id, barcode, name, isActive, stock",
      customers: "id, name, phone",
      invoices: "id, number, date, customerId",
      debts: "id, invoiceId, customerId, date, remaining, isPaid",
      offlineQueue: "++id, type, createdAt",
    });
  }
}

export const offlineDb = new CashierOfflineDb();

const normalizeSearch = (search?: string) => search?.trim().toLowerCase() ?? "";

const paginate = <T>(items: T[], page = 1, limit = 20): OfflineListResult<T> => {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.max(1, Math.floor(limit));
  const start = (safePage - 1) * safeLimit;

  return {
    items: items.slice(start, start + safeLimit),
    total: items.length,
    page: safePage,
    limit: safeLimit,
  };
};

const includesSearch = (values: Array<string | undefined>, search: string): boolean => {
  if (!search) return true;
  return values.some((value) => value?.toLowerCase().includes(search));
};

export const replaceCachedProducts = async (items: Product[]): Promise<void> => {
  await offlineDb.transaction("rw", offlineDb.products, async () => {
    await offlineDb.products.clear();
    if (items.length > 0) await offlineDb.products.bulkPut(items);
  });
};

export const upsertCachedProducts = async (items: Product[]): Promise<void> => {
  if (items.length === 0) return;
  await offlineDb.products.bulkPut(items);
};

export const listCachedProducts = async (
  query: OfflineListQuery = {},
): Promise<OfflineListResult<Product>> => {
  const search = normalizeSearch(query.search);
  const items = (await offlineDb.products.toArray()).filter((product) => {
    const activeMatches = query.isActive === undefined || product.isActive === query.isActive;
    return activeMatches && includesSearch([product.name, product.barcode], search);
  });

  return paginate(items, query.page, query.limit);
};

export const getCachedProductByBarcode = async (barcode: string): Promise<Product | null> => {
  const product = await offlineDb.products.where("barcode").equals(barcode).first();
  return product ?? null;
};

export const replaceCachedCustomers = async (items: Customer[]): Promise<void> => {
  await offlineDb.transaction("rw", offlineDb.customers, offlineDb.debts, async () => {
    await offlineDb.customers.clear();
    await offlineDb.debts.clear();
    if (items.length > 0) {
      await offlineDb.customers.bulkPut(items);
      await offlineDb.debts.bulkPut(
        items.flatMap((customer) =>
          customer.debts.map((debt) => ({
            ...debt,
            customerId: customer.id,
          })),
        ),
      );
    }
  });
};

export const upsertCachedCustomers = async (items: Customer[]): Promise<void> => {
  if (items.length === 0) return;
  await offlineDb.transaction("rw", offlineDb.customers, offlineDb.debts, async () => {
    await offlineDb.customers.bulkPut(items);
    const debts = items.flatMap((customer) =>
      customer.debts.map((debt) => ({
        ...debt,
        customerId: customer.id,
      })),
    );
    if (debts.length > 0) await offlineDb.debts.bulkPut(debts);
  });
};

export const listCachedCustomers = async (
  query: OfflineListQuery = {},
): Promise<OfflineListResult<Customer>> => {
  const search = normalizeSearch(query.search);
  const items = (await offlineDb.customers.toArray()).filter((customer) =>
    includesSearch([customer.name, customer.phone], search),
  );

  return paginate(items, query.page, query.limit);
};

export const getCachedCustomer = async (id: string): Promise<Customer | null> => {
  const customer = await offlineDb.customers.get(id);
  return customer ?? null;
};

export const deleteCachedCustomer = async (id: string): Promise<void> => {
  await offlineDb.transaction("rw", offlineDb.customers, offlineDb.debts, async () => {
    const customer = await offlineDb.customers.get(id);
    const debtsByCustomerId = await offlineDb.debts.where("customerId").equals(id).toArray();
    const debtIds = new Set([
      ...(customer?.debts.map((debt) => debt.id) ?? []),
      ...debtsByCustomerId.map((debt) => debt.id),
    ]);

    if (debtIds.size > 0) {
      await offlineDb.debts.bulkDelete(Array.from(debtIds));
    }

    await offlineDb.customers.delete(id);
  });
};

export const replaceCachedInvoices = async (items: Invoice[]): Promise<void> => {
  await offlineDb.transaction("rw", offlineDb.invoices, async () => {
    await offlineDb.invoices.clear();
    if (items.length > 0) await offlineDb.invoices.bulkPut(items);
  });
};

export const upsertCachedInvoices = async (items: Invoice[]): Promise<void> => {
  if (items.length === 0) return;
  await offlineDb.invoices.bulkPut(items);
};

export const listCachedInvoices = async (
  query: OfflineListQuery = {},
): Promise<OfflineListResult<Invoice>> => {
  const search = normalizeSearch(query.search);
  const items = (await offlineDb.invoices.toArray())
    .filter((invoice) =>
      includesSearch([invoice.number, invoice.customerName, invoice.notes], search),
    )
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  return paginate(items, query.page, query.limit);
};

export const getCachedInvoice = async (id: string): Promise<Invoice | null> => {
  const invoice = await offlineDb.invoices.get(id);
  return invoice ?? null;
};

export const deleteCachedInvoice = async (id: string): Promise<void> => {
  await offlineDb.invoices.delete(id);
};

export const replaceCachedDebts = async (items: CachedDebt[]): Promise<void> => {
  await offlineDb.transaction("rw", offlineDb.debts, async () => {
    await offlineDb.debts.clear();
    if (items.length > 0) await offlineDb.debts.bulkPut(items);
  });
};

export const upsertCachedDebts = async (items: CachedDebt[]): Promise<void> => {
  if (items.length === 0) return;
  await offlineDb.debts.bulkPut(items);
};

export const cacheCustomerDebts = async (
  customerId: string,
  debts: Debt[],
  debtBalance: number,
): Promise<void> => {
  await offlineDb.transaction("rw", offlineDb.customers, offlineDb.debts, async () => {
    const customer = await offlineDb.customers.get(customerId);
    if (customer) {
      await offlineDb.customers.put({ ...customer, debts, debtBalance });
    }

    const previousDebts = await offlineDb.debts.where("customerId").equals(customerId).toArray();
    await offlineDb.debts.bulkDelete(previousDebts.map((debt) => debt.id));
    if (debts.length > 0) {
      await offlineDb.debts.bulkPut(debts.map((debt) => ({ ...debt, customerId })));
    }
  });
};

export const listCachedCustomerDebts = async (customerId: string): Promise<Debt[]> => {
  const customer = await offlineDb.customers.get(customerId);
  if (customer?.debts.length) return customer.debts;

  const debts = await offlineDb.debts.where("customerId").equals(customerId).toArray();
  return debts.map(({ customerId: _customerId, ...debt }) => debt);
};

export const getCachedDebt = async (id: string): Promise<Debt | null> => {
  const debt = await offlineDb.debts.get(id);
  if (!debt) return null;

  const { customerId: _customerId, ...rest } = debt;
  return rest;
};

export const queueOfflineOperation = async (
  operation: QueueOfflineOperationInput,
): Promise<number> => {
  return offlineDb.offlineQueue.add({
    ...operation,
    createdAt: operation.createdAt ?? new Date().toISOString(),
  } as OfflineOperation);
};

export const listOfflineOperations = async (): Promise<OfflineOperation[]> => {
  return offlineDb.offlineQueue.orderBy("createdAt").toArray();
};

export const deleteOfflineOperation = async (id: number): Promise<void> => {
  await offlineDb.offlineQueue.delete(id);
};

export const replaceOfflineCustomerIdInQueuedOperations = async (
  offlineCustomerId: string,
  serverCustomerId: string,
): Promise<void> => {
  const operations = await offlineDb.offlineQueue.toArray();
  const updates: OfflineOperation[] = [];

  operations.forEach((operation) => {
    if (operation.type === "createInvoice" && operation.payload.customerId === offlineCustomerId) {
      updates.push({
        ...operation,
        payload: {
          ...operation.payload,
          customerId: serverCustomerId,
        },
      });
    }

    if (operation.type === "payCustomerDebt" && operation.payload.customerId === offlineCustomerId) {
      updates.push({
        ...operation,
        payload: {
          ...operation.payload,
          customerId: serverCustomerId,
        },
      });
    }
  });

  if (updates.length > 0) await offlineDb.offlineQueue.bulkPut(updates);
};
