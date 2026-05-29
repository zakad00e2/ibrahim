// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer, CustomerInput, Invoice, Product, ProductInput, SaleRequest } from "../types";
import { AppStoreProvider, useAppStore } from "./AppStore";
import type { OfflineQueueDrainOptions } from "../services/offlineSync";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const productApiMocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getLowStockProducts: vi.fn(),
  getProductByBarcode: vi.fn(),
  listProducts: vi.fn(),
  updateProduct: vi.fn(),
}));

const customerApiMocks = vi.hoisted(() => ({
  createCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  getCustomerById: vi.fn(),
  listCustomers: vi.fn(),
  updateCustomer: vi.fn(),
}));

const invoiceApiMocks = vi.hoisted(() => ({
  createInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  getInvoiceById: vi.fn(),
  listInvoices: vi.fn(),
  updateInvoice: vi.fn(),
}));

const debtApiMocks = vi.hoisted(() => ({
  getCustomerDebts: vi.fn(),
  getDebtById: vi.fn(),
  payCustomerDebtAuto: vi.fn(),
  payDebt: vi.fn(),
}));

const offlineDbMocks = vi.hoisted(() => ({
  cacheCustomerDebts: vi.fn(),
  deleteCachedCustomer: vi.fn(),
  deleteCachedInvoice: vi.fn(),
  deleteOfflineOperation: vi.fn(),
  getCachedCustomer: vi.fn(),
  getCachedDebt: vi.fn(),
  getCachedInvoice: vi.fn(),
  getCachedProductByBarcode: vi.fn(),
  hasOfflineOperations: vi.fn(),
  listCachedCustomerDebts: vi.fn(),
  listCachedCustomers: vi.fn(),
  listCachedInvoices: vi.fn(),
  listCachedProducts: vi.fn(),
  listOfflineOperations: vi.fn(),
  markOfflineOperationInFlight: vi.fn(),
  queueCachedOfflineCustomerCreation: vi.fn(),
  queueOfflineOperation: vi.fn(),
  recoverInFlightOfflineOperations: vi.fn(),
  replaceOfflineCustomerIdInQueuedOperations: vi.fn(),
  upsertCachedCustomers: vi.fn(),
  upsertCachedDebts: vi.fn(),
  upsertCachedInvoices: vi.fn(),
  upsertCachedProducts: vi.fn(),
}));

const offlineSyncMocks = vi.hoisted(() => ({
  applyCustomerDebtPayment: vi.fn(),
  applyDebtPayment: vi.fn(),
  applyOfflineSaleToProducts: vi.fn(),
  buildOfflineCustomer: vi.fn(),
  buildOfflineInvoice: vi.fn(),
  drainOfflineQueue: vi.fn(),
  getBrowserOnlineState: vi.fn(),
  isNetworkFailure: vi.fn(),
  resolveOfflineCustomerReference: vi.fn(),
  shouldReadFromOfflineCache: vi.fn(),
}));

vi.mock("./AuthStore", () => ({
  useAuthStore: () => ({
    session: {
      token: "token",
      user: {
        role: "ADMIN",
        storeId: "store-1",
      },
    },
  }),
}));

vi.mock("../services/productsApi", () => productApiMocks);
vi.mock("../services/customersApi", () => customerApiMocks);
vi.mock("../services/invoicesApi", () => invoiceApiMocks);
vi.mock("../services/debtsApi", () => debtApiMocks);
vi.mock("../services/offlineDb", () => offlineDbMocks);
vi.mock("../services/offlineSync", () => offlineSyncMocks);

const existingProduct: Product = {
  id: "product-1",
  name: "Rice",
  barcode: "111",
  price: 20,
  wholesalePrice: 15,
  stock: 8,
  minStock: 2,
  isActive: true,
};

const createdProduct: Product = {
  id: "product-2",
  name: "Sugar",
  barcode: "222",
  price: 12,
  wholesalePrice: 9,
  stock: 5,
  minStock: 1,
  isActive: true,
};

const productInput: ProductInput = {
  name: createdProduct.name,
  barcode: createdProduct.barcode,
  price: createdProduct.price,
  wholesalePrice: createdProduct.wholesalePrice,
  stock: createdProduct.stock,
  minStock: createdProduct.minStock,
  isActive: createdProduct.isActive,
};

const queuedSaleRequest: SaleRequest = {
  items: [{
    productId: "product-1",
    productName: "Rice",
    barcode: "111",
    price: 20,
    wholesalePrice: 15,
    quantity: 1,
    total: 20,
  }],
  paymentMethod: "cash",
};

