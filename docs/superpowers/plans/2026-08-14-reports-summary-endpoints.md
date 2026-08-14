# Reports Summary Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make report summary cards load from authoritative aggregate endpoints so total debt is stable and the cards do not wait for per-customer or per-invoice detail requests.

**Architecture:** Add typed mappers for the existing store-debt and daily-sales aggregate endpoints. Remove customers and customer-debt hydration from the lower-table dataset, then let `ReportsPage` load daily profit, daily sales, debt summary, and lower-table data as independent state streams with stale-response guards.

**Tech Stack:** React 18, TypeScript 5.6, Vitest 4, existing `getJson` API client, `decimal.js`-backed money helpers.

## Global Constraints

- Frontend-only change; use the already deployed backend endpoints.
- Total debt must come only from `GET /api/debts/summary` field `totalRemaining`.
- Selected-date invoice count must come only from `GET /api/invoices/daily-sales?date=YYYY-MM-DD` field `summary.invoiceCount`.
- A failed aggregate request must never be converted into a partial or false zero.
- Lower tables must load independently from summary cards.
- Keep the existing meaning of the all-time top-products table.
- Use test-first development and run each test in red and green states.

---

### Task 1: Store Debt Summary API

**Files:**
- Modify: `src/services/debtsApi.ts`
- Test: `src/services/debtsApi.test.ts`

**Interfaces:**
- Consumes: `getJson(path: string): Promise<unknown>` and `toMoneyNumber`.
- Produces: `StoreDebtSummary` and `getStoreDebtSummary(): Promise<StoreDebtSummary>`.

- [ ] **Step 1: Write the failing aggregate-debt test**

Add `getStoreDebtSummary` to the test import and add:

```ts
it("maps the authoritative store debt summary from money strings", async () => {
  const fetchMock = mockFetch(new Response(JSON.stringify({
    totalDebts: 115,
    totalAmount: "11316",
    totalPaid: "1430",
    totalRemaining: "9886",
    unpaidCount: 87,
    unpaidRemaining: "9886",
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));

  await expect(getStoreDebtSummary()).resolves.toEqual({
    totalDebts: 115,
    totalAmount: 11316,
    totalPaid: 1430,
    totalRemaining: 9886,
    unpaidCount: 87,
    unpaidRemaining: 9886,
  });
  expect(fetchMock).toHaveBeenCalledWith("/api/debts/summary", expect.objectContaining({ method: "GET" }));
});
```

This catches a missing endpoint, a wrong route, or treating backend money strings as strings.

- [ ] **Step 2: Run the debt test and verify red**

Run:

```powershell
npm.cmd test -- src/services/debtsApi.test.ts
```

Expected: TypeScript/test import failure because `getStoreDebtSummary` is not exported.

- [ ] **Step 3: Implement the minimal store-summary mapper**

Add near `getCustomerDebts`:

```ts
export type StoreDebtSummary = {
  totalDebts: number;
  totalAmount: number;
  totalPaid: number;
  totalRemaining: number;
  unpaidCount: number;
  unpaidRemaining: number;
};

const mapStoreDebtSummary = (payload: unknown): StoreDebtSummary => {
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  if (!isRecord(data)) throw new Error("invalid store debt summary response");

  return {
    totalDebts: firstApiNumber(data.totalDebts) ?? 0,
    totalAmount: firstApiNumber(data.totalAmount) ?? 0,
    totalPaid: firstApiNumber(data.totalPaid) ?? 0,
    totalRemaining: firstApiNumber(data.totalRemaining) ?? 0,
    unpaidCount: firstApiNumber(data.unpaidCount) ?? 0,
    unpaidRemaining: firstApiNumber(data.unpaidRemaining) ?? 0,
  };
};

export const getStoreDebtSummary = async (): Promise<StoreDebtSummary> => {
  return mapStoreDebtSummary(await getJson("/api/debts/summary"));
};
```

- [ ] **Step 4: Run the debt test and verify green**

Run:

```powershell
npm.cmd test -- src/services/debtsApi.test.ts
```

Expected: all debt API tests pass.

- [ ] **Step 5: Commit the API unit**

```powershell
git add src/services/debtsApi.ts src/services/debtsApi.test.ts
git commit -m "feat: add store debt summary api"
```

---

### Task 2: Daily Sales Summary API

**Files:**
- Modify: `src/services/reportsApi.ts`
- Test: `src/services/reportsApi.test.ts`

