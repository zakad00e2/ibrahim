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
const CACHE_ID_SEPARATOR = "\u001f";

const normalizeStoreKey = (storeKey?: string): string => {
  const trimmed = storeKey?.trim();
  return trimmed ? trimmed : DEFAULT_OFFLINE_STORE_KEY;
};

const buildScopedCacheId = (storeKey: string, entityId: string): string =>
  `${storeKey}${CACHE_ID_SEPARATOR}${entityId}`;

type CachedProduct = Omit<Product, "id"> & {
  id: string;
  productId?: string;
  storeKey: string;
};

const buildProductCacheId = (storeKey: string, productId: string): string =>
  buildScopedCacheId(storeKey, productId);

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

type CachedCustomer = Omit<Customer, "id"> & {
  id: string;
  customerId?: string;
  storeKey: string;
};

const buildCustomerCacheId = (storeKey: string, customerId: string): string =>
  buildScopedCacheId(storeKey, customerId);

const toCachedCustomer = (storeKey: string, customer: Customer): CachedCustomer => ({
  ...customer,
  id: buildCustomerCacheId(storeKey, customer.id),
  customerId: customer.id,
  storeKey,
});

const fromCachedCustomer = ({
  storeKey: _storeKey,
  customerId,
  ...customer
}: CachedCustomer): Customer => ({
  ...customer,
  id: customerId ?? customer.id,
});

type CachedInvoice = Omit<Invoice, "id"> & {
  id: string;
  invoiceId?: string;
  storeKey: string;
};

const buildInvoiceCacheId = (storeKey: string, invoiceId: string): string =>
  buildScopedCacheId(storeKey, invoiceId);

const toCachedInvoice = (storeKey: string, invoice: Invoice): CachedInvoice => ({
  ...invoice,
  id: buildInvoiceCacheId(storeKey, invoice.id),
  invoiceId: invoice.id,
  storeKey,
});

const fromCachedInvoice = ({
  storeKey: _storeKey,
  invoiceId,
  ...invoice
}: CachedInvoice): Invoice => ({
  ...invoice,
  id: invoiceId ?? invoice.id,
});

export type CachedDebtInput = Debt & {
  customerId?: string;
};

export type CachedDebt = Omit<Debt, "id"> & {
  id: string;
  debtId?: string;
  customerId?: string;
  storeKey: string;
};

const buildDebtCacheId = (storeKey: string, debtId: string): string =>
  buildScopedCacheId(storeKey, debtId);

const toCachedDebt = (storeKey: string, debt: CachedDebtInput): CachedDebt => ({
  ...debt,
  id: buildDebtCacheId(storeKey, debt.id),
  debtId: debt.id,
  storeKey,
});

const fromCachedDebt = ({
  storeKey: _storeKey,
  debtId,
  customerId: _customerId,
  ...debt
}: CachedDebt): Debt => ({
  ...debt,
  id: debtId ?? debt.id,
});