const syncedInvoice: Invoice = {
  id: "server-invoice-1",
  number: "INV-1",
  date: "2026-05-25T10:00:00.000Z",
  customerName: "بيع مباشر",
  items: queuedSaleRequest.items,
  total: 20,
  paid: 20,
  remaining: 0,
  paymentMethod: "cash",
};

const queuedCustomerInput: CustomerInput = {
  name: "Ibrahim",
  phone: "010",
};

const syncedCustomer: Customer = {
  id: "server-customer-1",
  name: "Ibrahim",
  phone: "010",
  debts: [],
  debtBalance: 0,
};

type StoreSnapshot = ReturnType<typeof useAppStore>;

const Probe = ({ onStore }: { onStore: (store: StoreSnapshot) => void }) => {
  onStore(useAppStore());
  return null;
};

const flushAsyncWork = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const waitFor = async (assertion: () => void) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await flushAsyncWork();
    }
  }

  throw lastError;
};

const renderStore = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let currentStore: StoreSnapshot | null = null;

  await act(async () => {
    root.render(
      <AppStoreProvider>
        <Probe onStore={(store) => {
          currentStore = store;
        }} />
      </AppStoreProvider>,
    );
  });

  const getStore = () => {
    if (!currentStore) throw new Error("Store did not render");
    return currentStore;
  };

  return { container, root, getStore };
};