**Interfaces:**
- Consumes: `getJson(path: string): Promise<unknown>` and the existing `parseMoney` helper.
- Produces: `DailySalesSummary` and `getDailySales(date: string): Promise<DailySalesSummary>`.

- [ ] **Step 1: Write the failing daily-sales test**

Add `getDailySales` to the test import and add:

```ts
it("maps daily sales and requests the selected encoded date", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    date: "2026-08-14",
    summary: {
      invoiceCount: 3,
      totalSales: "314",
      totalPaid: "84",
      totalCash: "0",
      totalOnline: "0",
      totalDebt: "230",
    },
    invoices: [],
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(getDailySales("2026-08-14")).resolves.toEqual({
    date: "2026-08-14",
    invoiceCount: 3,
    totalSales: 314,
    totalPaid: 84,
    totalCash: 0,
    totalOnline: 0,
    totalDebt: 230,
  });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/invoices/daily-sales?date=2026-08-14",
    expect.objectContaining({ method: "GET" }),
  );
});
```

This catches a wrong route, an omitted date, or leaving summary money as strings.

- [ ] **Step 2: Run the reports API test and verify red**

```powershell
npm.cmd test -- src/services/reportsApi.test.ts
```

Expected: import failure because `getDailySales` is not exported.

- [ ] **Step 3: Implement daily-sales mapping**

Add:

```ts
export type DailySalesSummary = {
  date: string;
  invoiceCount: number;
  totalSales: number;
  totalPaid: number;
  totalCash: number;
  totalOnline: number;
  totalDebt: number;
};

export const getDailySales = async (date: string): Promise<DailySalesSummary> => {
  const payload = await getJson(
    `/api/invoices/daily-sales?date=${encodeURIComponent(date)}`,
  );
  const dto = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  const summary = isRecord(dto) && isRecord(dto.summary) ? dto.summary : undefined;
  if (!isRecord(dto) || !summary) throw new Error("invalid daily sales response");

  return {
    date: String(dto.date ?? date),
    invoiceCount: Math.max(0, Math.trunc(parseMoney(summary.invoiceCount))),
    totalSales: parseMoney(summary.totalSales),
    totalPaid: parseMoney(summary.totalPaid),
    totalCash: parseMoney(summary.totalCash),
    totalOnline: parseMoney(summary.totalOnline),
    totalDebt: parseMoney(summary.totalDebt),
  };
};
```

- [ ] **Step 4: Run the reports API test and verify green**

```powershell
npm.cmd test -- src/services/reportsApi.test.ts
```

Expected: all reports API tests pass.

- [ ] **Step 5: Commit the daily-sales unit**

```powershell
git add src/services/reportsApi.ts src/services/reportsApi.test.ts
git commit -m "feat: add daily sales summary api"
```

---

### Task 3: Remove Customer Debt N+1 Loading

**Files:**
- Modify: `src/services/reportsData.ts`
- Test: `src/services/reportsData.test.ts`

**Interfaces:**
- Consumes: existing product and invoice list/detail APIs.
- Produces: `ReportsDataset = { products: Product[]; invoices: Invoice[] }` and unchanged `loadReportsDataset()`.

- [ ] **Step 1: Rewrite the dataset contract test first**

Remove customer/debt mocks and fixtures. Change the complete-data test to expect only products and invoices, then add this assertion after calling `loadReportsDataset()`:

```ts
expect(dataset).toEqual({
  products: productsPage,
  invoices: [invoicesPageOne[0], hydratedInvoice],
});
```

Keep the pagination and bounded invoice-hydration coverage. Remove debt-concurrency expectations because customer debt hydration is no longer part of this service.

This catches reintroduction of customer loading into the lower-table dataset because the new return contract excludes customers and the test module no longer provides customer/debt implementations.

- [ ] **Step 2: Run the dataset test and verify red**

```powershell
npm.cmd test -- src/services/reportsData.test.ts
```

Expected: the result still includes `customers` and the implementation still imports/calls customer services.

- [ ] **Step 3: Remove customers from the dataset implementation**

Apply these production changes:

```ts
import type { Invoice, Product } from "../types";
import { getInvoiceById, listInvoices, type InvoicesListResult } from "./invoicesApi";
import { listProducts, type ProductsListResult } from "./productsApi";

export type ReportsDataset = {
  products: Product[];
  invoices: Invoice[];
};
```

