# Reports and Invoice Pagination Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speed up the reports page and invoice pagination by reusing recently loaded data, keeping rows visible during refreshes, and preventing stale request results from overwriting newer state.

**Architecture:** Add a small module-level reports dataset cache in `reportsData.ts`, then consume it from `ReportsPage`. Add an in-memory invoice page cache and request-id guard in `AppStoreProvider`, then update `InvoicesPage` so existing rows remain visible while a new page refreshes.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, jsdom component tests, existing service modules and `AppStoreProvider`.

---

## File Structure

- Modify: `src/services/reportsData.ts`
  - Owns report dataset collection and the new short-lived in-memory reports cache.
- Modify: `src/services/reportsData.test.ts`
  - Tests cache hit behavior, in-flight request sharing, and stale-cache fallback after refresh errors.
- Modify: `src/pages/ReportsPage.tsx`
  - Uses cached reports data and separates initial dataset loading from background refresh.
- Create: `src/pages/ReportsPage.test.tsx`
  - Verifies cached report data stays visible while a background refresh is pending.
- Modify: `src/store/AppStore.tsx`
  - Adds invoice page cache, stale request guard, and keeps current rows visible during page refresh.
- Create: `src/store/AppStore.test.tsx`
  - Tests cached invoice page reuse and stale invoice request suppression.
- Modify: `src/pages/InvoicesPage.tsx`
  - Renders existing invoice rows while `invoicesLoading` is true and adds a lightweight refresh message.
- Create: `src/pages/InvoicesPage.test.tsx`
  - Verifies rows remain visible during a loading refresh.

---

### Task 1: Reports Dataset Cache

**Files:**
- Modify: `src/services/reportsData.test.ts`
- Modify: `src/services/reportsData.ts`

- [ ] **Step 1: Write failing reports cache tests**

Add these imports in `src/services/reportsData.test.ts`:

```ts
import {
  clearReportsDatasetCache,
  loadReportsDataset,
  loadReportsDatasetCached,
  REPORTS_DATASET_CACHE_TTL_MS,
  REPORTS_PAGE_SIZE,
} from "./reportsData";
```

Replace the current single import from `./reportsData` with the block above.

In the existing `beforeEach`, clear the cache:

```ts
beforeEach(() => {
  vi.mocked(listProducts).mockReset();
  vi.mocked(listCustomers).mockReset();
  vi.mocked(listInvoices).mockReset();
  vi.mocked(getInvoiceById).mockReset();
  vi.mocked(getCustomerDebts).mockReset();
  clearReportsDatasetCache();
});
```

Add this helper after the existing `invoice` helper:

```ts
const mockSinglePageDataset = (
  products = [product("p1", 2)],
  customers = [customer("c1", 25)],
  invoices = [invoice("i1", 1)],
) => {
  vi.mocked(listProducts).mockResolvedValue({
    items: products,
    total: products.length,
    page: 1,
    limit: REPORTS_PAGE_SIZE,
  });
  vi.mocked(listCustomers).mockResolvedValue({
    items: customers,
    total: customers.length,
    page: 1,
    limit: REPORTS_PAGE_SIZE,
  });
  vi.mocked(listInvoices).mockResolvedValue({
    items: invoices,
    total: invoices.length,
    page: 1,
    limit: REPORTS_PAGE_SIZE,
  });
};
```

Add these tests inside `describe("loadReportsDataset", () => { ... })`:

