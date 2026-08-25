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

  it("rejects a discount greater than the items subtotal before saving the sale", async () => {
    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().products).toEqual([existingProduct]);
    });

    let result: Awaited<ReturnType<StoreSnapshot["completeSale"]>> | undefined;
    await act(async () => {
      result = await mounted.getStore().completeSale({
        ...queuedSaleRequest,
        discount: 20.01,
      });
    });

    expect(result).toEqual({
      ok: false,
      message: "الخصم لا يمكن أن يتجاوز المجموع",
    });
    expect(invoiceApiMocks.createInvoice).not.toHaveBeenCalled();
  });

  it("adds a created product to local product state and total without refetching the list", async () => {
    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().productsLoading).toBe(false);
      expect(mounted.getStore().products).toEqual([existingProduct]);
      expect(mounted.getStore().productsTotal).toBe(1);
    });
    expect(productApiMocks.listProducts).toHaveBeenCalledTimes(2);

    let result: Awaited<ReturnType<StoreSnapshot["addProduct"]>> | undefined;
    await act(async () => {
      result = await mounted.getStore().addProduct(productInput);
    });

    expect(result).toMatchObject({ ok: true, id: createdProduct.id });
    expect(productApiMocks.listProducts).toHaveBeenCalledTimes(2);
    expect(mounted.getStore().products).toEqual([createdProduct, existingProduct]);
    expect(mounted.getStore().productsTotal).toBe(2);
    expect(mounted.getStore().productsLoading).toBe(false);
  });

  it("adds a newly created active product to the cashier product list", async () => {
    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().cashierProducts).toEqual([existingProduct]);
    });

    await act(async () => {
      await mounted.getStore().addProduct(productInput);
    });

    expect(mounted.getStore().cashierProducts).toEqual([createdProduct, existingProduct]);
  });

  it("loads every active product page for the cashier", async () => {
    const laterProduct = { ...existingProduct, id: "product-101", name: "Later product", barcode: "101" };

    productApiMocks.listProducts.mockImplementation(async ({ page, limit }: { page?: number; limit?: number }) => {
      if (limit === 100 && page === 1) {
        return { items: [existingProduct], total: 2, page: 1, limit: 100 };
      }

      if (limit === 100 && page === 2) {
        return { items: [laterProduct], total: 2, page: 2, limit: 100 };
      }

      return { items: [existingProduct], total: 1, page: 1, limit: 20 };
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().cashierProductsLoading).toBe(false);
      expect(mounted.getStore().cashierProducts).toEqual([existingProduct, laterProduct]);
      expect(mounted.getStore().cashierProductsError).toBeNull();
    });

    expect(productApiMocks.listProducts).toHaveBeenCalledWith({ isActive: true, page: 1, limit: 100 });
    expect(productApiMocks.listProducts).toHaveBeenCalledWith({ isActive: true, page: 2, limit: 100 });
    expect(offlineDbMocks.upsertCachedProducts).toHaveBeenCalledWith("store:store-1", [existingProduct, laterProduct]);
  });

  it("shows cached cashier products immediately while the online refresh is pending", async () => {
    const cachedProduct = {
      ...existingProduct,
      id: "cached-product",
      name: "Cached Rice",
      barcode: "cached-111",
    };
    let resolveCashierRefresh!: (result: {
      items: Product[];
      total: number;
      page: number;
      limit: number;
    }) => void;

    offlineDbMocks.listCachedProducts.mockImplementation(async (_storeKey: string, query: { limit?: number }) => (
      query.limit === Number.MAX_SAFE_INTEGER
        ? { items: [cachedProduct], total: 1, page: 1, limit: Number.MAX_SAFE_INTEGER }
        : { items: [], total: 0, page: 1, limit: query.limit ?? 20 }
    ));
    productApiMocks.listProducts.mockImplementation(async ({ page, limit }: { page?: number; limit?: number }) => {
      if (limit === 100) {
        return new Promise((resolve) => {
          resolveCashierRefresh = resolve;
        });
      }

      return { items: [existingProduct], total: 1, page: page ?? 1, limit: limit ?? 20 };
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().cashierProducts).toEqual([cachedProduct]);
      expect(mounted.getStore().cashierProductsLoading).toBe(true);
    });

    await act(async () => {
      resolveCashierRefresh({ items: [existingProduct], total: 1, page: 1, limit: 100 });
    });

    await waitFor(() => {
      expect(mounted.getStore().cashierProducts).toEqual([existingProduct]);
      expect(mounted.getStore().cashierProductsLoading).toBe(false);
    });
  });

  it("continues the online cashier refresh when the browser cache cannot be read", async () => {
    offlineDbMocks.listCachedProducts.mockRejectedValue(new Error("IndexedDB unavailable"));
    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().cashierProducts).toEqual([existingProduct]);
      expect(mounted.getStore().cashierProductsLoading).toBe(false);
      expect(mounted.getStore().cashierProductsError).toBeNull();
    });
  });

  it("keeps a remotely found barcode product in cashier state for the next scan", async () => {
    const remoteProduct = {
      ...existingProduct,
      id: "remote-product",
      name: "Remote Tea",
      barcode: "remote-333",
    };
    productApiMocks.getProductByBarcode.mockResolvedValue(remoteProduct);
    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().cashierProducts).toEqual([existingProduct]);
    });

    await act(async () => {
      await mounted.getStore().findProductByBarcodeRemote(remoteProduct.barcode);
    });

    expect(mounted.getStore().cashierProducts).toEqual([remoteProduct, existingProduct]);
  });

  it("does not lose a remotely found product when an older cashier refresh finishes", async () => {
    const remoteProduct = {
      ...existingProduct,
      id: "race-remote-product",
      name: "Race Remote Tea",
      barcode: "race-remote-333",
    };
    let resolveCashierRefresh!: (result: {
      items: Product[];
      total: number;
      page: number;
      limit: number;
    }) => void;
    productApiMocks.getProductByBarcode.mockResolvedValue(remoteProduct);
    productApiMocks.listProducts.mockImplementation(async ({ page, limit }: { page?: number; limit?: number }) => {
      if (limit === 100) {
        return new Promise((resolve) => {
          resolveCashierRefresh = resolve;
        });
      }

      return { items: [existingProduct], total: 1, page: page ?? 1, limit: limit ?? 20 };
    });
    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await act(async () => {
      await mounted.getStore().findProductByBarcodeRemote(remoteProduct.barcode);
    });
    expect(mounted.getStore().cashierProducts).toEqual([remoteProduct]);

    await act(async () => {
      resolveCashierRefresh({ items: [existingProduct], total: 1, page: 1, limit: 100 });
    });

    await waitFor(() => {
      expect(mounted.getStore().cashierProducts).toEqual([remoteProduct, existingProduct]);
    });
  });

  it("completes a sale for a product loaded after the management page", async () => {
    const laterProduct = { ...existingProduct, id: "product-101", name: "Later product", barcode: "101" };
    const laterItem = {
      productId: laterProduct.id,
      productName: laterProduct.name,
      barcode: laterProduct.barcode,
      price: laterProduct.price,
      wholesalePrice: laterProduct.wholesalePrice,
      quantity: 1,
      total: laterProduct.price,
    };
    const laterSale = { ...queuedSaleRequest, items: [laterItem] };

    productApiMocks.listProducts.mockImplementation(async ({ page, limit }: { page?: number; limit?: number }) => {
      if (limit === 100 && page === 1) {
        return { items: [existingProduct], total: 2, page: 1, limit: 100 };
      }

      if (limit === 100 && page === 2) {
        return { items: [laterProduct], total: 2, page: 2, limit: 100 };
      }

      return { items: [existingProduct], total: 1, page: 1, limit: 20 };
    });
    offlineSyncMocks.buildOfflineInvoice.mockReturnValue({ ...syncedInvoice, items: [laterItem] });
    offlineSyncMocks.applyOfflineSaleToProducts.mockReturnValue([{ ...laterProduct, stock: laterProduct.stock - 1 }]);

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().cashierProducts).toEqual([existingProduct, laterProduct]);
    });
    offlineSyncMocks.getBrowserOnlineState.mockReturnValue(false);

    let result: Awaited<ReturnType<StoreSnapshot["completeSale"]>> | undefined;
    await act(async () => {
      result = await mounted.getStore().completeSale(laterSale);
    });

    expect(result).toMatchObject({ ok: true });
    expect(offlineSyncMocks.applyOfflineSaleToProducts).toHaveBeenCalledWith(
      [existingProduct, laterProduct],
      [laterItem],
    );
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

  it("keeps customer-detail payment history when debt summaries omit payments", async () => {
    const payment = {
      id: "payment-1",
      amount: 20,
      date: "2026-08-25T10:00:00.000Z",
      notes: "customer payment",
    };
    const customerWithPayment: Customer = {
      id: "customer-1",
      name: "Ibrahim",
      phone: "010",
      debtBalance: 30,
      debts: [{
        id: "debt-1",
        invoiceId: "invoice-1",
        description: "Invoice",
        date: "2026-08-25T09:00:00.000Z",
        amount: 50,
        paid: 20,
        remaining: 30,
        payments: [payment],
      }],
    };
    customerApiMocks.listCustomers.mockResolvedValue({
      items: [{ ...customerWithPayment, debts: [] }],
      total: 1,
      page: 1,
      limit: 20,
    });
    customerApiMocks.getCustomerById.mockResolvedValue(customerWithPayment);
    debtApiMocks.getCustomerDebts.mockResolvedValue({
      totalDebt: 50,
      totalRemaining: 30,
      debts: [{
        ...customerWithPayment.debts[0],
        payments: undefined,
      }],
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);
    await waitFor(() => {
      expect(mounted.getStore().customers).toHaveLength(1);
    });

    await act(async () => {
      await mounted.getStore().loadCustomerDetail("customer-1");
    });

    expect(mounted.getStore().customers[0]?.debts[0]?.payments).toEqual([payment]);
  });

  it("refreshes customer payment history after recording a customer-level payment", async () => {
    const customerBeforePayment: Customer = {
      id: "customer-1",
      name: "Ibrahim",
      phone: "010",
      debtBalance: 50,
      debts: [{
        id: "debt-1",
        invoiceId: "invoice-1",
        description: "Invoice",
        date: "2026-08-25T09:00:00.000Z",
        amount: 50,
        paid: 0,
        remaining: 50,
        payments: [],
      }],
    };
    const payment = {
      id: "payment-1",
      amount: 20,
      date: "2026-08-25T10:00:00.000Z",
      notes: "customer payment",
    };
    customerApiMocks.listCustomers.mockResolvedValue({
      items: [customerBeforePayment],
      total: 1,
      page: 1,
      limit: 20,
    });
    customerApiMocks.getCustomerById.mockResolvedValue({
      ...customerBeforePayment,
      debtBalance: 30,
      debts: [{
        ...customerBeforePayment.debts[0],
        paid: 20,
        remaining: 30,
        payments: [payment],
      }],
    });
    offlineSyncMocks.applyCustomerDebtPayment.mockReturnValue([{
      ...customerBeforePayment,
      debtBalance: 30,
    }]);
    debtApiMocks.payCustomerDebtAuto.mockResolvedValue({
      totalDebt: 50,
      totalRemaining: 30,
      debts: [{
        ...customerBeforePayment.debts[0],
        paid: 20,
        remaining: 30,
        payments: undefined,
      }],
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);
    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([customerBeforePayment]);
    });

    await act(async () => {
      await mounted.getStore().payCustomerDebt("customer-1", 20, "customer payment");
    });

    expect(mounted.getStore().customers[0]?.debts[0]?.payments).toEqual([payment]);
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

  it("loads the final customer page first and reverses its newest-first rows", async () => {
    const newestCustomer: Customer = {
      id: "customer-newest",
      name: "Newest",
      phone: "011",
      debts: [],
      debtBalance: 0,
    };
    const middleCustomer: Customer = {
      id: "customer-middle",
      name: "Middle",
      phone: "012",
      debts: [],
      debtBalance: 0,
    };
    const oldestCustomer: Customer = {
      id: "customer-oldest",
      name: "Oldest",
      phone: "013",
      debts: [],
      debtBalance: 0,
    };
    customerApiMocks.listCustomers.mockImplementation(async ({ page }: { page?: number }) => {
      if (page === 2) {
        return { items: [middleCustomer, oldestCustomer], total: 22, page: 2, limit: 20 };
      }
      return { items: [newestCustomer], total: 22, page: 1, limit: 20 };
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([oldestCustomer, middleCustomer]);
    });
    expect(customerApiMocks.listCustomers).toHaveBeenCalledWith({ page: 2, limit: 20 });
  });

  it("uses the requested cached customer page without inferring server pagination", async () => {
    const newestCustomer: Customer = {
      id: "cached-newest",
      name: "Newest",
      phone: "011",
      debts: [],
      debtBalance: 0,
      creditBalance: 0,
      balance: 0,
    };
    offlineSyncMocks.shouldReadFromOfflineCache.mockReturnValue(true);
    offlineDbMocks.listCachedCustomers.mockResolvedValue({
      items: [newestCustomer],
      total: 22,
      page: 1,
      limit: 20,
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([newestCustomer]);
    });
    expect(offlineDbMocks.listCachedCustomers).toHaveBeenCalledWith("store:store-1", {
      search: "",
      page: 1,
      limit: 20,
    });
    expect(offlineDbMocks.listCachedCustomers).toHaveBeenCalledTimes(1);
  });

  it("does not prepend a newly created customer to the oldest-first first page", async () => {
    const newestCustomer: Customer = {
      id: "creation-newest",
      name: "Newest",
      phone: "011",
      debts: [],
      debtBalance: 0,
    };
    const middleCustomer: Customer = {
      id: "creation-middle",
      name: "Middle",
      phone: "012",
      debts: [],
      debtBalance: 0,
    };
    const oldestCustomer: Customer = {
      id: "creation-oldest",
      name: "Oldest",
      phone: "013",
      debts: [],
      debtBalance: 0,
    };
    customerApiMocks.createCustomer.mockResolvedValue(syncedCustomer);
    customerApiMocks.listCustomers.mockImplementation(async ({ page }: { page?: number }) => {
      if (page === 2) {
        return { items: [middleCustomer, oldestCustomer], total: 22, page: 2, limit: 20 };
      }
      return { items: [newestCustomer], total: 22, page: 1, limit: 20 };
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([oldestCustomer, middleCustomer]);
    });
    await act(async () => {
      await mounted.getStore().addCustomer(queuedCustomerInput);
    });

    expect(mounted.getStore().customers).toEqual([oldestCustomer, middleCustomer]);
    expect(mounted.getStore().customers).not.toContainEqual(syncedCustomer);
  });

  it("refreshes cached customer debts from the server while reads come from the offline cache", async () => {
    const cachedCustomer: Customer = {
      id: "customer-1",
      name: "Ibrahim",
      phone: "010",
      debts: [],
      debtBalance: 0,
    };
    const serverDebt = {
      id: "debt-1",
      invoiceId: "invoice-1",
      description: "فاتورة INV-1",
      date: "2026-08-21T10:00:00.000Z",
      amount: 100,
      paid: 0,
      remaining: 100,
    };
    offlineSyncMocks.shouldReadFromOfflineCache.mockReturnValue(true);
    offlineDbMocks.listCachedCustomers.mockResolvedValue({
      items: [cachedCustomer],
      total: 1,
      page: 1,
      limit: 20,
    });
    debtApiMocks.getCustomerDebts.mockResolvedValue({
      debts: [serverDebt],
      totalDebt: 100,
      totalRemaining: 100,
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([
        {
          ...cachedCustomer,
          debts: [serverDebt],
          debtBalance: 100,
          creditBalance: 0,
          balance: -100,
        },
      ]);
    });
    expect(customerApiMocks.listCustomers).not.toHaveBeenCalled();
    expect(offlineDbMocks.cacheCustomerDebts).toHaveBeenCalledWith(
      "store:store-1",
      "customer-1",
      [serverDebt],
      100,
      0,
    );
  });

  it("keeps an unsynced local debt when refreshing cached customer debts", async () => {
    const unsyncedDebt = {
      id: "offline-debt-offline-invoice-1",
      invoiceId: "offline-invoice-1",
      description: "فاتورة محلية",
      date: "2026-08-21T09:00:00.000Z",
      amount: 50,
      paid: 0,
      remaining: 50,
      isPaid: false,
    };
    const cachedCustomer: Customer = {
      id: "customer-1",
      name: "Ibrahim",
      phone: "010",
      debts: [unsyncedDebt],
      debtBalance: 50,
    };
    const serverDebt = {
      id: "debt-1",
      invoiceId: "invoice-1",
      description: "فاتورة INV-1",
      date: "2026-08-21T10:00:00.000Z",
      amount: 100,
      paid: 0,
      remaining: 100,
    };
    offlineSyncMocks.shouldReadFromOfflineCache.mockReturnValue(true);
    offlineDbMocks.listCachedCustomers.mockResolvedValue({
      items: [cachedCustomer],
      total: 1,
      page: 1,
      limit: 20,
    });
    debtApiMocks.getCustomerDebts.mockResolvedValue({
      debts: [serverDebt],
      totalDebt: 100,
      totalRemaining: 100,
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([
        {
          ...cachedCustomer,
          debts: [unsyncedDebt, serverDebt],
          debtBalance: 150,
          creditBalance: 0,
          balance: -150,
        },
      ]);
    });
  });

  it("keeps the cached debt balance when the debt response has a total without details", async () => {
    const cachedCustomer: Customer = {
      id: "customer-1",
      name: "Ibrahim",
      phone: "010",
      debts: [],
      debtBalance: 70,
    };
    offlineSyncMocks.shouldReadFromOfflineCache.mockReturnValue(true);
    offlineDbMocks.listCachedCustomers.mockResolvedValue({
      items: [cachedCustomer],
      total: 1,
      page: 1,
      limit: 20,
    });
    debtApiMocks.getCustomerDebts.mockResolvedValue({
      debts: [],
      totalDebt: 70,
      totalRemaining: 70,
    });

    const mounted = await renderStore();
    mountedRoots.push(mounted);

    await waitFor(() => {
      expect(mounted.getStore().customers).toEqual([cachedCustomer]);
    });
    expect(offlineDbMocks.cacheCustomerDebts).not.toHaveBeenCalled();
  });
});