Delete `loadReportCustomers` and change the final loader to:

```ts
export const loadReportsDataset = async (): Promise<ReportsDataset> => {
  const [products, invoices] = await Promise.all([
    loadReportProducts(),
    loadReportInvoices(),
  ]);

  return { products, invoices };
};
```

- [ ] **Step 4: Run the dataset test and verify green**

```powershell
npm.cmd test -- src/services/reportsData.test.ts
```

Expected: pagination and invoice hydration tests pass with no customer debt requests.

- [ ] **Step 5: Commit the N+1 removal**

```powershell
git add src/services/reportsData.ts src/services/reportsData.test.ts
git commit -m "perf: remove report customer debt hydration"
```

---

### Task 4: Integrate Independent Summary Cards

**Files:**
- Create: `src/pages/ReportsPage.test.tsx`
- Modify: `src/pages/ReportsPage.tsx`

**Interfaces:**
- Consumes: `getStoreDebtSummary()`, `getDailyProfit(date)`, `getDailySales(date)`, and lightweight `loadReportsDataset()`.
- Produces: report cards whose debt and invoice count come from aggregate endpoints, with lower tables loading independently.

- [ ] **Step 1: Write the failing authoritative-summary page test**

Create a jsdom page test that mocks only external service boundaries and renders the real page. Use service fixtures matching the complete backend shapes. The core test is:

```tsx
it("renders debt and invoice count from aggregate summaries without waiting for tables", async () => {
  let resolveTables!: (value: ReportsDataset) => void;
  vi.mocked(loadReportsDataset).mockReturnValue(new Promise((resolve) => {
    resolveTables = resolve;
  }));
  vi.mocked(getDailyProfit).mockResolvedValue({
    date: "2026-08-14", totalRevenue: 314, totalCost: 200, netProfit: 114,
  });
  vi.mocked(getDailySales).mockResolvedValue({
    date: "2026-08-14", invoiceCount: 3, totalSales: 314, totalPaid: 84,
    totalCash: 0, totalOnline: 0, totalDebt: 230,
  });
  vi.mocked(getStoreDebtSummary).mockResolvedValue({
    totalDebts: 115, totalAmount: 11316, totalPaid: 1430,
    totalRemaining: 9886, unpaidCount: 87, unpaidRemaining: 9886,
  });

  const view = await renderReports();
  await flushPromises();

  expect(cardText(view.container, "إجمالي الديون")).toContain("٩٬٨٨٦");
  expect(cardText(view.container, "عدد فواتير اليوم")).toContain("٣");

  resolveTables({ products: [], invoices: [] });
  await flushPromises();
  await unmount(view);
});
```

Implement `cardText` in the test by locating the label element and returning its closest card `div` text. Mock `AnimatedDigits` as a transparent span so the assertion exercises the real page state and formatting rather than animation timing.

- [ ] **Step 2: Add the failing debt-error page test**

```tsx
it("does not replace a failed debt summary with a false zero", async () => {
  vi.mocked(getStoreDebtSummary).mockRejectedValue(new Error("network down"));
  const view = await renderReportsWithResolvedDefaults();
  await flushPromises();

  const debtCard = cardText(view.container, "إجمالي الديون");
  expect(debtCard).toContain("—");
  expect(debtCard).not.toContain("₪ ٠");
  await unmount(view);
});
```

- [ ] **Step 3: Add the failing stale-date response test**

Use deferred promises for two `getDailySales` calls. After the initial render, change the date input and resolve the newer response before the older one:

```tsx
let resolveOld!: (value: DailySalesSummary) => void;
let resolveNew!: (value: DailySalesSummary) => void;
vi.mocked(getDailySales)
  .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
  .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));

const view = await renderReports();
const dateInput = view.container.querySelector<HTMLInputElement>("#report-date");
if (!dateInput) throw new Error("report date input not found");

await act(async () => {
  dateInput.value = "2026-08-13";
  dateInput.dispatchEvent(new Event("change", { bubbles: true }));
});

await act(async () => {
  resolveNew({
    date: "2026-08-13", invoiceCount: 7, totalSales: 700, totalPaid: 700,
    totalCash: 700, totalOnline: 0, totalDebt: 0,
  });
});
await act(async () => {
  resolveOld({
    date: "2026-08-14", invoiceCount: 3, totalSales: 314, totalPaid: 84,
    totalCash: 0, totalOnline: 0, totalDebt: 230,
  });
});

const invoiceCard = cardText(view.container, "عدد فواتير اليوم المختار");
expect(invoiceCard).toContain("٧");
expect(invoiceCard).not.toContain("٣");
await unmount(view);
```