```ts
it("serves a fresh cached reports dataset without refetching every API", async () => {
  const productsPage = [product("p1", 2)];
  const customersPage = [customer("c1", 25)];
  const invoicesPage = [invoice("i1", 1)];
  mockSinglePageDataset(productsPage, customersPage, invoicesPage);

  const first = await loadReportsDatasetCached({ now: 1_000 });

  expect(first).toMatchObject({
    data: {
      products: productsPage,
      customers: customersPage,
      invoices: invoicesPage,
    },
    fromCache: false,
    refreshing: false,
    refresh: null,
  });

  vi.mocked(listProducts).mockClear();
  vi.mocked(listCustomers).mockClear();
  vi.mocked(listInvoices).mockClear();

  const second = await loadReportsDatasetCached({
    now: 1_000 + REPORTS_DATASET_CACHE_TTL_MS - 1,
  });

  expect(second).toMatchObject({
    data: first.data,
    fromCache: true,
    refreshing: false,
    refresh: null,
  });
  expect(listProducts).not.toHaveBeenCalled();
  expect(listCustomers).not.toHaveBeenCalled();
  expect(listInvoices).not.toHaveBeenCalled();
});

it("shares one in-flight reports dataset request between concurrent callers", async () => {
  let resolveProducts!: (value: Awaited<ReturnType<typeof listProducts>>) => void;
  vi.mocked(listProducts).mockReturnValue(
    new Promise((resolve) => {
      resolveProducts = resolve;
    }),
  );
  vi.mocked(listCustomers).mockResolvedValue({
    items: [customer("c1", 25)],
    total: 1,
    page: 1,
    limit: REPORTS_PAGE_SIZE,
  });
  vi.mocked(listInvoices).mockResolvedValue({
    items: [invoice("i1", 1)],
    total: 1,
    page: 1,
    limit: REPORTS_PAGE_SIZE,
  });

  const first = loadReportsDatasetCached({ now: 2_000 });
  const second = loadReportsDatasetCached({ now: 2_000 });

  expect(listProducts).toHaveBeenCalledTimes(1);
  expect(listCustomers).toHaveBeenCalledTimes(1);
  expect(listInvoices).toHaveBeenCalledTimes(1);

  resolveProducts({
    items: [product("p1", 2)],
    total: 1,
    page: 1,
    limit: REPORTS_PAGE_SIZE,
  });

  await expect(Promise.all([first, second])).resolves.toEqual([
    expect.objectContaining({ fromCache: false, refreshing: false }),
    expect.objectContaining({ fromCache: false, refreshing: false }),
  ]);
});

it("keeps stale cached reports data available when a background refresh fails", async () => {
  const cachedProducts = [product("cached", 2)];
  mockSinglePageDataset(cachedProducts, [customer("cached-customer", 10)], [invoice("cached-invoice", 1)]);

  const first = await loadReportsDatasetCached({ now: 3_000 });

  vi.mocked(listProducts).mockRejectedValue(new Error("network down"));

  const second = await loadReportsDatasetCached({
    now: 3_000 + REPORTS_DATASET_CACHE_TTL_MS + 1,
  });

  expect(second.data).toEqual(first.data);
  expect(second.fromCache).toBe(true);
  expect(second.refreshing).toBe(true);
  expect(second.refresh).toBeInstanceOf(Promise);
  await expect(second.refresh).rejects.toThrow("network down");
});
```

- [ ] **Step 2: Run reports cache tests and verify they fail**

Run:

```powershell
npm.cmd test -- src/services/reportsData.test.ts
```

Expected: fails because `clearReportsDatasetCache`, `loadReportsDatasetCached`, and `REPORTS_DATASET_CACHE_TTL_MS` are not exported.

- [ ] **Step 3: Implement reports dataset cache**

In `src/services/reportsData.ts`, after `export const REPORTS_PAGE_SIZE = 100;`, add:

```ts
export const REPORTS_DATASET_CACHE_TTL_MS = 60_000;
```

After the `ReportsDataset` type, add:

