import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createInvoice as apiCreateInvoice,
  deleteInvoice as apiDeleteInvoice,
  getInvoiceById,
  listInvoices,
  updateInvoice as apiUpdateInvoice,
  type InvoicesListResult,
  type ListInvoicesParams,
} from "../services/invoicesApi";
import {
  createProduct as apiCreateProduct,
  deleteProduct as apiDeleteProduct,
  getProductByBarcode,
  getLowStockProducts,
  listProducts,
  updateProduct as apiUpdateProduct,
  type ListProductsParams,
  type ProductsListResult,
} from "../services/productsApi";
import {
  createCustomer as apiCreateCustomer,
  deleteCustomer as apiDeleteCustomer,
  getCustomerById,
  listCustomers,
  updateCustomer as apiUpdateCustomer,
  type CustomersListResult,
  type ListCustomersParams,
} from "../services/customersApi";
import { toUserFacingMessage } from "../services/apiClient";
import {
  getCustomerDebts,
  getDebtById,
  payCustomerDebtAuto,
  payDebt as apiPayDebt,
} from "../services/debtsApi";
import {
  cacheCustomerDebts,
  deleteCachedCustomer,
  deleteCachedInvoice,
  deleteOfflineOperation,
  getCachedCustomer,
  getCachedDebt,
  getCachedInvoice,
  getCachedProductByBarcode,
  hasOfflineOperations,
  listCachedCustomerDebts,
  listCachedCustomers,
  listCachedInvoices,
  listCachedProducts,
  listOfflineOperations,
  markOfflineOperationInFlight,
  queueCachedOfflineCustomerCreation,
  queueOfflineOperation,
  recoverInFlightOfflineOperations,
  replaceOfflineCustomerIdInQueuedOperations,
  upsertCachedCustomers,
  upsertCachedDebts,
  upsertCachedInvoices,
  upsertCachedProducts,
} from "../services/offlineDb";
import {
  applyCustomerDebtPayment,
  applyDebtPayment,
  buildOfflineCustomer,
  applyOfflineSaleToProducts,
  buildOfflineInvoice,
  drainOfflineQueue,
  getBrowserOnlineState,
  isNetworkFailure,
  resolveOfflineCustomerReference,
  shouldReadFromOfflineCache,
} from "../services/offlineSync";
import {
  calculateCustomerDebt,
  calculateInvoiceTotal,
  calculateInvoiceItemTotal,
  calculateItemsTotal,
  getCustomerDebtTotal,
  validateInvoiceDiscount,
  validateDebtPaymentAmount,
} from "../utils/calculations";
import { addMoney, compareMoney, maxMoney, minMoney, subtractMoney, sumMoney } from "../utils/money";
import type {
  ActionResult,
  AuthSession,
  Customer,
  CustomerInput,
  Debt,
  DebtSummary,
  Invoice,
  InvoiceItem,
  InvoiceUpdateRequest,
  PaymentMethod,
  Product,
  ProductInput,
  SaleRequest,
} from "../types";
import { useAuthStore } from "./AuthStore";

export type ProductsQuery = {
  search: string;
  isActive: boolean | undefined;
  page: number;
  limit: number;
};

export type CustomersQuery = {
  search: string;
  page: number;
  limit: number;
};

export type InvoicesQuery = {
  search: string;
  page: number;
  limit: number;
};

export type CashierDraft = {
  items: InvoiceItem[];
  paymentMethod: PaymentMethod;
  selectedCustomerId: string;
  customerSearch: string;
  paidAmount: string;
  discount: string;
};

