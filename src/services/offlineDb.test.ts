import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Customer, CustomerInput, Invoice, Product, SaleRequest } from "../types";
import {
  deleteCachedCustomer,
  deleteCachedInvoice,
  listCachedCustomers,
  listCachedInvoices,
  listCachedProducts,
  listOfflineOperations,
  hasOfflineOperations,
  offlineDb,
  queueCachedOfflineCustomerCreation,
  queueOfflineOperation,
  replaceCachedCustomers,
  replaceCachedInvoices,
  replaceCachedProducts,
  replaceOfflineCustomerIdInQueuedOperations,
} from "./offlineDb";

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "p1",
  name: "Tea",
  barcode: "123",
  price: 10,
  wholesalePrice: 7,
  stock: 4,
  minStock: 1,
  isActive: true,
  ...overrides,
});

const makeCustomer = (overrides: Partial<Customer> = {}): Customer => ({
  id: "offline-customer-1",
  name: "Ahmed",
  phone: "011",
  debtBalance: 25,
  debts: [
    {
      id: "offline-debt-1",
      invoiceId: "",
      description: "Opening debt",
      date: "2026-05-17T10:00:00.000Z",
      amount: 25,
      paid: 0,
      remaining: 25,
      isPaid: false,
    },
  ],
  ...overrides,
});

const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: "offline-invoice-1",
  number: "OFFLINE-1",
  date: "2026-05-17T10:00:00.000Z",
  customerId: "offline-customer-1",
  customerName: "Ahmed",
  items: [],
  total: 0,
  paid: 0,
  remaining: 0,
  paymentMethod: "cash",
  ...overrides,
});

