import Dexie, { type Table } from "dexie";
import type {
  Customer,
  CustomerInput,
  Debt,
  Invoice,
  Product,
  SaleRequest,
} from "../types";

export const DEFAULT_OFFLINE_STORE_KEY = "__default_store__";

const normalizeStoreKey = (storeKey?: string): string => {
  const trimmed = storeKey?.trim();
  return trimmed ? trimmed : DEFAULT_OFFLINE_STORE_KEY;
};

type CachedProduct = Omit<Product, "id"> & {
  id: string;
  productId?: string;
  storeKey: string;
};

const buildProductCacheId = (storeKey: string, productId: string): string =>
  `${storeKey}\u001f${productId}`;

const toCachedProduct = (storeKey: string, product: Product): CachedProduct => ({
  ...product,
  id: buildProductCacheId(storeKey, product.id),
  productId: product.id,
  storeKey,
});

const fromCachedProduct = ({
  storeKey: _storeKey,
  productId,
  ...product
}: CachedProduct): Product => ({
  ...product,
  id: productId ?? product.id,
});

export type CachedDebt = Debt & {
  customerId?: string;
};

type OfflineOperationMetadata = {
  id?: number;
  storeKey?: string;
  createdAt: string;
};

export type OfflineOperation =
  | (OfflineOperationMetadata & {
      type: "createInvoice";
      payload: SaleRequest;
      localId?: string;
    })
  | (OfflineOperationMetadata & {
      type: "createCustomer";
      payload: CustomerInput;
      localId?: string;
    })
  | (OfflineOperationMetadata & {
      type: "payCustomerDebt";
      payload: { customerId: string; amount: number; notes?: string };
    })
  | (OfflineOperationMetadata & {
      type: "payDebt";
      payload: { debtId: string; amount: number; notes?: string };
    });

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
  products!: Table<CachedProduct, string>;
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

    this.version(2).stores({
      products: "id, storeKey, productId, [storeKey+productId], [storeKey+barcode], name, isActive, stock",
      customers: "id, name, phone",
      invoices: "id, number, date, customerId",
      debts: "id, invoiceId, customerId, date, remaining, isPaid",
      offlineQueue: "++id, storeKey, type, createdAt",
    }).upgrade(async (transaction) => {
      await transaction.table<CachedProduct, string>("products").toCollection().modify((product) => {
        product.storeKey = normalizeStoreKey(product.storeKey);
        product.productId = product.productId ?? product.id;
      });
      await transaction.table<OfflineOperation, number>("offlineQueue").toCollection().modify((operation) => {
        operation.storeKey = normalizeStoreKey(operation.storeKey);
      });
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

const resolveProductItemsArgs = (
  storeKeyOrItems: string | Product[],
  maybeItems?: Product[],
): { storeKey: string; items: Product[] } => {
  if (Array.isArray(storeKeyOrItems)) {
    return { storeKey: DEFAULT_OFFLINE_STORE_KEY, items: storeKeyOrItems };
  }

  return { storeKey: normalizeStoreKey(storeKeyOrItems), items: maybeItems ?? [] };
};

const resolveProductQueryArgs = (
  storeKeyOrQuery?: string | OfflineListQuery,
  maybeQuery?: OfflineListQuery,
): { storeKey: string; query: OfflineListQuery } => {
  if (typeof storeKeyOrQuery === "string") {
    return { storeKey: normalizeStoreKey(storeKeyOrQuery), query: maybeQuery ?? {} };
  }

  return { storeKey: DEFAULT_OFFLINE_STORE_KEY, query: storeKeyOrQuery ?? {} };
};

export function replaceCachedProducts(items: Product[]): Promise<void>;
export function replaceCachedProducts(storeKey: string, items: Product[]): Promise<void>;
export async function replaceCachedProducts(
  storeKeyOrItems: string | Product[],
  maybeItems?: Product[],
): Promise<void> {
  const { storeKey, items } = resolveProductItemsArgs(storeKeyOrItems, maybeItems);
  await offlineDb.transaction("rw", offlineDb.products, async () => {
    await offlineDb.products.where("storeKey").equals(storeKey).delete();
    if (items.length > 0) {
      await offlineDb.products.bulkPut(items.map((product) => toCachedProduct(storeKey, product)));
    }
  });
}

export function upsertCachedProducts(items: Product[]): Promise<void>;
export function upsertCachedProducts(storeKey: string, items: Product[]): Promise<void>;
export async function upsertCachedProducts(
  storeKeyOrItems: string | Product[],
  maybeItems?: Product[],
): Promise<void> {
  const { storeKey, items } = resolveProductItemsArgs(storeKeyOrItems, maybeItems);
  if (items.length === 0) return;
  await offlineDb.products.bulkPut(items.map((product) => toCachedProduct(storeKey, product)));
}

export function listCachedProducts(query?: OfflineListQuery): Promise<OfflineListResult<Product>>;
export function listCachedProducts(storeKey: string, query?: OfflineListQuery): Promise<OfflineListResult<Product>>;
export async function listCachedProducts(
  storeKeyOrQuery: string | OfflineListQuery = {},
  maybeQuery?: OfflineListQuery,
): Promise<OfflineListResult<Product>> {
  const { storeKey, query } = resolveProductQueryArgs(storeKeyOrQuery, maybeQuery);
  const search = normalizeSearch(query.search);
  const items = (await offlineDb.products.where("storeKey").equals(storeKey).toArray()).filter((product) => {
    const activeMatches = query.isActive === undefined || product.isActive === query.isActive;
    return activeMatches && includesSearch([product.name, product.barcode], search);
  }).map(fromCachedProduct);

  return paginate(items, query.page, query.limit);
}

export function getCachedProductByBarcode(barcode: string): Promise<Product | null>;
export function getCachedProductByBarcode(storeKey: string, barcode: string): Promise<Product | null>;
export async function getCachedProductByBarcode(
  storeKeyOrBarcode: string,
  maybeBarcode?: string,
): Promise<Product | null> {
  const storeKey = maybeBarcode === undefined ? DEFAULT_OFFLINE_STORE_KEY : normalizeStoreKey(storeKeyOrBarcode);
  const barcode = maybeBarcode ?? storeKeyOrBarcode;
  const product = await offlineDb.products.where("[storeKey+barcode]").equals([storeKey, barcode]).first();
  return product ? fromCachedProduct(product) : null;
}

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

const resolveOfflineOperationArgs = (
  storeKeyOrOperation: string | QueueOfflineOperationInput,
  maybeOperation?: QueueOfflineOperationInput,
): { storeKey: string; operation: QueueOfflineOperationInput } => {
  if (typeof storeKeyOrOperation === "string") {
    if (!maybeOperation) {
      throw new Error("offline operation is required");
    }

    return { storeKey: normalizeStoreKey(storeKeyOrOperation), operation: maybeOperation };
  }

  return { storeKey: DEFAULT_OFFLINE_STORE_KEY, operation: storeKeyOrOperation };
};

export function queueOfflineOperation(operation: QueueOfflineOperationInput): Promise<number>;
export function queueOfflineOperation(storeKey: string, operation: QueueOfflineOperationInput): Promise<number>;
export async function queueOfflineOperation(
  storeKeyOrOperation: string | QueueOfflineOperationInput,
  maybeOperation?: QueueOfflineOperationInput,
): Promise<number> {
  const { storeKey, operation } = resolveOfflineOperationArgs(storeKeyOrOperation, maybeOperation);

  return offlineDb.offlineQueue.add({
    ...operation,
    storeKey,
    createdAt: operation.createdAt ?? new Date().toISOString(),
  } as OfflineOperation);
}

export const listOfflineOperations = async (storeKey?: string): Promise<OfflineOperation[]> => {
  if (storeKey === undefined) {
    return offlineDb.offlineQueue.orderBy("createdAt").toArray();
  }

  return offlineDb.offlineQueue.where("storeKey").equals(normalizeStoreKey(storeKey)).sortBy("createdAt");
};

export const hasOfflineOperations = async (storeKey?: string): Promise<boolean> => {
  const operation = storeKey === undefined
    ? await offlineDb.offlineQueue.orderBy("createdAt").first()
    : await offlineDb.offlineQueue.where("storeKey").equals(normalizeStoreKey(storeKey)).first();
  return operation !== undefined;
};

export const deleteOfflineOperation = async (id: number): Promise<void> => {
  await offlineDb.offlineQueue.delete(id);
};

export function replaceOfflineCustomerIdInQueuedOperations(
  offlineCustomerId: string,
  serverCustomerId: string,
): Promise<void>;
export function replaceOfflineCustomerIdInQueuedOperations(
  storeKey: string,
  offlineCustomerId: string,
  serverCustomerId: string,
): Promise<void>;
export async function replaceOfflineCustomerIdInQueuedOperations(
  storeKeyOrOfflineCustomerId: string,
  offlineCustomerIdOrServerCustomerId: string,
  maybeServerCustomerId?: string,
): Promise<void> {
  const storeKey = maybeServerCustomerId === undefined
    ? undefined
    : normalizeStoreKey(storeKeyOrOfflineCustomerId);
  const offlineCustomerId = maybeServerCustomerId === undefined
    ? storeKeyOrOfflineCustomerId
    : offlineCustomerIdOrServerCustomerId;
  const serverCustomerId = maybeServerCustomerId === undefined
    ? offlineCustomerIdOrServerCustomerId
    : maybeServerCustomerId;
  const operations = storeKey === undefined
    ? await offlineDb.offlineQueue.toArray()
    : await offlineDb.offlineQueue.where("storeKey").equals(storeKey).toArray();
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
}