This catches removal of the date-request abort/generation guard.

- [ ] **Step 4: Run the page test and verify red**

```powershell
npm.cmd test -- src/pages/ReportsPage.test.tsx
```

Expected: failures because the page still derives debt from customers and invoice count from the all-invoice dataset.

- [ ] **Step 5: Implement independent page state and requests**

Make these structural changes:

```ts
import { getStoreDebtSummary, type StoreDebtSummary } from "../services/debtsApi";
import {
  getDailyProfit,
  getDailySales,
  type DailyProfit,
  type DailySalesSummary,
} from "../services/reportsApi";

const EMPTY_REPORTS_DATASET: ReportsDataset = { products: [], invoices: [] };
```

Add these states:

```ts
const [dailySales, setDailySales] = useState<DailySalesSummary | null>(null);
const [debtSummary, setDebtSummary] = useState<StoreDebtSummary | null>(null);
const [dailySalesLoading, setDailySalesLoading] = useState(false);
const [debtSummaryLoading, setDebtSummaryLoading] = useState(false);
const [dailySalesError, setDailySalesError] = useState<string | null>(null);
const [debtSummaryError, setDebtSummaryError] = useState<string | null>(null);
```

In the selected-date effect, set both date-specific loading flags, clear both date-specific values and errors, and call `getDailyProfit(selectedDate)` and `getDailySales(selectedDate)` under the existing aborted-controller guard. Each promise updates and clears only its own state. Because cleanup aborts the controller, neither an older success nor an older failure may write state after the date changes.

Add a mount-only debt effect:

```ts
useEffect(() => {
  let cancelled = false;
  setDebtSummaryLoading(true);
  setDebtSummaryError(null);

  getStoreDebtSummary()
    .then((data) => {
      if (!cancelled) setDebtSummary(data);
    })
    .catch((err: unknown) => {
      if (!cancelled) {
        setDebtSummaryError(toUserFacingMessage(err, "تعذر تحميل إجمالي الديون."));
      }
    })
    .finally(() => {
      if (!cancelled) setDebtSummaryLoading(false);
    });

  return () => {
    cancelled = true;
  };
}, []);
```

Remove `customers`, `getCustomerDebtTotal`, `isSameDay`, `selectedInvoices`, and `stats.totalDebt`. Derive:

```ts
const invoicesCount = dailySales?.invoiceCount ?? null;
const totalDebt = debtSummary?.totalRemaining ?? null;
```

Render null counts with `—`, render total debt through `displayValue(totalDebt)`, and apply opacity only from the corresponding card's loading flag. Keep table loading/error rendering based on `reportsLoading` and `reportsError` only.

- [ ] **Step 6: Run the page test and verify green**

```powershell
npm.cmd test -- src/pages/ReportsPage.test.tsx
```

Expected: aggregate values appear before tables, debt failure shows no false zero, and stale selected-date responses are ignored.

- [ ] **Step 7: Run all focused report tests**

```powershell
npm.cmd test -- src/services/debtsApi.test.ts src/services/reportsApi.test.ts src/services/reportsData.test.ts src/pages/ReportsPage.test.tsx
```

Expected: all focused files pass.

- [ ] **Step 8: Commit page integration**

```powershell
git add src/pages/ReportsPage.tsx src/pages/ReportsPage.test.tsx
git commit -m "fix: use authoritative report summaries"
```

---

### Task 5: Full Verification

**Files:**
- No planned production changes.

**Interfaces:**
- Consumes: the completed report summary flow.
- Produces: verified test and production-build evidence.

- [ ] **Step 1: Run the full test suite**

```powershell
npm.cmd test
```

Expected: every test passes with exit code 0 and no unhandled rejection.

- [ ] **Step 2: Run the production build**

```powershell
npm.cmd run build
```

Expected: TypeScript and Vite complete with exit code 0.

- [ ] **Step 3: Check diff quality and repository status**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no unintended files.

- [ ] **Step 4: Review the final commits**

```powershell
git log -6 --oneline
```

Expected: design, plan, API units, N+1 removal, and page integration commits are present in order.