```ts
export type ReportsDatasetLoadResult = {
  data: ReportsDataset;
  fromCache: boolean;
  refreshing: boolean;
  refresh: Promise<ReportsDataset> | null;
};

type ReportsDatasetCacheEntry = {
  data: ReportsDataset;
  loadedAt: number;
};

let reportsDatasetCache: ReportsDatasetCacheEntry | null = null;
let reportsDatasetInFlight: Promise<ReportsDataset> | null = null;

export const clearReportsDatasetCache = (): void => {
  reportsDatasetCache = null;
  reportsDatasetInFlight = null;
};

const getNow = (now?: number): number => now ?? Date.now();

const loadReportsDatasetFresh = async (loadedAt: number): Promise<ReportsDataset> => {
  if (!reportsDatasetInFlight) {
    reportsDatasetInFlight = loadReportsDataset()
      .then((data) => {
        reportsDatasetCache = { data, loadedAt };
        return data;
      })
      .finally(() => {
        reportsDatasetInFlight = null;
      });
  }

  return reportsDatasetInFlight;
};

export const loadReportsDatasetCached = async (
  options: { now?: number; forceRefresh?: boolean } = {},
): Promise<ReportsDatasetLoadResult> => {
  const now = getNow(options.now);
  const cacheAge = reportsDatasetCache ? now - reportsDatasetCache.loadedAt : Number.POSITIVE_INFINITY;
  const hasFreshCache =
    !options.forceRefresh &&
    reportsDatasetCache !== null &&
    cacheAge >= 0 &&
    cacheAge < REPORTS_DATASET_CACHE_TTL_MS;

  if (hasFreshCache) {
    return {
      data: reportsDatasetCache.data,
      fromCache: true,
      refreshing: false,
      refresh: null,
    };
  }

  if (reportsDatasetCache && !options.forceRefresh) {
    return {
      data: reportsDatasetCache.data,
      fromCache: true,
      refreshing: true,
      refresh: loadReportsDatasetFresh(now),
    };
  }

  const data = await loadReportsDatasetFresh(now);

  return {
    data,
    fromCache: false,
    refreshing: false,
    refresh: null,
  };
};
```

Keep the existing `loadReportsDataset` export unchanged.

- [ ] **Step 4: Run reports cache tests and verify they pass**

Run:

```powershell
npm.cmd test -- src/services/reportsData.test.ts
```

Expected: all tests in `reportsData.test.ts` pass.

- [ ] **Step 5: Commit reports cache**

Run:

```powershell
git add src/services/reportsData.ts src/services/reportsData.test.ts
git commit -m "feat: cache reports dataset loads"
```

Expected: commit succeeds.

---

### Task 2: Reports Page Cached Refresh State

**Files:**
- Create: `src/pages/ReportsPage.test.tsx`
- Modify: `src/pages/ReportsPage.tsx`

- [ ] **Step 1: Write failing reports page test**

Create `src/pages/ReportsPage.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "./ReportsPage";
import type { ReportsDataset } from "../services/reportsData";
import { loadReportsDatasetCached } from "../services/reportsData";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../services/reportsApi", () => ({
  getDailyProfit: vi.fn(async () => ({
    date: "2026-05-22",
    totalRevenue: 100,
    totalCost: 60,
    netProfit: 40,
  })),
}));

vi.mock("../services/reportsData", () => ({
  loadReportsDatasetCached: vi.fn(),
}));

const dataset = (productName: string): ReportsDataset => ({
  products: [
    {
      id: "p1",
      name: productName,
      barcode: "123",
      price: 10,
      wholesalePrice: 7,
      stock: 2,
      minStock: 5,
      isActive: true,
    },
  ],
  customers: [],
  invoices: [],
});

const renderReports = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ReportsPage />);
  });

  return { container, root };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("ReportsPage cached dataset loading", () => {
  beforeEach(() => {
    vi.mocked(loadReportsDatasetCached).mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("keeps cached reports rows visible while a background refresh is pending", async () => {
    let resolveRefresh!: (data: ReportsDataset) => void;
    const refresh = new Promise<ReportsDataset>((resolve) => {
      resolveRefresh = resolve;
    });

    vi.mocked(loadReportsDatasetCached).mockResolvedValue({
      data: dataset("Cached Product"),
      fromCache: true,
      refreshing: true,
      refresh,
    });

    const { container, root } = await renderReports();

    expect(container.textContent).toContain("Cached Product");

    await act(async () => {
      resolveRefresh(dataset("Fresh Product"));
      await refresh;
    });

    expect(container.textContent).toContain("Fresh Product");
    expect(container.textContent).not.toContain("Cached Product");

    await unmount(root, container);
  });
});
```

- [ ] **Step 2: Run reports page test and verify it fails**

Run:

```powershell
npm.cmd test -- src/pages/ReportsPage.test.tsx
```

Expected: fails because `ReportsPage` still imports and calls `loadReportsDataset`, not `loadReportsDatasetCached`.