type OfflineOperationMetadata = {
  id?: number;
  storeKey?: string;
  createdAt: string;
  clientOperationId?: string;
  ownerSessionKey?: string;
  status?: "pending" | "in-flight";
  inFlightAt?: string;
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
      payload: { customerId: string; amount: number; notes?: string; clientOperationId?: string };
    })
  | (OfflineOperationMetadata & {
      type: "payDebt";
      payload: { debtId: string; amount: number; notes?: string; clientOperationId?: string };
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
  customers!: Table<CachedCustomer, string>;
  invoices!: Table<CachedInvoice, string>;
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

    this.version(3).stores({
      products: "id, storeKey, productId, [storeKey+productId], [storeKey+barcode], name, isActive, stock",
      customers: "id, storeKey, customerId, [storeKey+customerId], name, phone",
      invoices: "id, number, date, customerId",
      debts: "id, storeKey, debtId, customerId, [storeKey+debtId], [storeKey+customerId], invoiceId, date, remaining, isPaid",
      offlineQueue: "++id, storeKey, type, createdAt",
    }).upgrade(async (transaction) => {
      await transaction.table<CachedCustomer, string>("customers").toCollection().modify((customer) => {
        const storeKey = normalizeStoreKey(customer.storeKey);
        const customerId = customer.customerId ?? customer.id;
        customer.storeKey = storeKey;
        customer.customerId = customerId;
        customer.id = buildCustomerCacheId(storeKey, customerId);
      });
      await transaction.table<CachedDebt, string>("debts").toCollection().modify((debt) => {
        const storeKey = normalizeStoreKey(debt.storeKey);
        const debtId = debt.debtId ?? debt.id;
        debt.storeKey = storeKey;
        debt.debtId = debtId;
        debt.id = buildDebtCacheId(storeKey, debtId);
      });
    });

    this.version(4).stores({
      products: "id, storeKey, productId, [storeKey+productId], [storeKey+barcode], name, isActive, stock",
      customers: "id, storeKey, customerId, [storeKey+customerId], name, phone",
      invoices: "id, storeKey, invoiceId, [storeKey+invoiceId], number, date, customerId",
      debts: "id, storeKey, debtId, customerId, [storeKey+debtId], [storeKey+customerId], invoiceId, date, remaining, isPaid",
      offlineQueue: "++id, storeKey, type, createdAt",
    }).upgrade(async (transaction) => {
      await transaction.table<CachedInvoice, string>("invoices").toCollection().modify((invoice) => {
        const storeKey = normalizeStoreKey(invoice.storeKey);
        const invoiceId = invoice.invoiceId ?? invoice.id;
        invoice.storeKey = storeKey;
        invoice.invoiceId = invoiceId;
        invoice.id = buildInvoiceCacheId(storeKey, invoiceId);
      });
    });

    this.version(5).stores({
      products: "id, storeKey, productId, [storeKey+productId], [storeKey+barcode], name, isActive, stock",
      customers: "id, storeKey, customerId, [storeKey+customerId], name, phone",
      invoices: "id, storeKey, invoiceId, [storeKey+invoiceId], number, date, customerId",
      debts: "id, storeKey, debtId, customerId, [storeKey+debtId], [storeKey+customerId], invoiceId, date, remaining, isPaid",
      offlineQueue: "++id, storeKey, ownerSessionKey, status, clientOperationId, type, createdAt",
    }).upgrade(async (transaction) => {
      await transaction.table<OfflineOperation, number>("offlineQueue").toCollection().modify((operation) => {
        operation.status = operation.status ?? "pending";
        operation.clientOperationId = operation.clientOperationId ?? (
          "localId" in operation ? operation.localId : undefined
        );
      });
    });
  }
}

export const offlineDb = new CashierOfflineDb();

const normalizeSearch = (search?: string) => search?.trim().toLowerCase() ?? "";

const isOfflineCustomerId = (id?: string): boolean => id?.startsWith("offline-customer-") ?? false;

const normalizeCustomerIdentity = (input: Pick<CustomerInput, "name" | "phone">) => ({
  name: input.name.trim().toLowerCase(),
  phone: input.phone.trim(),
});

const hasSameOfflineCustomerIdentity = (
  customer: Pick<Customer, "id" | "name" | "phone">,
  input: Pick<CustomerInput, "name" | "phone">,
): boolean => {
  if (!isOfflineCustomerId(customer.id)) return false;
  const customerIdentity = normalizeCustomerIdentity(customer);
  const inputIdentity = normalizeCustomerIdentity(input);
  return customerIdentity.name === inputIdentity.name && customerIdentity.phone === inputIdentity.phone;
};

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

const resolveCustomerItemsArgs = (
  storeKeyOrItems: string | Customer[],
  maybeItems?: Customer[],
): { storeKey: string; items: Customer[] } => {
  if (Array.isArray(storeKeyOrItems)) {
    return { storeKey: DEFAULT_OFFLINE_STORE_KEY, items: storeKeyOrItems };
  }

  return { storeKey: normalizeStoreKey(storeKeyOrItems), items: maybeItems ?? [] };
};