describe("offlineDb", () => {
  beforeEach(async () => {
    await offlineDb.delete();
    await offlineDb.open();
  });

  it("replaces cached products without keeping stale rows", async () => {
    await replaceCachedProducts([
      makeProduct({ id: "p1", name: "Tea" }),
      makeProduct({ id: "p2", name: "Sugar", barcode: "456" }),
    ]);

    await replaceCachedProducts([makeProduct({ id: "p2", name: "Sugar", barcode: "456" })]);

    await expect(listCachedProducts({ search: "", isActive: true, page: 1, limit: 20 })).resolves.toEqual({
      items: [makeProduct({ id: "p2", name: "Sugar", barcode: "456" })],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it("filters cached products by search, active state, and page", async () => {
    await replaceCachedProducts([
      makeProduct({ id: "p1", name: "Tea", barcode: "123", isActive: true }),
      makeProduct({ id: "p2", name: "Tea Bags", barcode: "456", isActive: true }),
      makeProduct({ id: "p3", name: "Coffee", barcode: "789", isActive: false }),
    ]);

    await expect(listCachedProducts({ search: "tea", isActive: true, page: 2, limit: 1 })).resolves.toEqual({
      items: [makeProduct({ id: "p2", name: "Tea Bags", barcode: "456", isActive: true })],
      total: 2,
      page: 2,
      limit: 1,
    });
  });

  it("keeps cached products isolated by store", async () => {
    await replaceCachedProducts("store-a", [
      makeProduct({ id: "shared-product", name: "Tea", barcode: "123" }),
    ]);
    await replaceCachedProducts("store-b", [
      makeProduct({ id: "shared-product", name: "Sugar", barcode: "456" }),
    ]);

    await expect(listCachedProducts("store-a", { page: 1, limit: 20 })).resolves.toMatchObject({
      items: [makeProduct({ id: "shared-product", name: "Tea", barcode: "123" })],
      total: 1,
    });
    await expect(listCachedProducts("store-b", { page: 1, limit: 20 })).resolves.toMatchObject({
      items: [makeProduct({ id: "shared-product", name: "Sugar", barcode: "456" })],
      total: 1,
    });
  });

  it("keeps cached customers isolated by store", async () => {
    await replaceCachedCustomers("store-a", [
      makeCustomer({ id: "shared-customer", name: "Online Store Customer", phone: "010" }),
    ]);
    await replaceCachedCustomers("store-b", [
      makeCustomer({ id: "shared-customer", name: "Other Store Customer", phone: "011" }),
    ]);

    await expect(listCachedCustomers("store-a", { page: 1, limit: 20 })).resolves.toMatchObject({
      items: [makeCustomer({ id: "shared-customer", name: "Online Store Customer", phone: "010" })],
      total: 1,
    });
    await expect(listCachedCustomers("store-b", { page: 1, limit: 20 })).resolves.toMatchObject({
      items: [makeCustomer({ id: "shared-customer", name: "Other Store Customer", phone: "011" })],
      total: 1,
    });
  });

  it("queues write operations with createdAt metadata", async () => {
    const customer: CustomerInput = {
      name: "Ahmed",
      phone: "011",
    };

    const id = await queueOfflineOperation({ type: "createCustomer", payload: customer });
    const saved = await offlineDb.offlineQueue.get(id);

    expect(saved?.type).toBe("createCustomer");
    expect(saved?.payload).toEqual(customer);
    expect(saved?.createdAt).toEqual(expect.any(String));
  });

  it("keeps duplicate offline customer submissions with opening debt as one cached customer and one queued create", async () => {
    const input: CustomerInput = {
      name: "Ahmed",
      phone: "011",
      initialDebt: 75,
    };
    const firstCustomer = makeCustomer({
      id: "offline-customer-1",
      debtBalance: 75,
      debts: [
        {
          id: "offline-debt-offline-customer-1",
          invoiceId: "",
          description: "Opening debt",
          date: "2026-05-17T10:00:00.000Z",
          amount: 75,
          paid: 0,
          remaining: 75,
          isPaid: false,
        },
      ],
    });
    const duplicateCustomer = makeCustomer({
      id: "offline-customer-2",
      debtBalance: 75,
      debts: [
        {
          id: "offline-debt-offline-customer-2",
          invoiceId: "",
          description: "Opening debt",
          date: "2026-05-17T10:00:01.000Z",
          amount: 75,
          paid: 0,
          remaining: 75,
          isPaid: false,
        },
      ],
    });

    const results = await Promise.all([
      queueCachedOfflineCustomerCreation("store-a", input, firstCustomer),
      queueCachedOfflineCustomerCreation("store-a", input, duplicateCustomer),
    ]);

    const cachedCustomers = await listCachedCustomers("store-a", { page: 1, limit: 20 });
    expect(cachedCustomers.items).toHaveLength(1);
    expect(cachedCustomers.total).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(results.every((result) => result.customer.id === cachedCustomers.items[0].id)).toBe(true);
    await expect(listOfflineOperations("store-a")).resolves.toMatchObject([
      {
        type: "createCustomer",
        payload: input,
        localId: cachedCustomers.items[0].id,
      },
    ]);
  });

  it("queues offline sale operations with createdAt metadata", async () => {
    const sale: SaleRequest = {
      items: [],
      paymentMethod: "cash",
    };

    const id = await queueOfflineOperation({ type: "createInvoice", payload: sale });
    const saved = await offlineDb.offlineQueue.get(id);

    expect(saved?.type).toBe("createInvoice");
    expect(saved?.payload).toEqual(sale);
    expect(saved?.createdAt).toEqual(expect.any(String));
  });

  it("reports whether queued offline operations are pending", async () => {
    await expect(hasOfflineOperations()).resolves.toBe(false);

    await queueOfflineOperation({
      type: "createInvoice",
      payload: {
        items: [],
        paymentMethod: "cash",
      },
    });

    await expect(hasOfflineOperations()).resolves.toBe(true);
  });

  it("reports pending offline operations for the current store only", async () => {
    await queueOfflineOperation("store-a", {
      type: "createInvoice",
      payload: {
        items: [],
        paymentMethod: "cash",
      },
    });

    await expect(hasOfflineOperations("store-a")).resolves.toBe(true);
    await expect(hasOfflineOperations("store-b")).resolves.toBe(false);
  });

  it("replaces offline customer ids inside queued operations", async () => {
    const invoiceOperationId = await queueOfflineOperation({
      type: "createInvoice",
      payload: {
        items: [],
        paymentMethod: "debt",
        customerId: "offline-customer-1",
      },
    });
    const paymentOperationId = await queueOfflineOperation({
      type: "payCustomerDebt",
      payload: {
        customerId: "offline-customer-1",
        amount: 10,
      },
    });

    await replaceOfflineCustomerIdInQueuedOperations("offline-customer-1", "server-customer-9");

    const invoiceOperation = await offlineDb.offlineQueue.get(invoiceOperationId);
    const paymentOperation = await offlineDb.offlineQueue.get(paymentOperationId);
    expect(invoiceOperation?.type).toBe("createInvoice");
    expect(paymentOperation?.type).toBe("payCustomerDebt");
    if (invoiceOperation?.type === "createInvoice") {
      expect(invoiceOperation.payload.customerId).toBe("server-customer-9");
    }
    if (paymentOperation?.type === "payCustomerDebt") {
      expect(paymentOperation.payload.customerId).toBe("server-customer-9");
    }
  });

  it("deletes cached offline customers with their cached debts", async () => {
    await replaceCachedCustomers([makeCustomer()]);

    await deleteCachedCustomer("offline-customer-1");

    await expect(listCachedCustomers({ page: 1, limit: 20 })).resolves.toMatchObject({
      items: [],
      total: 0,
    });
    await expect(offlineDb.debts.toArray()).resolves.toEqual([]);
  });

  it("keeps cached invoices isolated by store", async () => {
    await replaceCachedInvoices("store-a", [
      makeInvoice({ id: "shared-invoice", number: "A-1", customerName: "Store A Customer" }),
    ]);
    await replaceCachedInvoices("store-b", [
      makeInvoice({ id: "shared-invoice", number: "B-1", customerName: "Store B Customer" }),
    ]);

    await expect(listCachedInvoices("store-a", { page: 1, limit: 20 })).resolves.toMatchObject({
      items: [makeInvoice({ id: "shared-invoice", number: "A-1", customerName: "Store A Customer" })],
      total: 1,
    });
    await expect(listCachedInvoices("store-b", { page: 1, limit: 20 })).resolves.toMatchObject({
      items: [makeInvoice({ id: "shared-invoice", number: "B-1", customerName: "Store B Customer" })],
      total: 1,
    });
  });

  it("deletes cached offline invoices", async () => {
    await replaceCachedInvoices([makeInvoice()]);

    await deleteCachedInvoice("offline-invoice-1");

    await expect(listCachedInvoices({ page: 1, limit: 20 })).resolves.toMatchObject({
      items: [],
      total: 0,
    });
  });
});