- [ ] **Step 3: Implement cached reports page state**

In `src/pages/ReportsPage.tsx`, change the import:

```ts
import { loadReportsDatasetCached, type ReportsDataset } from "../services/reportsData";
```

Add a background refreshing state beside `reportsLoading`:

```ts
const [reportsRefreshing, setReportsRefreshing] = useState(false);
```

Replace the dataset `useEffect` with:

```ts
useEffect(() => {
  let cancelled = false;

  setReportsLoading(true);
  setReportsError(null);

  loadReportsDatasetCached()
    .then((result) => {
      if (cancelled) return;

      setReportsDataset(result.data);
      setReportsLoading(!result.fromCache && result.refreshing);
      setReportsRefreshing(result.refreshing);

      if (result.refresh) {
        result.refresh
          .then((freshData) => {
            if (!cancelled) {
              setReportsDataset(freshData);
              setReportsError(null);
            }
          })
          .catch((err: unknown) => {
            if (!cancelled) {
              setReportsError(err instanceof Error ? err.message : "تعذر تحديث بيانات التقرير.");
            }
          })
          .finally(() => {
            if (!cancelled) {
              setReportsRefreshing(false);
              setReportsLoading(false);
            }
          });
      } else {
        setReportsRefreshing(false);
        setReportsLoading(false);
      }
    })
    .catch((err: unknown) => {
      if (!cancelled) {
        setReportsError(err instanceof Error ? err.message : "تعذر تحميل بيانات التقرير.");
        setReportsLoading(false);
        setReportsRefreshing(false);
      }
    });

  return () => {
    cancelled = true;
  };
}, []);
```

Change the loading indicator near the date selector to show either loading or refreshing:

```tsx
{(loading || reportsRefreshing) && (
  <span className="text-xs text-zinc-400">
    {reportsRefreshing ? "جاري تحديث البيانات..." : "جاري التحميل..."}
  </span>
)}
```

- [ ] **Step 4: Run reports page tests and reports data tests**

Run:

```powershell
npm.cmd test -- src/pages/ReportsPage.test.tsx src/services/reportsData.test.ts
```

Expected: both test files pass.

- [ ] **Step 5: Commit reports page integration**

Run:

```powershell
git add src/pages/ReportsPage.tsx src/pages/ReportsPage.test.tsx
git commit -m "feat: show cached reports while refreshing"
```

Expected: commit succeeds.

---

### Task 3: Invoice Page Cache and Stale Request Guard

**Files:**
- Create: `src/store/AppStore.test.tsx`
- Modify: `src/store/AppStore.tsx`

- [ ] **Step 1: Write failing AppStore invoice cache tests**

Create `src/store/AppStore.test.tsx`:

