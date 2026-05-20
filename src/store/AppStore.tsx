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
import {
  getCustomerDebts,
  getDebtById,
  payCustomerDebtAuto,
  payDebt as apiPayDebt,
} from "../services/debtsApi";
import {
  cacheCustomerDebts,
  deleteOfflineOperation,
  getCachedCustomer,
  getCachedDebt,
  getCachedInvoice,
  getCachedProductByBarcode,
  listCachedCustomerDebts,
  listCachedCustomers,
  listCachedInvoices,
  listCachedProducts,
  listOfflineOperations,
  queueOfflineOperation,
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
  getBrowserOnlineState,
  isNetworkFailure,
} from "../services/offlineSync";
import {
  calculateCustomerDebt,
  calculateInvoiceItemTotal,
  calculateItemsTotal,
  getCustomerDebtTotal,
  validateDebtPaymentAmount,
} from "../utils/calculations";
import type {
  ActionResult,
  Customer,
  CustomerInput,
  Debt,
  DebtSummary,
  Invoice,
  InvoiceItem,
  InvoiceUpdateRequest,
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

type AppStoreValue = {
  isOffline: boolean;
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

const OFFLINE_WRITE_MESSAGE = "تم حفظ العملية بدون إنترنت وسيتم إرسالها تلقائياً عند عودة الاتصال";

const toDebtSummary = (debts: Debt[]): DebtSummary => ({
  totalDebt: debts.reduce((sum, debt) => sum + debt.amount, 0),
  totalRemaining: debts.reduce((sum, debt) => sum + debt.remaining, 0),
  debts,
});

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

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { session } = useAuthStore();
  const isStoreSession = Boolean(session?.token) && session?.user.role !== "SUPER_ADMIN";
  const [isOffline, setIsOffline] = useState(() => !getBrowserOnlineState());
  const isOfflineRef = useRef(isOffline);
  const syncingOfflineQueueRef = useRef(false);

  isOfflineRef.current = isOffline;

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

  // ── Products fetch ───────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async (query: ProductsQuery) => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const params: ListProductsParams = {
        page: query.page,
        limit: query.limit,
      };
      if (query.search.trim()) params.search = query.search.trim();
      if (query.isActive !== undefined) params.isActive = query.isActive;
      const result: ProductsListResult = await listProducts(params);
      await upsertCachedProducts(result.items);
      setProducts(result.items);
      setProductsTotal(result.total);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        const cached = await listCachedProducts(query);
        setProducts(cached.items);
        setProductsTotal(cached.total);
        setProductsError(null);
      } else {
        const msg = err instanceof Error ? err.message : "تعذر تحميل المنتجات.";
        setProductsError(msg);
      }
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const fetchLowStock = useCallback(async () => {
    try {
      const items = await getLowStockProducts();
      await upsertCachedProducts(items);
      setLowStockCount(items.length);
    } catch {
      try {
        const cached = await listCachedProducts({ isActive: true, page: 1, limit: Number.MAX_SAFE_INTEGER });
        setLowStockCount(cached.items.filter((product) => product.stock <= product.minStock).length);
      } catch {
        // non-critical, silent fail
      }
    }
  }, []);

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
    const missingSummaries = items.filter(
      (customer) => customer.debtBalance === undefined && customer.debts.length === 0,
    );
    if (missingSummaries.length === 0) return items;

    const settled = await Promise.allSettled(
      missingSummaries.map(async (customer) => {
        try {
          const summary = await getCustomerDebts(customer.id);
          await cacheCustomerDebts(customer.id, summary.debts, summary.totalRemaining);
          return { customerId: customer.id, summary };
        } catch (err) {
          if (!isNetworkFailure(err)) throw err;
          setIsOffline(true);
          const debts = await listCachedCustomerDebts(customer.id);
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
  }, []);

  const fetchCustomers = useCallback(async (query: CustomersQuery) => {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      const params: ListCustomersParams = {
        page: query.page,
        limit: query.limit,
      };
      if (query.search.trim()) params.search = query.search.trim();
      const result: CustomersListResult = await listCustomers(params);
      const items = await hydrateCustomerDebtSummaries(result.items);
      await upsertCachedCustomers(items);
      setCustomers(items);
      setCustomersTotal(result.total);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        const cached = await listCachedCustomers(query);
        setCustomers(cached.items);
        setCustomersTotal(cached.total);
        setCustomersError(null);
      } else {
        const msg = err instanceof Error ? err.message : "تعذر تحميل العملاء.";
        setCustomersError(msg);
      }
    } finally {
      setCustomersLoading(false);
    }
  }, [hydrateCustomerDebtSummaries]);

  const customersQueryRef = useRef(customersQuery);
  customersQueryRef.current = customersQuery;

  useEffect(() => {
    if (!isStoreSession) return;
    void fetchCustomers(customersQuery);
  }, [isStoreSession, customersQuery, fetchCustomers]);

  // ── Invoices fetch ───────────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async (query: InvoicesQuery) => {
    setInvoicesLoading(true);
    setInvoicesError(null);
    try {
      const params: ListInvoicesParams = {
        page: query.page,
        limit: query.limit,
      };
      if (query.search.trim()) params.search = query.search.trim();
      const result: InvoicesListResult = await listInvoices(params);
      await upsertCachedInvoices(result.items);
      setInvoices(result.items);
      setInvoicesTotal(result.total);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        const cached = await listCachedInvoices(query);
        setInvoices(cached.items);
        setInvoicesTotal(cached.total);
        setInvoicesError(null);
      } else {
        const msg = err instanceof Error ? err.message : "تعذر تحميل الفواتير.";
        setInvoicesError(msg);
      }
    } finally {
      setInvoicesLoading(false);
    }
  }, []);

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

  const addProduct = useCallback(
    async (input: ProductInput): Promise<ActionResult> => {
      try {
        const saved = await apiCreateProduct(input);
        await upsertCachedProducts([saved]);
        await fetchProducts(productsQueryRef.current);
        mergeProductIntoCurrentPage(saved);
        void fetchLowStock();
        return { ok: true, message: "تمت إضافة المنتج بنجاح", id: saved.id };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "تعذر إضافة المنتج." };
      }
    },
    [fetchProducts, fetchLowStock, mergeProductIntoCurrentPage],
  );

  const updateProduct = useCallback(
    async (id: string, input: ProductInput): Promise<ActionResult> => {
      try {
        const saved = await apiUpdateProduct(id, input);
        await upsertCachedProducts([saved]);
        await fetchProducts(productsQueryRef.current);
        mergeProductIntoCurrentPage(saved);
        void fetchLowStock();
        return { ok: true, message: "تم تعديل المنتج بنجاح" };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "تعذر تعديل المنتج." };
      }
    },
    [fetchProducts, fetchLowStock, mergeProductIntoCurrentPage],
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
    try {
      const product = await getProductByBarcode(barcode);
      await upsertCachedProducts([product]);
      return product;
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        return getCachedProductByBarcode(barcode);
      }
      return null;
    }
  }, []);

  // ── Customer detail loader ───────────────────────────────────────────────────
  const loadCustomerDetail = useCallback(async (id: string): Promise<void> => {
    let rich: Customer | null = null;
    let debtSummary: DebtSummary | null = null;

    try {
      rich = await getCustomerById(id);
      await upsertCachedCustomers([rich]);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        rich = await getCachedCustomer(id);
      }
    }

    try {
      debtSummary = await getCustomerDebts(id);
      await cacheCustomerDebts(id, debtSummary.debts, debtSummary.totalRemaining);
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        debtSummary = toDebtSummary(await listCachedCustomerDebts(id));
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
  }, []);

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

      const persistOfflineCustomer = async (): Promise<ActionResult> => {
        const saved = buildOfflineCustomer(input);
        await queueOfflineOperation({ type: "createCustomer", payload: input });
        await upsertCachedCustomers([saved]);
        mergeCustomerIntoCurrentPage(saved);
        setCustomersTotal((current) => current + 1);
        return { ok: true, message: OFFLINE_WRITE_MESSAGE, id: saved.id };
      };

      if (isOfflineRef.current || !getBrowserOnlineState()) {
        setIsOffline(true);
        return persistOfflineCustomer();
      }

      try {
        const saved = await apiCreateCustomer(input);
        await upsertCachedCustomers([saved]);
        await fetchCustomers(customersQueryRef.current);
        mergeCustomerIntoCurrentPage(saved);
        return { ok: true, message: "تمت إضافة العميل بنجاح", id: saved.id };
      } catch (err) {
        if (isNetworkFailure(err)) {
          setIsOffline(true);
          return persistOfflineCustomer();
        }
        return { ok: false, message: err instanceof Error ? err.message : "تعذر إضافة العميل." };
      }
    },
    [fetchCustomers, mergeCustomerIntoCurrentPage],
  );

  const updateCustomer = useCallback(
    async (id: string, input: CustomerInput): Promise<ActionResult> => {
      if (!input.name.trim()) return { ok: false, message: "اسم العميل مطلوب" };
      try {
        const saved = await apiUpdateCustomer(id, input);
        await upsertCachedCustomers([saved]);
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
        return { ok: false, message: err instanceof Error ? err.message : "تعذر تعديل العميل." };
      }
    },
    [],
  );

  const deleteCustomer = useCallback(
    async (id: string): Promise<ActionResult> => {
      try {
        await apiDeleteCustomer(id);
        await fetchCustomers(customersQueryRef.current);
        return { ok: true, message: "تم حذف العميل بنجاح" };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "تعذر حذف العميل." };
      }
    },
    [fetchCustomers],
  );

  const payCustomerDebt = useCallback(
    async (customerId: string, amount: number, notes?: string): Promise<ActionResult> => {
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) return { ok: false, message: "العميل غير موجود" };
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: "أدخل مبلغ تسديد صحيح" };
      const totalDebt = getCustomerDebtTotal(customer);
      if (amount > totalDebt) return { ok: false, message: "مبلغ التسديد أكبر من إجمالي الدين" };

      const optimisticCustomers = applyCustomerDebtPayment(customers, customerId, amount);

      if (isOfflineRef.current || !getBrowserOnlineState()) {
        await queueOfflineOperation({ type: "payCustomerDebt", payload: { customerId, amount, notes } });
        setCustomers(optimisticCustomers);
        await upsertCachedCustomers(optimisticCustomers);
        return { ok: true, message: OFFLINE_WRITE_MESSAGE };
      }

      setCustomers(optimisticCustomers);

      try {
        const summary = await payCustomerDebtAuto(customerId, amount, notes);
        await cacheCustomerDebts(customerId, summary.debts, summary.totalRemaining);
        setCustomers((current) =>
          current.map((c) =>
            c.id === customerId ? { ...c, debts: summary.debts, debtBalance: summary.totalRemaining } : c,
          ),
        );
        return { ok: true, message: "تم تسجيل التسديد بنجاح" };
      } catch (err) {
        if (isNetworkFailure(err)) {
          setIsOffline(true);
          await queueOfflineOperation({ type: "payCustomerDebt", payload: { customerId, amount, notes } });
          await upsertCachedCustomers(optimisticCustomers);
          return { ok: true, message: OFFLINE_WRITE_MESSAGE };
        }

        // Rollback optimistic update by reloading fresh debt data
        getCustomerDebts(customerId)
          .then((summary) => {
            void cacheCustomerDebts(customerId, summary.debts, summary.totalRemaining);
            setCustomers((current) =>
              current.map((c) =>
                c.id === customerId ? { ...c, debts: summary.debts, debtBalance: summary.totalRemaining } : c,
              ),
            );
          })
          .catch(() => undefined);
        return { ok: false, message: err instanceof Error ? err.message : "تعذر تسجيل التسديد." };
      }
    },
    [customers],
  );

  const payDebt = useCallback(
    async (debtId: string, amount: number, notes?: string): Promise<ActionResult> => {
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

      if (isOfflineRef.current || !getBrowserOnlineState()) {
        await queueOfflineOperation({ type: "payDebt", payload: { debtId, amount, notes } });
        setCustomers(optimisticCustomers);
        await upsertCachedCustomers(optimisticCustomers);
        return { ok: true, message: OFFLINE_WRITE_MESSAGE, id: debtId };
      }

      try {
        const updatedDebt = await apiPayDebt(debtId, amount, notes);
        await upsertCachedDebts([{ ...updatedDebt, customerId: customerWithDebt?.id }]);
        if (customerWithDebt) {
          const nextCustomers = customers.map((c) => {
            if (!c.debts.some((d) => d.id === debtId)) return c;
            const debts = c.debts.map((d) => (d.id === debtId ? updatedDebt : d));
            return { ...c, debts, debtBalance: calculateCustomerDebt(debts) };
          });
          setCustomers(nextCustomers);
          await upsertCachedCustomers(nextCustomers);
        }
        return { ok: true, message: "تم تسجيل الدفعة بنجاح", id: debtId };
      } catch (err) {
        if (isNetworkFailure(err)) {
          setIsOffline(true);
          await queueOfflineOperation({ type: "payDebt", payload: { debtId, amount, notes } });
          setCustomers(optimisticCustomers);
          await upsertCachedCustomers(optimisticCustomers);
          return { ok: true, message: OFFLINE_WRITE_MESSAGE, id: debtId };
        }
        return { ok: false, message: err instanceof Error ? err.message : "تعذر تسجيل الدفعة." };
      }
    },
    [customers],
  );

  const loadDebtDetail = useCallback(async (debtId: string): Promise<Debt | null> => {
    try {
      const debt = await getDebtById(debtId);
      const customerWithDebt = customers.find((customer) => customer.debts.some((item) => item.id === debtId));
      await upsertCachedDebts([{ ...debt, customerId: customerWithDebt?.id }]);
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
        return getCachedDebt(debtId);
      }
      return null;
    }
  }, [customers]);

  // ── Invoice detail loader ────────────────────────────────────────────────────
  const loadInvoiceDetail = useCallback(async (id: string): Promise<Invoice | null> => {
    try {
      const rich = await getInvoiceById(id);
      await upsertCachedInvoices([rich]);
      setInvoices((current) => {
        const exists = current.some((inv) => inv.id === id);
        if (exists) return current.map((inv) => (inv.id === id ? rich : inv));
        return current;
      });
      return rich;
    } catch (err) {
      if (isNetworkFailure(err)) {
        setIsOffline(true);
        return getCachedInvoice(id);
      }
      return null;
    }
  }, []);

  // ── Sale ─────────────────────────────────────────────────────────────────────
  const completeSale = useCallback(
    async (request: SaleRequest): Promise<ActionResult> => {
      if (request.items.length === 0) return { ok: false, message: "لا يمكن إتمام بيع بدون منتجات" };

      const total = calculateItemsTotal(request.items);
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
      if (paid > total) return { ok: false, message: "المبلغ المدفوع لا يمكن أن يتجاوز المجموع" };

      const unavailable = request.items.find((item) => {
        const product = products.find((p) => p.id === item.productId);
        return !product || product.stock < item.quantity;
      });
      if (unavailable) return { ok: false, message: `الكمية المتوفرة من ${unavailable.productName} غير كافية` };

      const persistOfflineSale = async (): Promise<ActionResult> => {
        const invoice = buildOfflineInvoice(request, products, customer);
        const nextProducts = applyOfflineSaleToProducts(products, invoice.items);
        let nextCustomers = customers;

        await queueOfflineOperation({ type: "createInvoice", payload: request });
        await upsertCachedInvoices([invoice]);
        await upsertCachedProducts(nextProducts);

        if (invoice.remaining > 0 && customer) {
          const offlineDebt = createOfflineDebtFromInvoice(invoice);
          nextCustomers = customers.map((item) =>
            item.id === customer.id
              ? {
                  ...item,
                  debts: [offlineDebt, ...item.debts],
                  debtBalance: getCustomerDebtTotal(item) + offlineDebt.remaining,
                }
              : item,
          );
          await upsertCachedCustomers(nextCustomers);
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
        serverInvoice = await apiCreateInvoice(request);
      } catch (err) {
        if (isNetworkFailure(err)) {
          setIsOffline(true);
          return persistOfflineSale();
        }
        return { ok: false, message: err instanceof Error ? err.message : "تعذر تسجيل البيع على الخادم." };
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
      await upsertCachedInvoices([invoice]);
      await upsertCachedProducts(nextProducts);

      const remaining = total - paid;
      if (remaining > 0 && customer) {
        void refreshCustomers();
      }

      void refreshProducts();
      void refreshInvoices();
      return { ok: true, message: "تم إتمام البيع بنجاح" };
    },
    [customers, products, refreshProducts, refreshCustomers, refreshInvoices],
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
            : Number(request.paid ?? Math.min(invoice.paid, total));

      if ((paymentMethod === "debt" || paymentMethod === "partial") && !customerId) {
        return { ok: false, message: "اختر العميل قبل حفظ الفاتورة" };
      }

      if (!Number.isFinite(paid) || paid < 0) {
        return { ok: false, message: "أدخل مبلغ مدفوع صحيح" };
      }

      if (paid > total) {
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
        return { ok: false, message: err instanceof Error ? err.message : "تعذر تعديل الفاتورة." };
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
        return { ok: false, message: err instanceof Error ? err.message : "تعذر حذف الفاتورة." };
      }
    },
    [invoices, refreshProducts, refreshCustomers],
  );

  const processOfflineQueue = useCallback(async () => {
    if (!isStoreSession || syncingOfflineQueueRef.current || !getBrowserOnlineState()) return;

    syncingOfflineQueueRef.current = true;
    let processedAny = false;

    try {
      const operations = await listOfflineOperations();

      for (const operation of operations) {
        if (!operation.id) continue;

        try {
          switch (operation.type) {
            case "createInvoice":
              await apiCreateInvoice(operation.payload);
              break;
            case "createCustomer":
              await apiCreateCustomer(operation.payload);
              break;
            case "payCustomerDebt":
              await payCustomerDebtAuto(
                operation.payload.customerId,
                operation.payload.amount,
                operation.payload.notes,
              );
              break;
            case "payDebt":
              await apiPayDebt(operation.payload.debtId, operation.payload.amount, operation.payload.notes);
              break;
          }

          await deleteOfflineOperation(operation.id);
          processedAny = true;
        } catch (err) {
          if (isNetworkFailure(err)) setIsOffline(true);
          break;
        }
      }

      if (processedAny && getBrowserOnlineState()) {
        setIsOffline(false);
        await Promise.all([refreshProducts(), refreshCustomers(), refreshInvoices(), refreshLowStock()]);
      }
    } finally {
      syncingOfflineQueueRef.current = false;
    }
  }, [isStoreSession, refreshCustomers, refreshInvoices, refreshLowStock, refreshProducts]);

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