type AppStoreValue = {
  isOffline: boolean;
  cashierDraft: CashierDraft;
  setCashierDraft: (value: CashierDraft | ((current: CashierDraft) => CashierDraft)) => void;
  resetCashierDraft: () => void;
  products: Product[];
  productsLoading: boolean;
  productsError: string | null;
  productsQuery: ProductsQuery;
  productsTotal: number;
  lowStockCount: number;
  customers: Customer[];
  customersLoading: boolean;
  customersError: string | null;
  customersQuery: CustomersQuery;
  customersTotal: number;
  invoices: Invoice[];
  invoicesLoading: boolean;
  invoicesError: string | null;
  invoicesQuery: InvoicesQuery;
  invoicesTotal: number;
  setProductsQuery: (partial: Partial<ProductsQuery>) => void;
  refreshProducts: () => Promise<void>;
  refreshLowStock: () => Promise<void>;
  addProduct: (input: ProductInput) => Promise<ActionResult>;
  updateProduct: (id: string, input: ProductInput) => Promise<ActionResult>;
  deleteProduct: (id: string) => Promise<void>;
  findProductByBarcodeRemote: (barcode: string) => Promise<Product | null>;
  setCustomersQuery: (partial: Partial<CustomersQuery>) => void;
  refreshCustomers: () => Promise<void>;
  loadCustomerDetail: (id: string) => Promise<void>;
  addCustomer: (input: CustomerInput) => Promise<ActionResult>;
  updateCustomer: (id: string, input: CustomerInput) => Promise<ActionResult>;
  deleteCustomer: (id: string) => Promise<ActionResult>;
  payCustomerDebt: (customerId: string, amount: number, notes?: string) => Promise<ActionResult>;
  payDebt: (debtId: string, amount: number, notes?: string) => Promise<ActionResult>;
  loadDebtDetail: (debtId: string) => Promise<Debt | null>;
  setInvoicesQuery: (partial: Partial<InvoicesQuery>) => void;
  refreshInvoices: () => Promise<void>;
  loadInvoiceDetail: (id: string) => Promise<Invoice | null>;
  completeSale: (request: SaleRequest) => Promise<ActionResult>;
  updateInvoice: (id: string, request: InvoiceUpdateRequest) => Promise<ActionResult>;
  deleteInvoice: (id: string) => Promise<ActionResult>;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

const DEFAULT_PRODUCTS_QUERY: ProductsQuery = {
  search: "",
  isActive: true,
  page: 1,
  limit: 20,
};

const DEFAULT_CUSTOMERS_QUERY: CustomersQuery = {
  search: "",
  page: 1,
  limit: 20,
};

const DEFAULT_INVOICES_QUERY: InvoicesQuery = {
  search: "",
  page: 1,
  limit: 20,
};

export const createEmptyCashierDraft = (): CashierDraft => ({
  items: [],
  paymentMethod: "cash",
  selectedCustomerId: "",
  customerSearch: "",
  paidAmount: "",
  discount: "",
});

const OFFLINE_WRITE_MESSAGE = "تم حفظ العملية بدون إنترنت وسيتم إرسالها تلقائياً عند عودة الاتصال";

const getSessionStoreCacheKey = (session: AuthSession | null): string | null => {
  if (!session?.token || session.user.role === "SUPER_ADMIN") return null;

  if (session.user.storeId) return `store:${session.user.storeId}`;
  if (session.user.subdomain) return `subdomain:${session.user.subdomain}`;
  if (session.user.id) return `user:${session.user.id}`;
  if (session.user.username) return `username:${session.user.username}`;

  return null;
};

const toDebtSummary = (debts: Debt[]): DebtSummary => ({
  totalDebt: sumMoney(debts.map((debt) => debt.amount)),
  totalRemaining: sumMoney(debts.map((debt) => debt.remaining)),
  debts,
});

const mergeDebtMetadata = (debt: Debt, fallback?: Debt): Debt => {
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

const createOfflineDebtFromInvoice = (invoice: Invoice): Debt => ({
  id: `offline-debt-${invoice.id}`,
  invoiceId: invoice.id,
  description: `فاتورة ${invoice.number}`,
  date: invoice.date,
  amount: invoice.remaining,
  paid: 0,
  remaining: invoice.remaining,
  isPaid: false,
});

const isOfflineCustomerId = (id?: string): boolean => id?.startsWith("offline-customer-") ?? false;

const productMatchesQuery = (product: Product, query: ProductsQuery): boolean => {
  const search = query.search.trim().toLowerCase();
  const matchesActiveState = query.isActive === undefined || product.isActive === query.isActive;
  const matchesSearch =
    !search ||
    product.name.toLowerCase().includes(search) ||
    product.barcode.toLowerCase().includes(search);

  return matchesActiveState && matchesSearch;
};

const getSessionOwnerKey = (session: AuthSession | null): string | undefined => {
  if (!session?.token) return undefined;

  if (session.user.id) return `user:${session.user.id}`;
  if (session.user.username) return `username:${session.user.username}`;
  if (session.user.email) return `email:${session.user.email}`;
  return session.user.storeId ? `store:${session.user.storeId}` : undefined;
};

const createClientOperationId = (prefix: string): string => {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now()}-${randomId}`;
};

const findCachedOfflineCustomerId = async (storeCacheKey: string, input: CustomerInput): Promise<string | undefined> => {
  const cached = await listCachedCustomers(storeCacheKey, { page: 1, limit: Number.MAX_SAFE_INTEGER });
  const name = input.name.trim();
  const phone = input.phone.trim();

  return cached.items.find((customer) =>
    isOfflineCustomerId(customer.id) &&
    customer.name === name &&
    customer.phone === phone
  )?.id;
};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthStore();
  const storeCacheKey = useMemo(() => getSessionStoreCacheKey(session), [session]);
  const queueOwnerKey = useMemo(() => getSessionOwnerKey(session), [session]);
  const isStoreSession = storeCacheKey !== null;
  const [isOffline, setIsOffline] = useState(() => !getBrowserOnlineState());
  const isOfflineRef = useRef(isOffline);
  const syncingOfflineQueueRef = useRef(false);
  const [cashierDraft, setCashierDraft] = useState<CashierDraft>(() => createEmptyCashierDraft());

  isOfflineRef.current = isOffline;

  const resetCashierDraft = useCallback(() => {
    setCashierDraft(createEmptyCashierDraft());
  }, []);

  // ── Products ────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productsQuery, setProductsQueryState] = useState<ProductsQuery>(DEFAULT_PRODUCTS_QUERY);
  const [productsTotal, setProductsTotal] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  // ── Customers ────────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customersQuery, setCustomersQueryState] = useState<CustomersQuery>(DEFAULT_CUSTOMERS_QUERY);
  const [customersTotal, setCustomersTotal] = useState(0);

  // ── Invoices ─────────────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [invoicesQuery, setInvoicesQueryState] = useState<InvoicesQuery>(DEFAULT_INVOICES_QUERY);
  const [invoicesTotal, setInvoicesTotal] = useState(0);

  useEffect(() => {
    setProducts([]);
    setProductsLoading(false);
    setProductsError(null);
    setProductsTotal(0);
    setLowStockCount(0);
    setCustomers([]);
    setCustomersLoading(false);
    setCustomersError(null);
    setCustomersTotal(0);
    setInvoices([]);
    setInvoicesLoading(false);
    setInvoicesError(null);
    setInvoicesTotal(0);
    resetCashierDraft();
  }, [storeCacheKey, resetCashierDraft]);

  // ── Products fetch ───────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async (query: ProductsQuery) => {
    if (!storeCacheKey) {
      setProducts([]);
      setProductsTotal(0);
      return;
    }

    setProductsLoading(true);
    setProductsError(null);
    try {
      const isOnline = getBrowserOnlineState();
      const hasPendingOfflineWrites = await hasOfflineOperations(storeCacheKey);
      if (shouldReadFromOfflineCache(isOnline, hasPendingOfflineWrites)) {
        if (!isOnline) setIsOffline(true);
        const cached = await listCachedProducts(storeCacheKey, query);
        setProducts(cached.items);
        setProductsTotal(cached.total);
        return;
      }

      const params: ListProductsParams = {
        page: query.page,
        limit: query.limit,
      };
      if (query.search.trim()) params.search = query.search.trim();
      if (query.isActive !== undefined) params.isActive = query.isActive;
      const result: ProductsListResult = await listProducts(params);
      await upsertCachedProducts(storeCacheKey, result.items);
      setProducts(result.items);
      setProductsTotal(result.total);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        const cached = await listCachedProducts(storeCacheKey, query);
        setProducts(cached.items);
        setProductsTotal(cached.total);
        setProductsError(null);
      } else {
        const msg = toUserFacingMessage(err, "تعذر تحميل المنتجات.");
        setProductsError(msg);
      }
    } finally {
      setProductsLoading(false);
    }
  }, [storeCacheKey]);

  const fetchLowStock = useCallback(async () => {
    if (!storeCacheKey) {
      setLowStockCount(0);
      return;
    }

    try {
      const isOnline = getBrowserOnlineState();
      const hasPendingOfflineWrites = await hasOfflineOperations(storeCacheKey);
      if (shouldReadFromOfflineCache(isOnline, hasPendingOfflineWrites)) {
        const cached = await listCachedProducts(storeCacheKey, { isActive: true, page: 1, limit: Number.MAX_SAFE_INTEGER });
        setLowStockCount(cached.items.filter((product) => product.stock <= product.minStock).length);
        return;
      }

      const items = await getLowStockProducts();
      await upsertCachedProducts(storeCacheKey, items);
      setLowStockCount(items.length);
    } catch {
      try {
        const cached = await listCachedProducts(storeCacheKey, { isActive: true, page: 1, limit: Number.MAX_SAFE_INTEGER });
        setLowStockCount(cached.items.filter((product) => product.stock <= product.minStock).length);
      } catch {
        // non-critical, silent fail
      }
    }
  }, [storeCacheKey]);

  const productsQueryRef = useRef(productsQuery);
  productsQueryRef.current = productsQuery;

  useEffect(() => {
    if (!isStoreSession) return;
    void fetchProducts(productsQuery);
  }, [isStoreSession, productsQuery, fetchProducts]);

  useEffect(() => {
    if (!isStoreSession) return;
    void fetchLowStock();
  }, [isStoreSession, fetchLowStock]);

  // ── Customers fetch ──────────────────────────────────────────────────────────
  const hydrateCustomerDebtSummaries = useCallback(async (items: Customer[]): Promise<Customer[]> => {
    if (!storeCacheKey) return items;

    const missingSummaries = items.filter(
      (customer) => customer.debtBalance === undefined && customer.debts.length === 0,
    );
    if (missingSummaries.length === 0) return items;

    const settled = await Promise.allSettled(
      missingSummaries.map(async (customer) => {
        try {
          const summary = await getCustomerDebts(customer.id);
          await cacheCustomerDebts(storeCacheKey, customer.id, summary.debts, summary.totalRemaining);
          return { customerId: customer.id, summary };
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
          setIsOffline(true);
          const debts = await listCachedCustomerDebts(storeCacheKey, customer.id);
          return { customerId: customer.id, summary: toDebtSummary(debts) };
        }
      }),
    );
    const summariesByCustomerId = new Map<string, DebtSummary>();
    settled.forEach((result) => {
      if (result.status === "fulfilled") {
        summariesByCustomerId.set(result.value.customerId, result.value.summary);
      }
    });

    if (summariesByCustomerId.size === 0) return items;

    return items.map((customer) => {
      const summary = summariesByCustomerId.get(customer.id);
      return summary ? { ...customer, debts: summary.debts, debtBalance: summary.totalRemaining } : customer;
    });
  }, [storeCacheKey]);

  const fetchCustomers = useCallback(async (query: CustomersQuery) => {
    if (!storeCacheKey) {
      setCustomers([]);
      setCustomersTotal(0);
      return;
    }

    setCustomersLoading(true);
    setCustomersError(null);
    try {
      const isOnline = getBrowserOnlineState();
      const hasPendingOfflineWrites = await hasOfflineOperations(storeCacheKey);
      if (shouldReadFromOfflineCache(isOnline, hasPendingOfflineWrites)) {
        if (!isOnline) setIsOffline(true);
        const cached = await listCachedCustomers(storeCacheKey, query);
        setCustomers(cached.items);
        setCustomersTotal(cached.total);
        return;
      }

      const params: ListCustomersParams = {
        page: query.page,
        limit: query.limit,
      };
      if (query.search.trim()) params.search = query.search.trim();
      const result: CustomersListResult = await listCustomers(params);
      const items = await hydrateCustomerDebtSummaries(result.items);
      await upsertCachedCustomers(storeCacheKey, items);
      setCustomers(items);
      setCustomersTotal(result.total);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        const cached = await listCachedCustomers(storeCacheKey, query);
        setCustomers(cached.items);
        setCustomersTotal(cached.total);
        setCustomersError(null);
      } else {
        const msg = toUserFacingMessage(err, "تعذر تحميل العملاء.");
        setCustomersError(msg);
      }
    } finally {
      setCustomersLoading(false);
    }
  }, [hydrateCustomerDebtSummaries, storeCacheKey]);

  const customersQueryRef = useRef(customersQuery);
  customersQueryRef.current = customersQuery;

  useEffect(() => {
    if (!isStoreSession) return;
    void fetchCustomers(customersQuery);
  }, [isStoreSession, customersQuery, fetchCustomers]);

  // ── Invoices fetch ───────────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async (query: InvoicesQuery) => {
    if (!storeCacheKey) {
      setInvoices([]);
      setInvoicesTotal(0);
      return;
    }

    setInvoicesLoading(true);
    setInvoicesError(null);
    try {
      const isOnline = getBrowserOnlineState();
      const hasPendingOfflineWrites = await hasOfflineOperations(storeCacheKey);
      if (shouldReadFromOfflineCache(isOnline, hasPendingOfflineWrites)) {
        if (!isOnline) setIsOffline(true);
        const cached = await listCachedInvoices(storeCacheKey, query);
        setInvoices(cached.items);
        setInvoicesTotal(cached.total);
        return;
      }

      const params: ListInvoicesParams = {
        page: query.page,
        limit: query.limit,
      };
      if (query.search.trim()) params.search = query.search.trim();
      const result: InvoicesListResult = await listInvoices(params);
      await upsertCachedInvoices(storeCacheKey, result.items);
      setInvoices(result.items);
      setInvoicesTotal(result.total);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        const cached = await listCachedInvoices(storeCacheKey, query);
        setInvoices(cached.items);
        setInvoicesTotal(cached.total);
        setInvoicesError(null);
      } else {
        const msg = toUserFacingMessage(err, "تعذر تحميل الفواتير.");
        setInvoicesError(msg);
      }
    } finally {
      setInvoicesLoading(false);
    }
  }, [storeCacheKey]);

  const invoicesQueryRef = useRef(invoicesQuery);
  invoicesQueryRef.current = invoicesQuery;

  useEffect(() => {
    if (!isStoreSession) return;
    void fetchInvoices(invoicesQuery);
  }, [isStoreSession, invoicesQuery, fetchInvoices]);

  // ── Refresh helpers ──────────────────────────────────────────────────────────
  const refreshProducts = useCallback(async () => {
    await fetchProducts(productsQueryRef.current);
  }, [fetchProducts]);

  const refreshLowStock = useCallback(async () => {
    await fetchLowStock();
  }, [fetchLowStock]);

  const refreshCustomers = useCallback(async () => {
    await fetchCustomers(customersQueryRef.current);
  }, [fetchCustomers]);

  const refreshInvoices = useCallback(async () => {
    await fetchInvoices(invoicesQueryRef.current);
  }, [fetchInvoices]);

  // ── Query setters ────────────────────────────────────────────────────────────
  const setProductsQuery = useCallback((partial: Partial<ProductsQuery>) => {
    setProductsQueryState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setCustomersQuery = useCallback((partial: Partial<CustomersQuery>) => {
    setCustomersQueryState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setInvoicesQuery = useCallback((partial: Partial<InvoicesQuery>) => {
    setInvoicesQueryState((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Product actions ──────────────────────────────────────────────────────────
  const mergeProductIntoCurrentPage = useCallback((savedProduct: Product) => {
    setProducts((current) => {
      const exists = current.some((p) => p.id === savedProduct.id);
      if (exists) return current.map((p) => (p.id === savedProduct.id ? savedProduct : p));
      return [savedProduct, ...current].slice(0, productsQueryRef.current.limit);
    });
  }, []);

  const addCreatedProductToCurrentQuery = useCallback((savedProduct: Product) => {
    const query = productsQueryRef.current;

    if (!productMatchesQuery(savedProduct, query)) {
      return;
    }

    setProductsTotal((current) => current + 1);
    setProducts((current) => {
      const exists = current.some((p) => p.id === savedProduct.id);
      if (exists) return current.map((p) => (p.id === savedProduct.id ? savedProduct : p));
      return [savedProduct, ...current].slice(0, query.limit);
    });
  }, []);

  const addProduct = useCallback(
    async (input: ProductInput): Promise<ActionResult> => {
      if (!storeCacheKey) return { ok: false, message: "جلسة المتجر غير متاحة" };

      try {
        const saved = await apiCreateProduct(input);
        await upsertCachedProducts(storeCacheKey, [saved]);
        addCreatedProductToCurrentQuery(saved);
        void fetchLowStock();
        return { ok: true, message: "تمت إضافة المنتج بنجاح", id: saved.id };
      } catch (err) {
        return { ok: false, message: toUserFacingMessage(err, "تعذر إضافة المنتج.") };
      }
    },
    [addCreatedProductToCurrentQuery, fetchLowStock, storeCacheKey],
  );

  const updateProduct = useCallback(
    async (id: string, input: ProductInput): Promise<ActionResult> => {
      if (!storeCacheKey) return { ok: false, message: "جلسة المتجر غير متاحة" };

      try {
        const saved = await apiUpdateProduct(id, input);
        await upsertCachedProducts(storeCacheKey, [saved]);
        await fetchProducts(productsQueryRef.current);
        mergeProductIntoCurrentPage(saved);
        void fetchLowStock();
        return { ok: true, message: "تم تعديل المنتج بنجاح" };
      } catch (err) {
        return { ok: false, message: toUserFacingMessage(err, "تعذر تعديل المنتج.") };
      }
    },
    [fetchProducts, fetchLowStock, mergeProductIntoCurrentPage, storeCacheKey],
  );

  const deleteProduct = useCallback(
    async (id: string): Promise<void> => {
      await apiDeleteProduct(id);
      await fetchProducts(productsQueryRef.current);
      void fetchLowStock();
    },
    [fetchProducts, fetchLowStock],
  );

  const findProductByBarcodeRemote = useCallback(async (barcode: string): Promise<Product | null> => {
    if (!storeCacheKey) return null;

    try {
      const product = await getProductByBarcode(barcode);
      await upsertCachedProducts(storeCacheKey, [product]);
      return product;
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        return getCachedProductByBarcode(storeCacheKey, barcode);
      }
      return null;
    }
  }, [storeCacheKey]);

  // ── Customer detail loader ───────────────────────────────────────────────────
  const loadCustomerDetail = useCallback(async (id: string): Promise<void> => {
    if (!storeCacheKey) return;

    let rich: Customer | null = null;
    let debtSummary: DebtSummary | null = null;

    try {
      rich = await getCustomerById(id);
      await upsertCachedCustomers(storeCacheKey, [rich]);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        rich = await getCachedCustomer(storeCacheKey, id);
      }
    }

    try {
      debtSummary = await getCustomerDebts(id);
      await cacheCustomerDebts(storeCacheKey, id, debtSummary.debts, debtSummary.totalRemaining);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        debtSummary = toDebtSummary(await listCachedCustomerDebts(storeCacheKey, id));
      }
    }

    if (!rich && !debtSummary) return;

    setCustomers((current) => {
      const exists = current.some((c) => c.id === id);
      if (!exists) return current;
      return current.map((c) => {
        if (c.id !== id) return c;
        const base = rich ?? c;
        const debts = debtSummary ? debtSummary.debts : base.debts;
        const debtBalance =
          debtSummary?.totalRemaining ??
          (debts.length > 0 ? calculateCustomerDebt(debts) : (base.debtBalance ?? c.debtBalance));
        return { ...base, debts, debtBalance };
      });
    });
  }, [storeCacheKey]);

  // ── Merge a saved customer into the current page list ────────────────────────
  const mergeCustomerIntoCurrentPage = useCallback((saved: Customer) => {
    setCustomers((current) => {
      const exists = current.some((c) => c.id === saved.id);
      if (exists) {
        return current.map((c) =>
          c.id === saved.id
            ? {
                ...c,
                ...saved,
                debts: saved.debts.length > 0 ? saved.debts : c.debts,
                debtBalance: saved.debtBalance ?? c.debtBalance,
              }
            : c,
        );
      }
      return [saved, ...current].slice(0, customersQueryRef.current.limit);
    });
  }, []);

  // ── Customer CRUD ────────────────────────────────────────────────────────────
  const addCustomer = useCallback(
    async (input: CustomerInput): Promise<ActionResult> => {
      if (!input.name.trim()) return { ok: false, message: "اسم العميل مطلوب" };

      if (!storeCacheKey) return { ok: false, message: "جلسة المتجر غير متاحة" };

      const persistOfflineCustomer = async (): Promise<ActionResult> => {
        const draft = buildOfflineCustomer(input);
        const { customer: saved, created } = await queueCachedOfflineCustomerCreation(
          storeCacheKey,
          input,
          draft,
          queueOwnerKey,
        );
        mergeCustomerIntoCurrentPage(saved);
        if (created) setCustomersTotal((current) => current + 1);
        return { ok: true, message: OFFLINE_WRITE_MESSAGE, id: saved.id };
      };

      if (isOfflineRef.current || !getBrowserOnlineState()) {
        setIsOffline(true);
        return persistOfflineCustomer();
      }

      try {
        const saved = await apiCreateCustomer(input);
        await upsertCachedCustomers(storeCacheKey, [saved]);
        await fetchCustomers(customersQueryRef.current);
        mergeCustomerIntoCurrentPage(saved);
        return { ok: true, message: "تمت إضافة العميل بنجاح", id: saved.id };
      } catch (err) {
        if (isNetworkFailure(err)) {
          setIsOffline(true);
          return persistOfflineCustomer();
        }
        return { ok: false, message: toUserFacingMessage(err, "تعذر إضافة العميل.") };
      }
    },
    [fetchCustomers, mergeCustomerIntoCurrentPage, queueOwnerKey, storeCacheKey],
  );

  const updateCustomer = useCallback(
    async (id: string, input: CustomerInput): Promise<ActionResult> => {
      if (!input.name.trim()) return { ok: false, message: "اسم العميل مطلوب" };
      if (!storeCacheKey) return { ok: false, message: "جلسة المتجر غير متاحة" };
      try {
        const saved = await apiUpdateCustomer(id, input);
        await upsertCachedCustomers(storeCacheKey, [saved]);
        setCustomers((current) =>
          current.map((c) =>
            c.id === id
              ? {
                  ...c,
                  ...saved,
                  debts: saved.debts.length > 0 ? saved.debts : c.debts,
                  debtBalance: saved.debtBalance ?? c.debtBalance,
                }
              : c,
          ),
        );
        return { ok: true, message: "تم تعديل العميل بنجاح" };
      } catch (err) {
        return { ok: false, message: toUserFacingMessage(err, "تعذر تعديل العميل.") };
      }
    },
    [storeCacheKey],
  );

  const deleteCustomer = useCallback(
    async (id: string): Promise<ActionResult> => {
      try {
        await apiDeleteCustomer(id);
        await fetchCustomers(customersQueryRef.current);
        return { ok: true, message: "تم حذف العميل بنجاح" };
      } catch (err) {
        return { ok: false, message: toUserFacingMessage(err, "تعذر حذف العميل.") };
      }
    },
    [fetchCustomers],
  );

  const payCustomerDebt = useCallback(
    async (customerId: string, amount: number, notes?: string): Promise<ActionResult> => {
      if (!storeCacheKey) return { ok: false, message: "جلسة المتجر غير متاحة" };

      const customer = customers.find((c) => c.id === customerId);
      if (!customer) return { ok: false, message: "العميل غير موجود" };
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "أدخل مبلغ تسديد صحيح" };
      const totalDebt = getCustomerDebtTotal(customer);
      if (compareMoney(amount, totalDebt) === 1) return { ok: false, message: "مبلغ التسديد أكبر من إجمالي الدين" };

      const optimisticCustomers = applyCustomerDebtPayment(customers, customerId, amount);
      const clientOperationId = createClientOperationId("pay-customer-debt");

      if (isOfflineRef.current || !getBrowserOnlineState()) {
        await queueOfflineOperation(storeCacheKey, {
          type: "payCustomerDebt",
          payload: { customerId, amount, notes, clientOperationId },
          clientOperationId,
          ownerSessionKey: queueOwnerKey,
        });
        setCustomers(optimisticCustomers);
        await upsertCachedCustomers(storeCacheKey, optimisticCustomers);
        return { ok: true, message: OFFLINE_WRITE_MESSAGE };
      }

      setCustomers(optimisticCustomers);

      try {
        const summary = await payCustomerDebtAuto(customerId, amount, notes, { clientOperationId });
        const debts = summary.debts.map((debt) =>
          mergeDebtMetadata(debt, customer.debts.find((item) => item.id === debt.id)),
        );
        const totalRemaining = debts.length > 0 ? calculateCustomerDebt(debts) : summary.totalRemaining;
        await cacheCustomerDebts(storeCacheKey, customerId, debts, totalRemaining);
        setCustomers((current) =>
          current.map((c) =>
            c.id === customerId ? { ...c, debts, debtBalance: totalRemaining } : c,
          ),
        );
        return { ok: true, message: "تم تسجيل التسديد بنجاح" };
      } catch (err) {
        if (isNetworkFailure(err)) {
          setIsOffline(true);
          await queueOfflineOperation(storeCacheKey, {
            type: "payCustomerDebt",
            payload: { customerId, amount, notes, clientOperationId },
            clientOperationId,
            ownerSessionKey: queueOwnerKey,
          });
          await upsertCachedCustomers(storeCacheKey, optimisticCustomers);
          return { ok: true, message: OFFLINE_WRITE_MESSAGE };
        }

        // Rollback optimistic update by reloading fresh debt data
        getCustomerDebts(customerId)
          .then((summary) => {
            void cacheCustomerDebts(storeCacheKey, customerId, summary.debts, summary.totalRemaining);
            setCustomers((current) =>
              current.map((c) =>
                c.id === customerId ? { ...c, debts: summary.debts, debtBalance: summary.totalRemaining } : c,
              ),
            );
          })
          .catch(() => undefined);
        return { ok: false, message: toUserFacingMessage(err, "تعذر تسجيل التسديد.") };
      }
    },
    [customers, queueOwnerKey, storeCacheKey],
  );

  const payDebt = useCallback(
    async (debtId: string, amount: number, notes?: string): Promise<ActionResult> => {
      if (!storeCacheKey) return { ok: false, message: "جلسة المتجر غير متاحة" };

      const customerWithDebt = customers.find((customer) => customer.debts.some((debt) => debt.id === debtId));
      const targetDebt = customerWithDebt?.debts.find((debt) => debt.id === debtId);
      const validationError = validateDebtPaymentAmount(targetDebt, amount);

      if (validationError === "missing-debt") {
        return { ok: false, message: "الدين غير موجود في البيانات المحفوظة" };
      }

      if (validationError === "invalid-amount") {
        return { ok: false, message: "أدخل مبلغ صحيح" };
      }

      if (validationError === "amount-exceeds-remaining") {
        return { ok: false, message: "مبلغ الدفعة أكبر من المتبقي على الدين" };
      }

      const optimisticCustomers = applyDebtPayment(customers, debtId, amount);
      const clientOperationId = createClientOperationId("pay-debt");

      if (isOfflineRef.current || !getBrowserOnlineState()) {
        await queueOfflineOperation(storeCacheKey, {
          type: "payDebt",
          payload: { debtId, amount, notes, clientOperationId },
          clientOperationId,
          ownerSessionKey: queueOwnerKey,
        });
        setCustomers(optimisticCustomers);
        await upsertCachedCustomers(storeCacheKey, optimisticCustomers);
        return { ok: true, message: OFFLINE_WRITE_MESSAGE, id: debtId };
      }

      try {
        const updatedDebt = mergeDebtMetadata(
          await apiPayDebt(debtId, amount, notes, {
            clientOperationId,
            ...(targetDebt ? { fallbackDebt: targetDebt } : {}),
          }),
          targetDebt,
        );
        await upsertCachedDebts(storeCacheKey, [{ ...updatedDebt, customerId: customerWithDebt?.id }]);
        if (customerWithDebt) {
          const nextCustomers = customers.map((c) => {
            if (!c.debts.some((d) => d.id === debtId)) return c;
            const debts = c.debts.map((d) => (d.id === debtId ? updatedDebt : d));
            return { ...c, debts, debtBalance: calculateCustomerDebt(debts) };
          });
          setCustomers(nextCustomers);
          await upsertCachedCustomers(storeCacheKey, nextCustomers);
        }
        return { ok: true, message: "تم تسجيل الدفعة بنجاح", id: debtId };
      } catch (err) {
        if (isNetworkFailure(err)) {
          setIsOffline(true);
          await queueOfflineOperation(storeCacheKey, {
            type: "payDebt",
            payload: { debtId, amount, notes, clientOperationId },
            clientOperationId,
            ownerSessionKey: queueOwnerKey,
          });
          setCustomers(optimisticCustomers);
          await upsertCachedCustomers(storeCacheKey, optimisticCustomers);
          return { ok: true, message: OFFLINE_WRITE_MESSAGE, id: debtId };
        }
        return { ok: false, message: toUserFacingMessage(err, "تعذر تسجيل الدفعة.") };
      }
    },
    [customers, queueOwnerKey, storeCacheKey],
  );

  const loadDebtDetail = useCallback(async (debtId: string): Promise<Debt | null> => {
    if (!storeCacheKey) return null;

    try {
      const debt = await getDebtById(debtId);
      const customerWithDebt = customers.find((customer) => customer.debts.some((item) => item.id === debtId));
      await upsertCachedDebts(storeCacheKey, [{ ...debt, customerId: customerWithDebt?.id }]);
      setCustomers((current) =>
        current.map((c) => {
          if (!c.debts.some((d) => d.id === debtId)) return c;
          const debts = c.debts.map((d) => (d.id === debtId ? debt : d));
          return { ...c, debts, debtBalance: calculateCustomerDebt(debts) };
        }),
      );
      return debt;
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        return getCachedDebt(storeCacheKey, debtId);
      }
      return null;
    }
  }, [customers, storeCacheKey]);

  // ── Invoice detail loader ────────────────────────────────────────────────────
  const loadInvoiceDetail = useCallback(async (id: string): Promise<Invoice | null> => {
    if (!storeCacheKey) return null;

    try {
      const rich = await getInvoiceById(id);
      await upsertCachedInvoices(storeCacheKey, [rich]);
      setInvoices((current) => {
        const exists = current.some((inv) => inv.id === id);
        if (exists) return current.map((inv) => (inv.id === id ? rich : inv));
        return current;
      });
      return rich;
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        return getCachedInvoice(storeCacheKey, id);
      }
      return null;
    }
  }, [storeCacheKey]);

  // ── Sale ─────────────────────────────────────────────────────────────────────
  const completeSale = useCallback(
    async (request: SaleRequest): Promise<ActionResult> => {
      if (!storeCacheKey) return { ok: false, message: "جلسة المتجر غير متاحة" };

      if (request.items.length === 0) return { ok: false, message: "لا يمكن إتمام بيع بدون منتجات" };

      const subtotal = calculateItemsTotal(request.items);
      const discount = Number(request.discount ?? 0);
      const discountError = validateInvoiceDiscount(subtotal, discount);
      if (discountError === "invalid-discount") {
        return { ok: false, message: "أدخل مبلغ خصم صحيح" };
      }
      if (discountError === "discount-exceeds-subtotal") {
        return { ok: false, message: "الخصم لا يمكن أن يتجاوز المجموع" };
      }

      const total = calculateInvoiceTotal(request.items, discount);
      const customer = request.customerId
        ? customers.find((c) => c.id === request.customerId)
        : undefined;

      if ((request.paymentMethod === "debt" || request.paymentMethod === "partial") && !customer) {
        return { ok: false, message: "اختر العميل قبل إتمام البيع" };
      }

      const paid =
        request.paymentMethod === "cash"
          ? total
          : request.paymentMethod === "debt"
            ? 0
            : Number(request.paidAmount ?? 0);

      if (!Number.isFinite(paid) || paid < 0) return { ok: false, message: "أدخل مبلغ مدفوع صحيح" };
      if (compareMoney(paid, total) === 1) return { ok: false, message: "المبلغ المدفوع لا يمكن أن يتجاوز المجموع" };

      const unavailable = request.items.find((item) => {
        const product = products.find((p) => p.id === item.productId);
        return !product || product.stock < item.quantity;
      });
      if (unavailable) return { ok: false, message: `الكمية المتوفرة من ${unavailable.productName} غير كافية` };

      const clientInvoiceId = createClientOperationId("offline-invoice");
      const persistOfflineSale = async (): Promise<ActionResult> => {
        const invoice = buildOfflineInvoice(request, products, customer, new Date(), clientInvoiceId);
        const nextProducts = applyOfflineSaleToProducts(products, invoice.items);
        let nextCustomers = customers;

        await queueOfflineOperation(storeCacheKey, {
          type: "createInvoice",
          payload: request,
          localId: clientInvoiceId,
          clientOperationId: clientInvoiceId,
          ownerSessionKey: queueOwnerKey,
        });
        await upsertCachedInvoices(storeCacheKey, [invoice]);
        await upsertCachedProducts(storeCacheKey, nextProducts);

        if (invoice.remaining > 0 && customer) {
          const offlineDebt = createOfflineDebtFromInvoice(invoice);
          nextCustomers = customers.map((item) =>
            item.id === customer.id
              ? {
                  ...item,
                  debts: [offlineDebt, ...item.debts],
                  debtBalance: addMoney(getCustomerDebtTotal(item), offlineDebt.remaining),
                }
              : item,
          );
          await upsertCachedCustomers(storeCacheKey, nextCustomers);
        }

        setInvoices((current) => [invoice, ...current]);
        setInvoicesTotal((current) => current + 1);
        setProducts(nextProducts);
        if (invoice.remaining > 0 && customer) setCustomers(nextCustomers);

        return { ok: true, message: OFFLINE_WRITE_MESSAGE, id: invoice.id };
      };

      if (isOfflineRef.current || !getBrowserOnlineState()) {
        return persistOfflineSale();
      }

      let serverInvoice: Invoice;
      try {
        serverInvoice = await apiCreateInvoice(request, {
          clientInvoiceId,
        });
      } catch (err) {
        if (isNetworkFailure(err)) {
          setIsOffline(true);
          return persistOfflineSale();
        }
        return { ok: false, message: toUserFacingMessage(err, "تعذر تسجيل البيع على الخادم.") };
      }

      // Enrich items with wholesalePrice from local products (server may not return it)
      const enrichedItems: InvoiceItem[] = request.items.map((item) => {
        const product = products.find((p) => p.id === item.productId);
        const wholesalePrice =
          Number.isFinite(item.wholesalePrice) && item.wholesalePrice > 0
            ? item.wholesalePrice
            : (product?.wholesalePrice ?? 0);
        return {
          ...item,
          wholesalePrice,
          total: calculateInvoiceItemTotal(item.price, item.quantity),
        };
      });

      // Merge server id/number/date with local item detail
      const invoice: Invoice = {
        ...serverInvoice,
        customerName: serverInvoice.customerName ?? customer?.name ?? "بيع مباشر",
        items: serverInvoice.items.length > 0 ? serverInvoice.items : enrichedItems,
      };
      const nextProducts = applyOfflineSaleToProducts(products, invoice.items);

      setInvoices((current) => [invoice, ...current]);
      setInvoicesTotal((current) => current + 1);
      setProducts(nextProducts);
      await upsertCachedInvoices(storeCacheKey, [invoice]);
      await upsertCachedProducts(storeCacheKey, nextProducts);

      const remaining = maxMoney(subtractMoney(total, paid), 0);
      if (remaining > 0 && customer) {
        void refreshCustomers();
      }

      void refreshProducts();
      void refreshInvoices();
      return { ok: true, message: "تم إتمام البيع بنجاح" };
    },
    [customers, products, queueOwnerKey, refreshProducts, refreshCustomers, refreshInvoices, storeCacheKey],
  );

  // ── Invoice mutations ────────────────────────────────────────────────────────
  const updateInvoice = useCallback(
    async (id: string, request: InvoiceUpdateRequest): Promise<ActionResult> => {
      const invoice = invoices.find((item) => item.id === id);
      if (!invoice) return { ok: false, message: "الفاتورة غير موجودة" };

      const paymentMethod = request.paymentMethod ?? invoice.paymentMethod;
      const customerId =
        request.customerId !== undefined ? request.customerId || undefined : invoice.customerId;
      const previousItemsByProduct = new Map(invoice.items.map((item) => [item.productId, item]));
      const nextItemsByProduct = new Map<string, InvoiceItem>();

      request.items.forEach((item) => {
        const quantity = Math.max(0, Math.floor(Number(item.quantity)));
        if (!Number.isFinite(quantity) || quantity === 0) return;
        const existing = nextItemsByProduct.get(item.productId);
        nextItemsByProduct.set(item.productId, {
          ...item,
          quantity: (existing?.quantity ?? 0) + quantity,
        });
      });

      const stockErrorItem = Array.from(nextItemsByProduct.values()).find((item) => {
        const previousQuantity = previousItemsByProduct.get(item.productId)?.quantity ?? 0;
        const neededQuantity = item.quantity - previousQuantity;
        const product = products.find((p) => p.id === item.productId);
        return neededQuantity > 0 && (!product || product.stock < neededQuantity);
      });
      if (stockErrorItem) {
        return { ok: false, message: `الكمية المتوفرة من ${stockErrorItem.productName} غير كافية` };
      }

      const nextItems = Array.from(nextItemsByProduct.values()).map((item) => {
        const product = products.find((p) => p.id === item.productId);
        const previousItem = previousItemsByProduct.get(item.productId);
        const price =
          Number.isFinite(item.price) && item.price > 0 ? item.price : (previousItem?.price ?? product?.price ?? 0);
        const wholesalePrice =
          Number.isFinite(item.wholesalePrice) && item.wholesalePrice > 0
            ? item.wholesalePrice
            : (previousItem?.wholesalePrice ?? product?.wholesalePrice ?? 0);
        return {
          productId: item.productId,
          productName: product?.name ?? previousItem?.productName ?? item.productName,
          barcode: product?.barcode ?? previousItem?.barcode ?? item.barcode,
          price,
          wholesalePrice,
          quantity: item.quantity,
          total: calculateInvoiceItemTotal(price, item.quantity),
        };
      });

      if (nextItems.length === 0) {
        return { ok: false, message: "لا يمكن حفظ فاتورة بدون منتجات" };
      }

      const total = calculateItemsTotal(nextItems);
      const paid =
        paymentMethod === "cash"
          ? total
          : paymentMethod === "debt"
            ? 0
            : Number(request.paid ?? minMoney(invoice.paid, total));

      if ((paymentMethod === "debt" || paymentMethod === "partial") && !customerId) {
        return { ok: false, message: "اختر العميل قبل حفظ الفاتورة" };
      }

      if (!Number.isFinite(paid) || paid < 0) {
        return { ok: false, message: "أدخل مبلغ مدفوع صحيح" };
      }

      if (compareMoney(paid, total) === 1) {
        return { ok: false, message: "المبلغ المدفوع لا يمكن أن يتجاوز المجموع" };
      }

      try {
        const saved = await apiUpdateInvoice(id, {
          items: nextItems,
          paymentMethod,
          customerId,
          paid,
          notes: request.notes ?? invoice.notes,
        });
        const customer = customerId ? customers.find((item) => item.id === customerId) : undefined;
        const mergedInvoice: Invoice = {
          ...saved,
          customerName: saved.customerName ?? customer?.name ?? (customerId ? invoice.customerName : "بيع مباشر"),
          items: saved.items.length > 0 ? saved.items : nextItems,
        };

        setInvoices((current) =>
          current.map((item) => (item.id === id ? mergedInvoice : item)),
        );

        void refreshProducts();
        if (invoice.customerId || customerId || paymentMethod !== "cash") void refreshCustomers();

        return { ok: true, message: "تم تعديل الفاتورة بنجاح" };
      } catch (err) {
        return { ok: false, message: toUserFacingMessage(err, "تعذر تعديل الفاتورة.") };
      }
    },
    [customers, invoices, products, refreshCustomers, refreshProducts],
  );

  const deleteInvoice = useCallback(
    async (id: string): Promise<ActionResult> => {
      const invoice = invoices.find((item) => item.id === id);
      if (!invoice) return { ok: false, message: "الفاتورة غير موجودة" };
      try {
        await apiDeleteInvoice(id);
        setInvoices((current) => current.filter((item) => item.id !== id));
        setInvoicesTotal((current) => Math.max(current - 1, 0));
        void refreshProducts();
        if (invoice.customerId) void refreshCustomers();
        return { ok: true, message: "تم حذف الفاتورة بنجاح" };
      } catch (err) {
        return { ok: false, message: toUserFacingMessage(err, "تعذر حذف الفاتورة.") };
      }
    },
    [invoices, refreshProducts, refreshCustomers],
  );

  const processOfflineQueue = useCallback(async () => {
    if (!storeCacheKey || syncingOfflineQueueRef.current || !getBrowserOnlineState()) return;

    syncingOfflineQueueRef.current = true;

    try {
      const result = await drainOfflineQueue({
        recoverInFlightOperations: () => recoverInFlightOfflineOperations(storeCacheKey),
        listOperations: () => listOfflineOperations(storeCacheKey, queueOwnerKey),
        markOperationInFlight: markOfflineOperationInFlight,
        deleteOperation: (id) => deleteOfflineOperation(id, storeCacheKey),
        processOperation: async (operation, customerIdReplacements) => {
          switch (operation.type) {
            case "createInvoice": {
              const payload = resolveOfflineCustomerReference(operation.payload, customerIdReplacements);
              const clientInvoiceId = operation.clientOperationId ?? operation.localId;
              const saved = await apiCreateInvoice(payload, {
                clientInvoiceId,
              });
              await upsertCachedInvoices(storeCacheKey, [saved]);
              if (operation.localId) await deleteCachedInvoice(storeCacheKey, operation.localId);
              break;
            }
            case "createCustomer": {
              const saved = await apiCreateCustomer(operation.payload, { clientCustomerId: operation.localId });
              await upsertCachedCustomers(storeCacheKey, [saved]);
              const offlineCustomerId = operation.localId ?? await findCachedOfflineCustomerId(storeCacheKey, operation.payload);

              if (offlineCustomerId) {
                customerIdReplacements.set(offlineCustomerId, saved.id);
                await replaceOfflineCustomerIdInQueuedOperations(storeCacheKey, offlineCustomerId, saved.id);
                await deleteCachedCustomer(storeCacheKey, offlineCustomerId);
              }
              break;
            }
            case "payCustomerDebt": {
              const payload = resolveOfflineCustomerReference(operation.payload, customerIdReplacements);
              await payCustomerDebtAuto(
                payload.customerId,
                payload.amount,
                payload.notes,
                { clientOperationId: operation.clientOperationId ?? payload.clientOperationId },
              );
              break;
            }
            case "payDebt":
              await apiPayDebt(
                operation.payload.debtId,
                operation.payload.amount,
                operation.payload.notes,
                { clientOperationId: operation.clientOperationId ?? operation.payload.clientOperationId },
              );
              break;
          }
        },
      });

      if (result.wentOffline) {
        setIsOffline(true);
        return;
      }

      if (result.processedAny && result.drained && getBrowserOnlineState()) {
        setIsOffline(false);
        await Promise.all([refreshProducts(), refreshCustomers(), refreshInvoices(), refreshLowStock()]);
      }
    } finally {
      syncingOfflineQueueRef.current = false;
    }
  }, [queueOwnerKey, refreshCustomers, refreshInvoices, refreshLowStock, refreshProducts, storeCacheKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOnline = () => {
      setIsOffline(false);
      void processOfflineQueue();
    };
    const handleOffline = () => setIsOffline(true);

    setIsOffline(!getBrowserOnlineState());
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [processOfflineQueue]);

  useEffect(() => {
    if (!isStoreSession || isOffline) return;
    void processOfflineQueue();
  }, [isStoreSession, isOffline, processOfflineQueue]);

  const value = useMemo<AppStoreValue>(
    () => ({
      isOffline,
      cashierDraft,
      setCashierDraft,
      resetCashierDraft,
      products,
      productsLoading,
      productsError,
      productsQuery,
      productsTotal,
      lowStockCount,
      customers,
      customersLoading,
      customersError,
      customersQuery,
      customersTotal,
      invoices,
      invoicesLoading,
      invoicesError,
      invoicesQuery,
      invoicesTotal,
      setProductsQuery,
      refreshProducts,
      refreshLowStock,
      addProduct,
      updateProduct,
      deleteProduct,
      findProductByBarcodeRemote,
      setCustomersQuery,
      refreshCustomers,
      loadCustomerDetail,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      payCustomerDebt,
      payDebt,
      loadDebtDetail,
      setInvoicesQuery,
      refreshInvoices,
      loadInvoiceDetail,
      completeSale,
      updateInvoice,
      deleteInvoice,
    }),
    [
      isOffline,
      cashierDraft,
      resetCashierDraft,
      products,
      productsLoading,
      productsError,
      productsQuery,
      productsTotal,
      lowStockCount,
      customers,
      customersLoading,
      customersError,
      customersQuery,
      customersTotal,
      invoices,
      invoicesLoading,
      invoicesError,
      invoicesQuery,
      invoicesTotal,
      setProductsQuery,
      refreshProducts,
      refreshLowStock,
      addProduct,
      updateProduct,
      deleteProduct,
      findProductByBarcodeRemote,
      setCustomersQuery,
      refreshCustomers,
      loadCustomerDetail,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      payCustomerDebt,
      payDebt,
      loadDebtDetail,
      setInvoicesQuery,
      refreshInvoices,
      loadInvoiceDetail,
      completeSale,
      updateInvoice,
      deleteInvoice,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export const useAppStore = () => {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error("useAppStore must be used inside AppStoreProvider");
  return store;
};