```tsx
// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useAppStore, type AppStoreValue } from "./AppStore";
import { listInvoices } from "../services/invoicesApi";
import type { Invoice } from "../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

vi.mock("../services/productsApi", () => ({
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getProductByBarcode: vi.fn(),
  getLowStockProducts: vi.fn(async () => []),
  listProducts: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
  updateProduct: vi.fn(),
}));

vi.mock("../services/customersApi", () => ({
  createCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  getCustomerById: vi.fn(),
  listCustomers: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
  updateCustomer: vi.fn(),
}));

vi.mock("../services/debtsApi", () => ({
  getCustomerDebts: vi.fn(),
  getDebtById: vi.fn(),
  payCustomerDebtAuto: vi.fn(),
  payDebt: vi.fn(),
}));

vi.mock("../services/invoicesApi", () => ({
  createInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  getInvoiceById: vi.fn(),
  listInvoices: vi.fn(),
  updateInvoice: vi.fn(),
}));

vi.mock("../services/offlineDb", () => ({
  cacheCustomerDebts: vi.fn(),
  deleteCachedCustomer: vi.fn(),
  deleteCachedInvoice: vi.fn(),
  deleteOfflineOperation: vi.fn(),
  getCachedCustomer: vi.fn(),
  getCachedDebt: vi.fn(),
  getCachedInvoice: vi.fn(),
  getCachedProductByBarcode: vi.fn(),
  hasOfflineOperations: vi.fn(async () => false),
  listCachedCustomerDebts: vi.fn(async () => []),
  listCachedCustomers: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
  listCachedInvoices: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
  listCachedProducts: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
  listOfflineOperations: vi.fn(async () => []),
  queueCachedOfflineCustomerCreation: vi.fn(),
  queueOfflineOperation: vi.fn(),
  replaceOfflineCustomerIdInQueuedOperations: vi.fn(),
  upsertCachedCustomers: vi.fn(),
  upsertCachedDebts: vi.fn(),
  upsertCachedInvoices: vi.fn(),
  upsertCachedProducts: vi.fn(),
}));

const invoice = (id: string, page: number): Invoice => ({
  id,
  number: `INV-${page}`,
  date: "2026-05-22T10:00:00.000Z",
  customerName: `Customer ${page}`,
  items: [],
  total: page * 10,
  paid: page * 10,
  remaining: 0,
  paymentMethod: "cash",
});

let latestStore: AppStoreValue | null = null;

function Probe() {
  latestStore = useAppStore();

  return (
    <div>
      <span data-testid="loading">{String(latestStore.invoicesLoading)}</span>
      {latestStore.invoices.map((item) => (
        <span key={item.id}>{item.number}</span>
      ))}
    </div>
  );
}

const renderStore = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <AppStoreProvider>
        <Probe />
      </AppStoreProvider>,
    );
  });

  return { container, root };
};

const waitForText = async (container: HTMLElement, text: string) => {
  for (let i = 0; i < 20; i += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await Promise.resolve();
    });
  }

  throw new Error(`Timed out waiting for ${text}`);
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("AppStore invoice pagination cache", () => {
  beforeEach(() => {
    latestStore = null;
    vi.mocked(listInvoices).mockReset();
    vi.mocked(listInvoices).mockImplementation(async ({ page = 1, limit = 20 }) => ({
      items: [invoice(`invoice-${page}`, page)],
      total: 60,
      page,
      limit,
    }));
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows a cached invoice page immediately when returning to it", async () => {
    const { container, root } = await renderStore();

    await waitForText(container, "INV-1");

    await act(async () => {
      latestStore?.setInvoicesQuery({ page: 2 });
    });
    await waitForText(container, "INV-2");

    let resolvePageOne!: (value: Awaited<ReturnType<typeof listInvoices>>) => void;
    vi.mocked(listInvoices).mockImplementation(({ page = 1, limit = 20 }) => {
      if (page === 1) {
        return new Promise((resolve) => {
          resolvePageOne = resolve;
        });
      }

      return Promise.resolve({
        items: [invoice(`invoice-${page}`, page)],
        total: 60,
        page,
        limit,
      });
    });

    await act(async () => {
      latestStore?.setInvoicesQuery({ page: 1 });
    });

    expect(container.textContent).toContain("INV-1");
    expect(container.textContent).not.toContain("INV-2");

    await act(async () => {
      resolvePageOne({
        items: [invoice("invoice-1-fresh", 1)],
        total: 60,
        page: 1,
        limit: 20,
      });
    });

    await waitForText(container, "INV-1");
    await unmount(root, container);
  });

  it("does not let an older invoice request overwrite a newer page", async () => {
    const { container, root } = await renderStore();
    await waitForText(container, "INV-1");

    let resolvePageTwo!: (value: Awaited<ReturnType<typeof listInvoices>>) => void;

    vi.mocked(listInvoices).mockImplementation(({ page = 1, limit = 20 }) => {
      if (page === 2) {
        return new Promise((resolve) => {
          resolvePageTwo = resolve;
        });
      }

      return Promise.resolve({
        items: [invoice(`invoice-${page}`, page)],
        total: 60,
        page,
        limit,
      });
    });

    await act(async () => {
      latestStore?.setInvoicesQuery({ page: 2 });
    });
    await act(async () => {
      latestStore?.setInvoicesQuery({ page: 3 });
    });

    await waitForText(container, "INV-3");

    await act(async () => {
      resolvePageTwo({
        items: [invoice("invoice-2-late", 2)],
        total: 60,
        page: 2,
        limit: 20,
      });
    });

    expect(container.textContent).toContain("INV-3");
    expect(container.textContent).not.toContain("INV-2");

    await unmount(root, container);
  });
});
```