const resolveCustomerQueryArgs = (
  storeKeyOrQuery?: string | OfflineListQuery,
  maybeQuery?: OfflineListQuery,
): { storeKey: string; query: OfflineListQuery } => {
  if (typeof storeKeyOrQuery === "string") {
    return { storeKey: normalizeStoreKey(storeKeyOrQuery), query: maybeQuery ?? {} };
  }

  return { storeKey: DEFAULT_OFFLINE_STORE_KEY, query: storeKeyOrQuery ?? {} };
};

const resolveInvoiceItemsArgs = (
  storeKeyOrItems: string | Invoice[],
  maybeItems?: Invoice[],
): { storeKey: string; items: Invoice[] } => {
  if (Array.isArray(storeKeyOrItems)) {
    return { storeKey: DEFAULT_OFFLINE_STORE_KEY, items: storeKeyOrItems };
  }

  return { storeKey: normalizeStoreKey(storeKeyOrItems), items: maybeItems ?? [] };
};

const resolveInvoiceQueryArgs = (
  storeKeyOrQuery?: string | OfflineListQuery,
  maybeQuery?: OfflineListQuery,
): { storeKey: string; query: OfflineListQuery } => {
  if (typeof storeKeyOrQuery === "string") {
    return { storeKey: normalizeStoreKey(storeKeyOrQuery), query: maybeQuery ?? {} };
  }

  return { storeKey: DEFAULT_OFFLINE_STORE_KEY, query: storeKeyOrQuery ?? {} };
};

const resolveEntityIdArgs = (
  storeKeyOrId: string,
  maybeId?: string,
): { storeKey: string; id: string } => {
  if (maybeId === undefined) {
    return { storeKey: DEFAULT_OFFLINE_STORE_KEY, id: storeKeyOrId };
  }

  return { storeKey: normalizeStoreKey(storeKeyOrId), id: maybeId };
};