describe("AppStore product actions", () => {
  let mountedRoots: Array<{ container: HTMLDivElement; root: Root }>;

  beforeEach(() => {
    mountedRoots = [];
    vi.clearAllMocks();

    productApiMocks.listProducts.mockResolvedValue({
      items: [existingProduct],
      total: 1,
      page: 1,
      limit: 20,
    });
    productApiMocks.createProduct.mockResolvedValue(createdProduct);
    productApiMocks.getLowStockProducts.mockResolvedValue([]);

    customerApiMocks.listCustomers.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    invoiceApiMocks.listInvoices.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    debtApiMocks.getCustomerDebts.mockResolvedValue({ debts: [], totalDebt: 0, totalPaid: 0, totalRemaining: 0 });

    offlineDbMocks.hasOfflineOperations.mockResolvedValue(false);
    offlineDbMocks.listCachedProducts.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    offlineDbMocks.listCachedCustomers.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    offlineDbMocks.listCachedInvoices.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    offlineDbMocks.listOfflineOperations.mockResolvedValue([]);
    offlineDbMocks.markOfflineOperationInFlight.mockResolvedValue(undefined);
    offlineDbMocks.recoverInFlightOfflineOperations.mockResolvedValue(undefined);
    offlineDbMocks.upsertCachedProducts.mockResolvedValue(undefined);
    offlineDbMocks.upsertCachedCustomers.mockResolvedValue(undefined);
    offlineDbMocks.upsertCachedInvoices.mockResolvedValue(undefined);

    offlineSyncMocks.getBrowserOnlineState.mockReturnValue(true);
    offlineSyncMocks.isNetworkFailure.mockReturnValue(false);
    offlineSyncMocks.shouldReadFromOfflineCache.mockReturnValue(false);
    offlineSyncMocks.drainOfflineQueue.mockResolvedValue({
      processedAny: false,
      drained: true,
      wentOffline: false,
    });
  });

  afterEach(async () => {
    for (const { root, container } of mountedRoots) {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }

    document.body.innerHTML = "";
  });

  it("adds a created product to local product state and total without refetching the list", async () => {
    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().productsLoading).toBe(false);
      expect(mounted.getStore().products).toEqual([existingProduct]);
      expect(mounted.getStore().productsTotal).toBe(1);
    });
    expect(productApiMocks.listProducts).toHaveBeenCalledTimes(1);

    let result: Awaited<ReturnType<StoreSnapshot["addProduct"]>> | undefined;
    await act(async () => {
      result = await mounted.getStore().addProduct(productInput);
    });

    expect(result).toMatchObject({ ok: true, id: createdProduct.id });
    expect(productApiMocks.listProducts).toHaveBeenCalledTimes(1);
    expect(mounted.getStore().products).toEqual([createdProduct, existingProduct]);
    expect(mounted.getStore().productsTotal).toBe(2);
    expect(mounted.getStore().productsLoading).toBe(false);
  });

  it("passes queued offline invoice local id as clientInvoiceId when syncing", async () => {
    const localId = "offline-invoice-1779012000000";
    invoiceApiMocks.createInvoice.mockResolvedValue(syncedInvoice);
    offlineDbMocks.listOfflineOperations.mockResolvedValue([{
      id: 1,
      type: "createInvoice",
      payload: queuedSaleRequest,
      localId,
      createdAt: "2026-05-17T10:00:00.000Z",
    }]);
    offlineSyncMocks.resolveOfflineCustomerReference.mockImplementation((payload: SaleRequest) => payload);
    offlineSyncMocks.drainOfflineQueue.mockImplementation(async (options: OfflineQueueDrainOptions) => {
      const operations = await options.listOperations();

      for (const operation of operations) {
        await options.processOperation(operation, new Map<string, string>());
        if (operation.id) await options.deleteOperation(operation.id);
      }

      return { processedAny: operations.length > 0, drained: true, wentOffline: false };
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(invoiceApiMocks.createInvoice).toHaveBeenCalledWith(queuedSaleRequest, {
        clientInvoiceId: localId,
      });
    });
    expect(offlineDbMocks.deleteCachedInvoice).toHaveBeenCalledWith("store:store-1", localId);
  });

  it("passes queued offline customer local id as clientCustomerId when syncing", async () => {
    const localId = "offline-customer-1779012000000";
    customerApiMocks.createCustomer.mockResolvedValue(syncedCustomer);
    offlineDbMocks.listOfflineOperations.mockResolvedValue([{
      id: 1,
      type: "createCustomer",
      payload: queuedCustomerInput,
      localId,
      createdAt: "2026-05-17T10:00:00.000Z",
    }]);
    offlineSyncMocks.drainOfflineQueue.mockImplementation(async (options: OfflineQueueDrainOptions) => {
      const operations = await options.listOperations();

      for (const operation of operations) {
        await options.processOperation(operation, new Map<string, string>());
        if (operation.id) await options.deleteOperation(operation.id);
      }

      return { processedAny: operations.length > 0, drained: true, wentOffline: false };
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(customerApiMocks.createCustomer).toHaveBeenCalledWith(queuedCustomerInput, {
        clientCustomerId: localId,
      });
    });
    expect(offlineDbMocks.deleteCachedCustomer).toHaveBeenCalledWith("store:store-1", localId);
  });

  it("reuses the same client invoice operation id after an ambiguous create failure is queued", async () => {
    invoiceApiMocks.createInvoice.mockRejectedValue(new TypeError("Failed to fetch"));
    offlineSyncMocks.isNetworkFailure.mockReturnValue(true);
    offlineSyncMocks.buildOfflineInvoice.mockReturnValue({
      ...syncedInvoice,
      id: "offline-invoice-cached",
      number: "OFFLINE-CACHED",
    });
    offlineSyncMocks.applyOfflineSaleToProducts.mockReturnValue([
      { ...existingProduct, stock: existingProduct.stock - 1 },
    ]);

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().products).toEqual([existingProduct]);
    });

    let result: Awaited<ReturnType<StoreSnapshot["completeSale"]>> | undefined;
    await act(async () => {
      result = await mounted.getStore().completeSale(queuedSaleRequest);
    });

    expect(result).toMatchObject({ ok: true });
    const [, createOptions] = invoiceApiMocks.createInvoice.mock.calls[0] as [
      SaleRequest,
      { clientInvoiceId?: string },
    ];
    expect(createOptions.clientInvoiceId).toEqual(expect.stringMatching(/^offline-invoice-/));
    expect(offlineDbMocks.queueOfflineOperation).toHaveBeenCalledWith(
      "store:store-1",
      expect.objectContaining({
        type: "createInvoice",
        localId: createOptions.clientInvoiceId,
        clientOperationId: createOptions.clientInvoiceId,
      }),
    );
  });

  it("reuses the same client payment operation id after an ambiguous customer debt payment failure", async () => {
    const customerWithDebt: Customer = {
      id: "customer-1",
      name: "Ibrahim",
      phone: "010",
      debtBalance: 50,
      debts: [{
        id: "debt-1",
        invoiceId: "invoice-1",
        description: "Invoice",
        date: "2026-05-17T10:00:00.000Z",
        amount: 50,
        paid: 0,
        remaining: 50,
      }],
    };
    customerApiMocks.listCustomers.mockResolvedValue({ items: [customerWithDebt], total: 1, page: 1, limit: 20 });
    debtApiMocks.payCustomerDebtAuto.mockRejectedValue(new TypeError("Failed to fetch"));
    offlineSyncMocks.isNetworkFailure.mockReturnValue(true);
    offlineSyncMocks.applyCustomerDebtPayment.mockReturnValue([
      { ...customerWithDebt, debtBalance: 25 },
    ]);

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([customerWithDebt]);
    });

    let result: Awaited<ReturnType<StoreSnapshot["payCustomerDebt"]>> | undefined;
    await act(async () => {
      result = await mounted.getStore().payCustomerDebt("customer-1", 25);
    });

    expect(result).toMatchObject({ ok: true });
    const [, , , paymentOptions] = debtApiMocks.payCustomerDebtAuto.mock.calls[0] as [
      string,
      number,
      string | undefined,
      { clientOperationId?: string },
    ];
    expect(paymentOptions.clientOperationId).toEqual(expect.stringMatching(/^pay-customer-debt-/));
    expect(offlineDbMocks.queueOfflineOperation).toHaveBeenCalledWith(
      "store:store-1",
      expect.objectContaining({
        type: "payCustomerDebt",
        clientOperationId: paymentOptions.clientOperationId,
        payload: expect.objectContaining({
          clientOperationId: paymentOptions.clientOperationId,
        }),
      }),
    );
  });

  it("reuses the same client payment operation id after an ambiguous individual debt payment failure", async () => {
    const customerWithDebt: Customer = {
      id: "customer-1",
      name: "Ibrahim",
      phone: "010",
      debtBalance: 50,
      debts: [{
        id: "debt-1",
        invoiceId: "invoice-1",
        description: "Invoice",
        date: "2026-05-17T10:00:00.000Z",
        amount: 50,
        paid: 0,
        remaining: 50,
      }],
    };
    customerApiMocks.listCustomers.mockResolvedValue({ items: [customerWithDebt], total: 1, page: 1, limit: 20 });
    debtApiMocks.payDebt.mockRejectedValue(new TypeError("Failed to fetch"));
    offlineSyncMocks.isNetworkFailure.mockReturnValue(true);
    offlineSyncMocks.applyDebtPayment.mockReturnValue([
      { ...customerWithDebt, debtBalance: 25 },
    ]);

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([customerWithDebt]);
    });

    let result: Awaited<ReturnType<StoreSnapshot["payDebt"]>> | undefined;
    await act(async () => {
      result = await mounted.getStore().payDebt("debt-1", 25);
    });

    expect(result).toMatchObject({ ok: true });
    const [, , , paymentOptions] = debtApiMocks.payDebt.mock.calls[0] as [
      string,
      number,
      string | undefined,
      { clientOperationId?: string },
    ];
    expect(paymentOptions.clientOperationId).toEqual(expect.stringMatching(/^pay-debt-/));
    expect(offlineDbMocks.queueOfflineOperation).toHaveBeenCalledWith(
      "store:store-1",
      expect.objectContaining({
        type: "payDebt",
        clientOperationId: paymentOptions.clientOperationId,
        payload: expect.objectContaining({
          clientOperationId: paymentOptions.clientOperationId,
        }),
      }),
    );
  });

  it("preserves existing debt metadata when an individual payment response only includes balances", async () => {
    const customerWithDebt: Customer = {
      id: "customer-1",
      name: "Ibrahim",
      phone: "010",
      debtBalance: 50,
      debts: [{
        id: "debt-1",
        invoiceId: "invoice-1",
        invoiceNumber: "INV-1",
        description: "Invoice",
        date: "2026-05-17T10:00:00.000Z",
        amount: 50,
        paid: 0,
        remaining: 50,
      }],
    };
    customerApiMocks.listCustomers.mockResolvedValue({ items: [customerWithDebt], total: 1, page: 1, limit: 20 });
    debtApiMocks.payDebt.mockResolvedValue({
      id: "debt-1",
      invoiceId: "",
      description: "",
      date: "",
      amount: 50,
      paid: 25,
      remaining: 25,
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([customerWithDebt]);
    });

    let result: Awaited<ReturnType<StoreSnapshot["payDebt"]>> | undefined;
    await act(async () => {
      result = await mounted.getStore().payDebt("debt-1", 25);
    });

    expect(result).toMatchObject({ ok: true });
    expect(mounted.getStore().customers[0].debts[0]).toMatchObject({
      id: "debt-1",
      invoiceId: "invoice-1",
      invoiceNumber: "INV-1",
      description: "Invoice",
      date: "2026-05-17T10:00:00.000Z",
      paid: 25,
      remaining: 25,
    });
  });
});