- [ ] **Step 2: Run AppStore tests and verify they fail**

Run:

```powershell
npm.cmd test -- src/store/AppStore.test.tsx
```

Expected: at least one test fails because returning to page 1 waits for the fresh request, and the stale page 2 response can overwrite page 3.

- [ ] **Step 3: Implement invoice cache refs and helpers**

In `src/store/AppStore.tsx`, add these types near `InvoicesQuery`:

```ts
type InvoicePageCacheEntry = {
  items: Invoice[];
  total: number;
  loadedAt: number;
};
```

Inside `AppStoreProvider`, near the invoice state declarations, add:

```ts
const invoicePageCacheRef = useRef(new Map<string, InvoicePageCacheEntry>());
const invoiceRequestIdRef = useRef(0);
```

Add this helper inside `AppStoreProvider` before `fetchInvoices`:

```ts
const getInvoicePageCacheKey = useCallback((query: InvoicesQuery): string => {
  return JSON.stringify({
    search: query.search.trim(),
    page: query.page,
    limit: query.limit,
  });
}, []);
```

In the store/session reset `useEffect`, clear invoice cache:

```ts
invoicePageCacheRef.current.clear();
invoiceRequestIdRef.current += 1;
```

- [ ] **Step 4: Add request guard and cache usage to `fetchInvoices`**

Replace the current `fetchInvoices` implementation with this version:

```ts
const fetchInvoices = useCallback(async (query: InvoicesQuery) => {
  const requestId = invoiceRequestIdRef.current + 1;
  invoiceRequestIdRef.current = requestId;

  if (!storeCacheKey) {
    setInvoices([]);
    setInvoicesTotal(0);
    return;
  }

  const cacheKey = getInvoicePageCacheKey(query);
  const cached = invoicePageCacheRef.current.get(cacheKey);

  if (cached) {
    setInvoices(cached.items);
    setInvoicesTotal(cached.total);
  }

  setInvoicesLoading(true);
  setInvoicesError(null);

  const applyResult = (items: Invoice[], total: number) => {
    if (invoiceRequestIdRef.current !== requestId) return;
    invoicePageCacheRef.current.set(cacheKey, {
      items,
      total,
      loadedAt: Date.now(),
    });
    setInvoices(items);
    setInvoicesTotal(total);
  };

  try {
    const isOnline = getBrowserOnlineState();
    const hasPendingOfflineWrites = await hasOfflineOperations(storeCacheKey);
    if (invoiceRequestIdRef.current !== requestId) return;

    if (shouldReadFromOfflineCache(isOnline, hasPendingOfflineWrites)) {
      if (!isOnline) setIsOffline(true);
      const cachedOffline = await listCachedInvoices(storeCacheKey, query);
      applyResult(cachedOffline.items, cachedOffline.total);
      return;
    }

    const params: ListInvoicesParams = {
      page: query.page,
      limit: query.limit,
    };
    if (query.search.trim()) params.search = query.search.trim();
    const result: InvoicesListResult = await listInvoices(params);
    if (invoiceRequestIdRef.current !== requestId) return;

    await upsertCachedInvoices(storeCacheKey, result.items);
    applyResult(result.items, result.total);
  } catch (err) {
    if (invoiceRequestIdRef.current !== requestId) return;

    if (isNetworkFailure(err)) {
      setIsOffline(true);
      const cachedOffline = await listCachedInvoices(storeCacheKey, query);
      applyResult(cachedOffline.items, cachedOffline.total);
      setInvoicesError(null);
    } else {
      const msg = err instanceof Error ? err.message : "تعذر تحميل الفواتير.";
      setInvoicesError(msg);
    }
  } finally {
    if (invoiceRequestIdRef.current === requestId) {
      setInvoicesLoading(false);
    }
  }
}, [getInvoicePageCacheKey, storeCacheKey]);
```

- [ ] **Step 5: Run AppStore tests and verify they pass**