const resolveDebtItemsArgs = (
  storeKeyOrItems: string | CachedDebtInput[],
  maybeItems?: CachedDebtInput[],
): { storeKey: string; items: CachedDebtInput[] } => {
  if (Array.isArray(storeKeyOrItems)) {
    return { storeKey: DEFAULT_OFFLINE_STORE_KEY, items: storeKeyOrItems };
  }

  return { storeKey: normalizeStoreKey(storeKeyOrItems), items: maybeItems ?? [] };
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

export function replaceCachedCustomers(items: Customer[]): Promise<void>;
export function replaceCachedCustomers(storeKey: string, items: Customer[]): Promise<void>;
export async function replaceCachedCustomers(
  storeKeyOrItems: string | Customer[],
  maybeItems?: Customer[],
): Promise<void> {
  const { storeKey, items } = resolveCustomerItemsArgs(storeKeyOrItems, maybeItems);
  await offlineDb.transaction("rw", offlineDb.customers, offlineDb.debts, async () => {
    await offlineDb.customers.where("storeKey").equals(storeKey).delete();
    await offlineDb.debts.where("storeKey").equals(storeKey).delete();
    if (items.length > 0) {
      await offlineDb.customers.bulkPut(items.map((customer) => toCachedCustomer(storeKey, customer)));
      const debts = items.flatMap((customer) =>
        customer.debts.map((debt) => toCachedDebt(storeKey, { ...debt, customerId: customer.id })),
      );
      if (debts.length > 0) await offlineDb.debts.bulkPut(debts);
    }
  });
}

export function upsertCachedCustomers(items: Customer[]): Promise<void>;
export function upsertCachedCustomers(storeKey: string, items: Customer[]): Promise<void>;
export async function upsertCachedCustomers(
  storeKeyOrItems: string | Customer[],
  maybeItems?: Customer[],
): Promise<void> {
  const { storeKey, items } = resolveCustomerItemsArgs(storeKeyOrItems, maybeItems);
  if (items.length === 0) return;
  await offlineDb.transaction("rw", offlineDb.customers, offlineDb.debts, async () => {
    await offlineDb.customers.bulkPut(items.map((customer) => toCachedCustomer(storeKey, customer)));
    const debts = items.flatMap((customer) =>
      customer.debts.map((debt) => toCachedDebt(storeKey, { ...debt, customerId: customer.id })),
    );
    if (debts.length > 0) await offlineDb.debts.bulkPut(debts);
  });
}

export type QueueCachedOfflineCustomerCreationResult = {
  customer: Customer;
  created: boolean;
};

export const queueCachedOfflineCustomerCreation = async (
  storeKey: string,
  input: CustomerInput,
  customer: Customer,
  ownerSessionKey?: string,
): Promise<QueueCachedOfflineCustomerCreationResult> => {
  const normalizedStoreKey = normalizeStoreKey(storeKey);
  const inputIdentity = normalizeCustomerIdentity(input);

  return offlineDb.transaction("rw", offlineDb.customers, offlineDb.debts, offlineDb.offlineQueue, async () => {
    const existingCachedCustomer = await offlineDb.customers
      .where("storeKey")
      .equals(normalizedStoreKey)
      .filter((cachedCustomer) =>
        hasSameOfflineCustomerIdentity(fromCachedCustomer(cachedCustomer), input),
      )
      .first();

    if (existingCachedCustomer) {
      const existingCustomer = fromCachedCustomer(existingCachedCustomer);
      const existingQueuedCreate = await offlineDb.offlineQueue
        .where("storeKey")
        .equals(normalizedStoreKey)
        .filter((operation) => {
          if (operation.type !== "createCustomer") return false;
          const payloadIdentity = normalizeCustomerIdentity(operation.payload);
          return (
            operation.localId === existingCustomer.id ||
            (payloadIdentity.name === inputIdentity.name && payloadIdentity.phone === inputIdentity.phone)
          );
        })
        .first();

      if (!existingQueuedCreate) {
        await offlineDb.offlineQueue.add({
          type: "createCustomer",
          payload: input,
          localId: existingCustomer.id,
          clientOperationId: existingCustomer.id,
          ownerSessionKey,
          storeKey: normalizedStoreKey,
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      }

      return { customer: existingCustomer, created: false };
    }

    await offlineDb.offlineQueue.add({
      type: "createCustomer",
      payload: input,
      localId: customer.id,
      clientOperationId: customer.id,
      ownerSessionKey,
      storeKey: normalizedStoreKey,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    await offlineDb.customers.put(toCachedCustomer(normalizedStoreKey, customer));
    if (customer.debts.length > 0) {
      await offlineDb.debts.bulkPut(
        customer.debts.map((debt) => toCachedDebt(normalizedStoreKey, { ...debt, customerId: customer.id })),
      );
    }

    return { customer, created: true };
  });
};

export function listCachedCustomers(query?: OfflineListQuery): Promise<OfflineListResult<Customer>>;
export function listCachedCustomers(storeKey: string, query?: OfflineListQuery): Promise<OfflineListResult<Customer>>;
export async function listCachedCustomers(
  storeKeyOrQuery: string | OfflineListQuery = {},
  maybeQuery?: OfflineListQuery,
): Promise<OfflineListResult<Customer>> {
  const { storeKey, query } = resolveCustomerQueryArgs(storeKeyOrQuery, maybeQuery);
  const search = normalizeSearch(query.search);
  const items = (await offlineDb.customers.where("storeKey").equals(storeKey).toArray()).filter((customer) =>
    includesSearch([customer.name, customer.phone], search),
  ).map(fromCachedCustomer);

  return paginate(items, query.page, query.limit);
}

export function getCachedCustomer(id: string): Promise<Customer | null>;
export function getCachedCustomer(storeKey: string, id: string): Promise<Customer | null>;
export async function getCachedCustomer(storeKeyOrId: string, maybeId?: string): Promise<Customer | null> {
  const { storeKey, id } = resolveEntityIdArgs(storeKeyOrId, maybeId);
  const customer = await offlineDb.customers.get(buildCustomerCacheId(storeKey, id));
  return customer ? fromCachedCustomer(customer) : null;
}

export function deleteCachedCustomer(id: string): Promise<void>;
export function deleteCachedCustomer(storeKey: string, id: string): Promise<void>;
export async function deleteCachedCustomer(storeKeyOrId: string, maybeId?: string): Promise<void> {
  const { storeKey, id } = resolveEntityIdArgs(storeKeyOrId, maybeId);
  await offlineDb.transaction("rw", offlineDb.customers, offlineDb.debts, async () => {
    const customerCacheId = buildCustomerCacheId(storeKey, id);
    const debtsByCustomerId = await offlineDb.debts.where("[storeKey+customerId]").equals([storeKey, id]).toArray();

    if (debtsByCustomerId.length > 0) {
      await offlineDb.debts.bulkDelete(debtsByCustomerId.map((debt) => debt.id));
    }

    await offlineDb.customers.delete(customerCacheId);
  });
}

export function replaceCachedInvoices(items: Invoice[]): Promise<void>;
export function replaceCachedInvoices(storeKey: string, items: Invoice[]): Promise<void>;
export async function replaceCachedInvoices(
  storeKeyOrItems: string | Invoice[],
  maybeItems?: Invoice[],
): Promise<void> {
  const { storeKey, items } = resolveInvoiceItemsArgs(storeKeyOrItems, maybeItems);
  await offlineDb.transaction("rw", offlineDb.invoices, async () => {
    await offlineDb.invoices.where("storeKey").equals(storeKey).delete();
    if (items.length > 0) await offlineDb.invoices.bulkPut(items.map((invoice) => toCachedInvoice(storeKey, invoice)));
  });
}

export function upsertCachedInvoices(items: Invoice[]): Promise<void>;
export function upsertCachedInvoices(storeKey: string, items: Invoice[]): Promise<void>;
export async function upsertCachedInvoices(
  storeKeyOrItems: string | Invoice[],
  maybeItems?: Invoice[],
): Promise<void> {
  const { storeKey, items } = resolveInvoiceItemsArgs(storeKeyOrItems, maybeItems);
  if (items.length === 0) return;
  await offlineDb.invoices.bulkPut(items.map((invoice) => toCachedInvoice(storeKey, invoice)));
}

export function listCachedInvoices(query?: OfflineListQuery): Promise<OfflineListResult<Invoice>>;
export function listCachedInvoices(storeKey: string, query?: OfflineListQuery): Promise<OfflineListResult<Invoice>>;
export async function listCachedInvoices(
  storeKeyOrQuery: string | OfflineListQuery = {},
  maybeQuery?: OfflineListQuery,
): Promise<OfflineListResult<Invoice>> {
  const { storeKey, query } = resolveInvoiceQueryArgs(storeKeyOrQuery, maybeQuery);
  const search = normalizeSearch(query.search);
  const items = (await offlineDb.invoices.where("storeKey").equals(storeKey).toArray())
    .filter((invoice) =>
      includesSearch([invoice.number, invoice.customerName, invoice.notes], search),
    )
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .map(fromCachedInvoice);

  return paginate(items, query.page, query.limit);
}

export function getCachedInvoice(id: string): Promise<Invoice | null>;
export function getCachedInvoice(storeKey: string, id: string): Promise<Invoice | null>;
export async function getCachedInvoice(storeKeyOrId: string, maybeId?: string): Promise<Invoice | null> {
  const { storeKey, id } = resolveEntityIdArgs(storeKeyOrId, maybeId);
  const invoice = await offlineDb.invoices.get(buildInvoiceCacheId(storeKey, id));
  return invoice ? fromCachedInvoice(invoice) : null;
}

export function deleteCachedInvoice(id: string): Promise<void>;
export function deleteCachedInvoice(storeKey: string, id: string): Promise<void>;
export async function deleteCachedInvoice(storeKeyOrId: string, maybeId?: string): Promise<void> {
  const { storeKey, id } = resolveEntityIdArgs(storeKeyOrId, maybeId);
  await offlineDb.invoices.delete(buildInvoiceCacheId(storeKey, id));
}

export function replaceCachedDebts(items: CachedDebtInput[]): Promise<void>;
export function replaceCachedDebts(storeKey: string, items: CachedDebtInput[]): Promise<void>;
export async function replaceCachedDebts(
  storeKeyOrItems: string | CachedDebtInput[],
  maybeItems?: CachedDebtInput[],
): Promise<void> {
  const { storeKey, items } = resolveDebtItemsArgs(storeKeyOrItems, maybeItems);
  await offlineDb.transaction("rw", offlineDb.debts, async () => {
    await offlineDb.debts.where("storeKey").equals(storeKey).delete();
    if (items.length > 0) await offlineDb.debts.bulkPut(items.map((debt) => toCachedDebt(storeKey, debt)));
  });
}

export function upsertCachedDebts(items: CachedDebtInput[]): Promise<void>;
export function upsertCachedDebts(storeKey: string, items: CachedDebtInput[]): Promise<void>;
export async function upsertCachedDebts(
  storeKeyOrItems: string | CachedDebtInput[],
  maybeItems?: CachedDebtInput[],
): Promise<void> {
  const { storeKey, items } = resolveDebtItemsArgs(storeKeyOrItems, maybeItems);
  if (items.length === 0) return;
  await offlineDb.debts.bulkPut(items.map((debt) => toCachedDebt(storeKey, debt)));
}

export function cacheCustomerDebts(
  customerId: string,
  debts: Debt[],
  debtBalance: number,
  creditBalance?: number,
): Promise<void>;
export function cacheCustomerDebts(
  storeKey: string,
  customerId: string,
  debts: Debt[],
  debtBalance: number,
  creditBalance?: number,
): Promise<void>;
export async function cacheCustomerDebts(
  storeKeyOrCustomerId: string,
  customerIdOrDebts: string | Debt[],
  debtsOrDebtBalance: Debt[] | number,
  maybeDebtBalance?: number,
  maybeCreditBalance?: number,
): Promise<void> {
  const storeKey = Array.isArray(customerIdOrDebts)
    ? DEFAULT_OFFLINE_STORE_KEY
    : normalizeStoreKey(storeKeyOrCustomerId);
  const customerId = Array.isArray(customerIdOrDebts)
    ? storeKeyOrCustomerId
    : customerIdOrDebts;
  const debts = Array.isArray(customerIdOrDebts)
    ? customerIdOrDebts
    : debtsOrDebtBalance as Debt[];
  const debtBalance = Array.isArray(customerIdOrDebts)
    ? debtsOrDebtBalance as number
    : maybeDebtBalance ?? 0;
  const creditBalance = Array.isArray(customerIdOrDebts)
    ? maybeDebtBalance ?? 0
    : maybeCreditBalance ?? 0;

  await offlineDb.transaction("rw", offlineDb.customers, offlineDb.debts, async () => {
    const customer = await offlineDb.customers.get(buildCustomerCacheId(storeKey, customerId));
    if (customer) {
      await offlineDb.customers.put({
        ...customer,
        debts,
        debtBalance,
        creditBalance,
        balance: creditBalance - debtBalance,
      });
    }

    const previousDebts = await offlineDb.debts.where("[storeKey+customerId]").equals([storeKey, customerId]).toArray();
    await offlineDb.debts.bulkDelete(previousDebts.map((debt) => debt.id));
    if (debts.length > 0) {
      await offlineDb.debts.bulkPut(debts.map((debt) => toCachedDebt(storeKey, { ...debt, customerId })));
    }
  });
}

export function listCachedCustomerDebts(customerId: string): Promise<Debt[]>;
export function listCachedCustomerDebts(storeKey: string, customerId: string): Promise<Debt[]>;
export async function listCachedCustomerDebts(storeKeyOrCustomerId: string, maybeCustomerId?: string): Promise<Debt[]> {
  const { storeKey, id: customerId } = resolveEntityIdArgs(storeKeyOrCustomerId, maybeCustomerId);
  const customer = await offlineDb.customers.get(buildCustomerCacheId(storeKey, customerId));
  if (customer?.debts.length) return customer.debts;

  const debts = await offlineDb.debts.where("[storeKey+customerId]").equals([storeKey, customerId]).toArray();
  return debts.map(fromCachedDebt);
}

export function getCachedDebt(id: string): Promise<Debt | null>;
export function getCachedDebt(storeKey: string, id: string): Promise<Debt | null>;
export async function getCachedDebt(storeKeyOrId: string, maybeId?: string): Promise<Debt | null> {
  const { storeKey, id } = resolveEntityIdArgs(storeKeyOrId, maybeId);
  const debt = await offlineDb.debts.get(buildDebtCacheId(storeKey, id));
  return debt ? fromCachedDebt(debt) : null;
}

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
  const payloadClientOperationId =
    "payload" in operation &&
    typeof operation.payload === "object" &&
    operation.payload !== null &&
    "clientOperationId" in operation.payload &&
    typeof operation.payload.clientOperationId === "string"
      ? operation.payload.clientOperationId
      : undefined;
  const localOperationId = "localId" in operation ? operation.localId : undefined;
  const clientOperationId = operation.clientOperationId ?? localOperationId ?? payloadClientOperationId;

  return offlineDb.offlineQueue.add({
    ...operation,
    storeKey,
    clientOperationId,
    status: operation.status ?? "pending",
    createdAt: operation.createdAt ?? new Date().toISOString(),
  } as OfflineOperation);
}

export const listOfflineOperations = async (storeKey?: string, ownerSessionKey?: string): Promise<OfflineOperation[]> => {
  // Operations queued before owner tracking existed carry no owner, so any session of the same
  // store must claim them. Otherwise they stay queued forever and never reach the server.
  const isOwnedBySession = (operation: OfflineOperation) =>
    ownerSessionKey === undefined ||
    operation.ownerSessionKey === undefined ||
    operation.ownerSessionKey === ownerSessionKey;
  const isPending = (operation: OfflineOperation) =>
    (operation.status ?? "pending") === "pending" && isOwnedBySession(operation);

  if (storeKey === undefined) {
    return (await offlineDb.offlineQueue.orderBy("createdAt").toArray()).filter(isPending);
  }

  return (await offlineDb.offlineQueue.where("storeKey").equals(normalizeStoreKey(storeKey)).sortBy("createdAt"))
    .filter(isPending);
};

export const hasOfflineOperations = async (storeKey?: string, ownerSessionKey?: string): Promise<boolean> => {
  const operations = await listOfflineOperations(storeKey, ownerSessionKey);
  return operations.length > 0;
};

export const deleteOfflineOperation = async (id: number, storeKey?: string): Promise<void> => {
  if (storeKey === undefined) {
    await offlineDb.offlineQueue.delete(id);
    return;
  }

  const operation = await offlineDb.offlineQueue.get(id);
  if (operation?.storeKey === normalizeStoreKey(storeKey)) {
    await offlineDb.offlineQueue.delete(id);
  }
};

export const markOfflineOperationInFlight = async (id: number): Promise<void> => {
  await offlineDb.offlineQueue.update(id, {
    status: "in-flight",
    inFlightAt: new Date().toISOString(),
  });
};

export const recoverInFlightOfflineOperations = async (storeKey?: string): Promise<void> => {
  const operations = storeKey === undefined
    ? await offlineDb.offlineQueue.where("status").equals("in-flight").toArray()
    : await offlineDb.offlineQueue
        .where("storeKey")
        .equals(normalizeStoreKey(storeKey))
        .filter((operation) => operation.status === "in-flight")
        .toArray();

  if (operations.length === 0) return;

  await offlineDb.offlineQueue.bulkPut(
    operations.map((operation) => ({
      ...operation,
      status: "pending" as const,
      inFlightAt: undefined,
    })),
  );
};

export const clearOfflineData = async (): Promise<void> => {
  await Promise.all([
    offlineDb.products.clear(),
    offlineDb.customers.clear(),
    offlineDb.invoices.clear(),
    offlineDb.debts.clear(),
    offlineDb.offlineQueue.clear(),
  ]);
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