Run:

```powershell
npm.cmd test -- src/store/AppStore.test.tsx
```

Expected: both AppStore tests pass.

- [ ] **Step 6: Commit invoice store cache**

Run:

```powershell
git add src/store/AppStore.tsx src/store/AppStore.test.tsx
git commit -m "feat: cache invoice pages in app store"
```

Expected: commit succeeds.

---

### Task 4: Invoice Page Loading UI Keeps Rows Visible

**Files:**
- Create: `src/pages/InvoicesPage.test.tsx`
- Modify: `src/pages/InvoicesPage.tsx`

- [ ] **Step 1: Write failing invoice loading UI test**

Create `src/pages/InvoicesPage.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage } from "./InvoicesPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../store/AppStore", () => ({
  useAppStore: () => ({
    invoices: [
      {
        id: "invoice-1",
        number: "INV-1",
        date: "2026-05-22T10:00:00.000Z",
        customerName: "Test Customer",
        items: [],
        total: 100,
        paid: 100,
        remaining: 0,
        paymentMethod: "cash",
      },
    ],
    invoicesLoading: true,
    invoicesError: null,
    invoicesQuery: {
      search: "",
      page: 1,
      limit: 20,
    },
    invoicesTotal: 40,
    setInvoicesQuery: vi.fn(),
    loadInvoiceDetail: vi.fn(),
    products: [],
    updateInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
  }),
}));

const renderInvoices = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<InvoicesPage />);
  });

  return { container, root };
};

const unmount = async (root: Root, container: HTMLElement) => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
};

describe("InvoicesPage loading state", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("keeps current invoice rows visible while a page refresh is loading", async () => {
    const { container, root } = await renderInvoices();

    expect(container.textContent).toContain("INV-1");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);

    await unmount(root, container);
  });
});
```

- [ ] **Step 2: Run invoice page test and verify it fails**

Run:

```powershell
npm.cmd test -- src/pages/InvoicesPage.test.tsx
```

Expected: fails because `InvoicesPage` renders skeleton rows whenever `invoicesLoading` is true, even when rows exist.

- [ ] **Step 3: Update `InvoicesPage` loading rendering**

In `src/pages/InvoicesPage.tsx`, after `totalPages`, add:

```ts
const showInitialInvoicesLoading = invoicesLoading && invoices.length === 0;
const showInvoicesRefreshing = invoicesLoading && invoices.length > 0;
```

In the section header, after the search label, add:

```tsx
{showInvoicesRefreshing ? (
  <span className="text-xs font-normal text-zinc-400">جاري تحديث الفواتير...</span>
) : null}
```

Replace:

```tsx
{invoicesLoading ? (
```

with:

```tsx
{showInitialInvoicesLoading ? (
```

Leave the existing skeleton rows inside that branch.

- [ ] **Step 4: Run invoice page test**

Run:

```powershell
npm.cmd test -- src/pages/InvoicesPage.test.tsx
```

Expected: the invoice page loading-state test passes.

- [ ] **Step 5: Commit invoice loading UI**

Run:

```powershell
git add src/pages/InvoicesPage.tsx src/pages/InvoicesPage.test.tsx
git commit -m "feat: keep invoices visible while refreshing"
```

Expected: commit succeeds.

---

### Task 5: Full Verification

**Files:**
- No code changes unless verification exposes a defect.

- [ ] **Step 1: Run focused test set**

Run:

```powershell
npm.cmd test -- src/services/reportsData.test.ts src/pages/ReportsPage.test.tsx src/store/AppStore.test.tsx src/pages/InvoicesPage.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```powershell
npm.cmd test
```

Expected: all tests pass with exit code 0.

- [ ] **Step 3: Run production build**

Run:

```powershell
npm.cmd run build
```

Expected: TypeScript build and Vite build complete with exit code 0.

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short
```

Expected: only intended files are modified, or the working tree is clean after task commits.

- [ ] **Step 5: Commit verification fixes when present**

When verification-only fixes were required, commit them:

```powershell
git add src docs
git commit -m "fix: stabilize performance cache tests"
```

Expected: commit succeeds when verification produced additional changes.
