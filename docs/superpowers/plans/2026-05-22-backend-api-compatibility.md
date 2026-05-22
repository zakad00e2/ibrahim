# Backend API Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend compatible with the backend API changes around string money responses, decimal-safe calculations, structured errors, throttling, and invoice number lookup.

**Architecture:** Keep the existing UI/store models as `number`, but move API money parsing and local financial arithmetic through a new `decimal.js`-backed utility. Preserve current API client behavior while adding structured metadata to thrown errors.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, Dexie, `decimal.js`.

---

## File Structure

- Modify: `package.json`
  - Add `decimal.js` runtime dependency.
- Modify: `package-lock.json`
  - Lock the installed `decimal.js` version.
- Create: `src/utils/money.ts`
  - Central money parsing, arithmetic, comparison, min, and max helpers.
- Create: `src/utils/money.test.ts`
  - Regression tests for decimal-safe arithmetic and parsing.
- Modify: `src/utils/calculations.ts`
  - Use money helpers for invoice totals, costs, profits, debt totals, and payment validation.
- Modify: `src/utils/calculations.test.ts`
  - Add decimal-safety tests for existing calculation functions.
- Modify: `src/services/customersApi.ts`
  - Parse debt money fields with money helpers and remove obsolete hard-coded raw delete-500 workaround.
- Modify: `src/services/customersApi.test.ts`
  - Add string money mapping coverage and update soft-delete expectations.
- Modify: `src/services/debtsApi.ts`
  - Parse debt summary money strings with money helpers.
- Create: `src/services/debtsApi.test.ts`
  - Cover debt summary strings and payment response string fields.
- Modify: `src/services/invoicesApi.ts`
  - Parse invoice and invoice item money strings with money helpers, keep integer fields as integer parsing, and update by-number endpoint.
- Create: `src/services/invoicesApi.test.ts`
  - Cover invoice string money mapping and endpoint path.
- Modify: `src/services/productsApi.ts`
  - Parse product price money strings with money helpers while keeping stock/page fields numeric.
- Modify: `src/services/productsApi.test.ts`
  - Add product string price mapping coverage if existing tests do not cover it.
- Modify: `src/services/reportsApi.ts`
  - Parse report money strings with money helpers.
- Create: `src/services/reportsApi.test.ts`
  - Cover daily profit string money mapping.
- Modify: `src/services/apiClient.ts`
  - Add structured API error metadata and shared throttling message support.
- Create: `src/services/apiClient.test.ts`
  - Cover 429 retry metadata and Prisma error metadata.
- Modify: `src/services/authApi.ts`
  - Reuse the shared error builder for public auth endpoints.
- Modify: `src/services/authApi.test.ts`
  - Cover public auth 429 throttling behavior.
- Modify: `src/services/offlineSync.ts`
  - Use money helpers for offline invoice/debt/payment arithmetic.
- Modify: `src/services/offlineSync.test.ts`
  - Add decimal-safety coverage for offline invoice and debt payments.
- Modify: `src/store/AppStore.tsx`
  - Use money helpers in direct store-level financial calculations that are not already delegated to utilities.
- Modify: `src/services/reportsData.test.ts`
  - Keep regression coverage that report pagination requests `REPORTS_PAGE_SIZE = 100`.

---

### Task 1: Install `decimal.js`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install dependency**

Run:

```bash
npm install decimal.js
```

Expected: `package.json` gains a `decimal.js` dependency and `package-lock.json` is updated.

- [ ] **Step 2: Verify dependency is installed**

Run:

```bash
npm ls decimal.js
```

Expected: output includes `decimal.js@...` with no missing dependency error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add decimal money dependency"
```

---

### Task 2: Add Money Utilities With Failing Tests

**Files:**
- Create: `src/utils/money.test.ts`
- Create: `src/utils/money.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  maxMoney,
  minMoney,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  toMoneyNumber,
} from "./money";

describe("money utilities", () => {
  it("parses backend money strings into finite numbers", () => {
    expect(toMoneyNumber("60")).toBe(60);
    expect(toMoneyNumber("60.25")).toBe(60.25);
    expect(toMoneyNumber("", 7)).toBe(7);
    expect(toMoneyNumber(null, 7)).toBe(7);
    expect(toMoneyNumber("not money", 7)).toBe(7);
  });

  it("performs decimal-safe arithmetic before returning numbers", () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(subtractMoney("1.00", "0.9")).toBe(0.1);
    expect(multiplyMoney("0.1", 3)).toBe(0.3);
    expect(sumMoney(["0.1", "0.2", 0.3])).toBe(0.6);
  });

  it("compares and clamps mixed string and number values", () => {
    expect(compareMoney("50.00", 50)).toBe(0);
    expect(compareMoney("50.01", 50)).toBe(1);
    expect(compareMoney("49.99", 50)).toBe(-1);
    expect(minMoney("40.50", 50)).toBe(40.5);
    expect(maxMoney("40.50", 50)).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/utils/money.test.ts
```

Expected: FAIL because `src/utils/money.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/money.ts`:

```ts
import Decimal from "decimal.js";

export type MoneyInput = string | number | null | undefined;

const toDecimal = (value: MoneyInput, fallback = 0): Decimal => {
  if (value === undefined || value === null || value === "") {
    return new Decimal(fallback);
  }

  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : new Decimal(fallback);
  } catch {
    return new Decimal(fallback);
  }
};

export const toMoneyNumber = (value: MoneyInput, fallback = 0): number =>
  toDecimal(value, fallback).toNumber();

export const addMoney = (...values: MoneyInput[]): number =>
  values.reduce((sum, value) => sum.plus(toDecimal(value)), new Decimal(0)).toNumber();

export const subtractMoney = (left: MoneyInput, right: MoneyInput): number =>
  toDecimal(left).minus(toDecimal(right)).toNumber();

export const multiplyMoney = (left: MoneyInput, right: MoneyInput): number =>
  toDecimal(left).times(toDecimal(right)).toNumber();

export const sumMoney = (values: MoneyInput[]): number => addMoney(...values);

export const compareMoney = (left: MoneyInput, right: MoneyInput): -1 | 0 | 1 => {
  const comparison = toDecimal(left).cmp(toDecimal(right));
  return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
};

export const minMoney = (left: MoneyInput, right: MoneyInput): number =>
  Decimal.min(toDecimal(left), toDecimal(right)).toNumber();

export const maxMoney = (left: MoneyInput, right: MoneyInput): number =>
  Decimal.max(toDecimal(left), toDecimal(right)).toNumber();
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/utils/money.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/money.ts src/utils/money.test.ts
git commit -m "feat: add decimal money utilities"
```

---

### Task 3: Route Shared Calculations Through Money Utilities

**Files:**
- Modify: `src/utils/calculations.test.ts`
- Modify: `src/utils/calculations.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/utils/calculations.test.ts`:

```ts
import {
  calculateCustomerDebt,
  calculateInvoiceItemTotal,
  calculateItemsTotal,
  validateDebtPaymentAmount,
} from "./calculations";

describe("money-safe calculations", () => {
  it("calculates invoice totals without JavaScript float drift", () => {
    expect(calculateInvoiceItemTotal(0.1, 3)).toBe(0.3);
    expect(calculateItemsTotal([
      {
        productId: "p1",
        productName: "A",
        barcode: "1",
        price: 0.1,
        wholesalePrice: 0,
        quantity: 1,
        total: 0.1,
      },
      {
        productId: "p2",
        productName: "B",
        barcode: "2",
        price: 0.2,
        wholesalePrice: 0,
        quantity: 1,
        total: 0.2,
      },
    ])).toBe(0.3);
  });

  it("aggregates customer debt and validates payments with decimal comparison", () => {
    expect(calculateCustomerDebt([
      {
        id: "d1",
        invoiceId: "i1",
        description: "Debt",
        date: "2026-05-22T00:00:00.000Z",
        amount: 0.3,
        paid: 0,
        remaining: 0.1,
      },
      {
        id: "d2",
        invoiceId: "i2",
        description: "Debt",
        date: "2026-05-22T00:00:00.000Z",
        amount: 0.3,
        paid: 0,
        remaining: 0.2,
      },
    ])).toBe(0.3);
    expect(validateDebtPaymentAmount({ remaining: 0.3 }, 0.1 + 0.2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/utils/calculations.test.ts
```

Expected: FAIL on at least one decimal drift assertion before implementation.

- [ ] **Step 3: Write minimal implementation**

Update `src/utils/calculations.ts`:

```ts
import { addMoney, compareMoney, multiplyMoney, subtractMoney, sumMoney } from "./money";
```

Then replace money arithmetic:

```ts
export const calculateInvoiceItemTotal = (price: number, quantity: number) =>
  multiplyMoney(price, quantity);

export const calculateItemsTotal = (items: InvoiceItem[]) =>
  sumMoney(items.map((item) => multiplyMoney(item.price, item.quantity)));

export const calculateInvoiceItemCost = (wholesalePrice: number, quantity: number) =>
  multiplyMoney(wholesalePrice, quantity);

export const calculateItemsCost = (items: InvoiceItem[]) =>
  sumMoney(items.map((item) => calculateInvoiceItemCost(item.wholesalePrice, item.quantity)));

export const calculateItemsProfit = (items: InvoiceItem[]) =>
  sumMoney(items.map((item) => multiplyMoney(subtractMoney(item.price, item.wholesalePrice), item.quantity)));

export const calculateCustomerDebt = (debts: Customer["debts"]) =>
  sumMoney(debts.map((debt) => debt.remaining));
```

Update payment validation:

```ts
return compareMoney(amount, debt.remaining) === 1 ? "amount-exceeds-remaining" : null;
```

Update top-selling line total:

```ts
const lineTotal = item.total || calculateInvoiceItemTotal(item.price, item.quantity);
```

and total accumulation:

```ts
total: addMoney(current.total, lineTotal),
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/utils/calculations.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/calculations.ts src/utils/calculations.test.ts
git commit -m "feat: use decimal arithmetic in shared calculations"
```

---

### Task 4: Update API Error Handling

**Files:**
- Create: `src/services/apiClient.test.ts`
- Modify: `src/services/apiClient.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/apiClient.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson } from "./apiClient";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("apiClient errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes retry metadata and a readable message for 429 responses", async () => {
    mockFetch(
      new Response(JSON.stringify({ statusCode: 429, message: "ThrottlerException: Too Many Requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "45",
        },
      }),
    );

    await expect(getJson("/api/customers")).rejects.toMatchObject({
      message: "تجاوزت عدد المحاولات. حاول بعد 45 ثانية.",
      statusCode: 429,
      retryAfterSeconds: 45,
      body: {
        statusCode: 429,
        message: "ThrottlerException: Too Many Requests",
      },
    });
  });

  it("exposes Prisma error metadata from unified database errors", async () => {
    mockFetch(
      new Response(JSON.stringify({
        statusCode: 409,
        error: "Conflict",
        message: "سجل مكرر: القيمة موجودة مسبقاً (email)",
        code: "P2002",
        target: "email",
      }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getJson("/api/customers")).rejects.toMatchObject({
      message: "سجل مكرر: القيمة موجودة مسبقاً (email)",
      statusCode: 409,
      code: "P2002",
      target: "email",
      body: {
        code: "P2002",
        target: "email",
      },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/services/apiClient.test.ts
```

Expected: FAIL because `retryAfterSeconds`, `body`, `code`, and `target` are not exposed.

- [ ] **Step 3: Write minimal implementation**

In `src/services/apiClient.ts`, extend the payload type:

```ts
type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  code?: string;
  target?: string | string[];
};

export type ApiClientError = Error & {
  statusCode?: number;
  unauthorized?: boolean;
  code?: string;
  target?: string | string[];
  body?: unknown;
  retryAfterSeconds?: number;
};
```

Add helpers:

```ts
const getRetryAfterSeconds = (response: Response): number | undefined => {
  const raw = response.headers.get("retry-after");
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const buildThrottledMessage = (retryAfterSeconds?: number): string =>
  `تجاوزت عدد المحاولات. حاول بعد ${retryAfterSeconds ?? 60} ثانية.`;

export const buildApiError = (
  response: Response,
  payload: unknown,
  fallback: string,
): ApiClientError => {
  const retryAfterSeconds = response.status === 429 ? getRetryAfterSeconds(response) : undefined;
  const message = response.status === 429
    ? buildThrottledMessage(retryAfterSeconds)
    : normalizeMessage(payload, fallback);
  const err = new Error(message) as ApiClientError;

  err.statusCode = response.status;
  err.body = payload;
  if (retryAfterSeconds !== undefined) err.retryAfterSeconds = retryAfterSeconds;
  if (response.status === 401) err.unauthorized = true;

  if (isRecord(payload)) {
    const code = payload.code;
    const target = payload.target;
    if (typeof code === "string") err.code = code;
    if (typeof target === "string" || Array.isArray(target)) err.target = target as string | string[];
  }

  return err;
};
```

Update `handleResponse`:

```ts
if (!response.ok) {
  throw buildApiError(response, payload, fallback);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/services/apiClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/apiClient.ts src/services/apiClient.test.ts
git commit -m "feat: expose structured api errors"
```

---

### Task 5: Reuse Error Handling In Public Auth API

**Files:**
- Modify: `src/services/authApi.test.ts`
- Modify: `src/services/authApi.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/services/authApi.test.ts`:

```ts
it("shows a retry delay when public auth endpoints are throttled", async () => {
  mockFetch(
    new Response(JSON.stringify({ statusCode: 429, message: "ThrottlerException: Too Many Requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "30",
      },
    }),
  );

  await expect(
    superAdminLoginRequest({
      username: "superadmin",
      password: "wrong-password",
    }),
  ).rejects.toMatchObject({
    message: "تجاوزت عدد المحاولات. حاول بعد 30 ثانية.",
    statusCode: 429,
    retryAfterSeconds: 30,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/services/authApi.test.ts
```

Expected: FAIL because public auth calls throw a plain `Error`.

- [ ] **Step 3: Write minimal implementation**

Update import in `src/services/authApi.ts`:

```ts
import { buildApiError, postJson, readJson } from "./apiClient";
```

Update `postPublicJson` failure branch:

```ts
if (!response.ok) {
  throw buildApiError(response, payload, "تعذر الاتصال بالخادم. حاول مرة أخرى.");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/services/authApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/authApi.ts src/services/authApi.test.ts
git commit -m "feat: handle auth throttling metadata"
```

---

### Task 6: Update Invoice API Mapping And By-Number Endpoint

**Files:**
- Create: `src/services/invoicesApi.test.ts`
- Modify: `src/services/invoicesApi.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/invoicesApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getInvoiceByNumber, listInvoices } from "./invoicesApi";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("invoicesApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps backend string money fields into numeric invoice models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: "i1",
        number: 12,
        createdAt: "2026-05-22T10:00:00.000Z",
        total: "100.25",
        paid: "40.10",
        remaining: "60.15",
        paymentMethod: "PARTIAL",
        items: [{
          productId: "p1",
          productName: "Tea",
          barcode: "123",
          price: "10.05",
          unitCost: "7.01",
          total: "20.10",
          quantity: 2,
        }],
      }],
      meta: {
        total: 1,
        page: 1,
        limit: 100,
      },
    })));

    await expect(listInvoices({ page: 1, limit: 100 })).resolves.toEqual({
      items: [expect.objectContaining({
        total: 100.25,
        paid: 40.1,
        remaining: 60.15,
        items: [expect.objectContaining({
          price: 10.05,
          wholesalePrice: 7.01,
          total: 20.1,
        })],
      })],
      total: 1,
      page: 1,
      limit: 100,
    });
  });

  it("uses the backend by-number endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: "i12",
      number: 12,
      total: "10",
      paid: "10",
      remaining: "0",
      items: [],
      paymentMethod: "CASH",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await getInvoiceByNumber("12");

    expect(fetchMock).toHaveBeenCalledWith("/api/invoices/by-number/12", expect.objectContaining({
      method: "GET",
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/services/invoicesApi.test.ts
```

Expected: FAIL because by-number uses `/api/invoices/number/:n` before implementation.

- [ ] **Step 3: Write minimal implementation**

In `src/services/invoicesApi.ts`, import:

```ts
import { toMoneyNumber } from "../utils/money";
```

Use `toMoneyNumber` for invoice and item money fields:

```ts
const parseMoney = (value: unknown, fallback = 0): number =>
  toMoneyNumber(typeof value === "string" || typeof value === "number" ? value : undefined, fallback);
```

Keep integer parsing for `quantity`, `page`, `limit`, and counts:

```ts
const parseNum = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
```

Replace money field parsing in `mapInvoiceItem` and `mapInvoice` with `parseMoney(...)`.

Update endpoint:

```ts
`/api/invoices/by-number/${encodeURIComponent(number)}`
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/services/invoicesApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/invoicesApi.ts src/services/invoicesApi.test.ts
git commit -m "feat: map invoice money strings"
```

---

### Task 7: Update Customers And Debts API Mapping

**Files:**
- Modify: `src/services/customersApi.test.ts`
- Modify: `src/services/customersApi.ts`
- Create: `src/services/debtsApi.test.ts`
- Modify: `src/services/debtsApi.ts`

- [ ] **Step 1: Write failing customer tests**

Append to `src/services/customersApi.test.ts`:

```ts
import { getCustomerById } from "./customersApi";

it("maps backend string debt fields into numeric customer debt models", async () => {
  mockFetch(
    new Response(JSON.stringify({
      id: "c1",
      name: "Ibrahim",
      phone: "010",
      summary: {
        totalRemaining: "60.15",
      },
      debts: [{
        id: "d1",
        invoiceId: "i1",
        description: "Invoice",
        date: "2026-05-22T10:00:00.000Z",
        amount: "100.25",
        paid: "40.10",
        remaining: "60.15",
        payments: [{
          id: "p1",
          amount: "40.10",
          date: "2026-05-22T10:05:00.000Z",
        }],
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  await expect(getCustomerById("c1")).resolves.toMatchObject({
    debtBalance: 60.15,
    debts: [{
      amount: 100.25,
      paid: 40.1,
      remaining: 60.15,
      payments: [{ amount: 40.1 }],
    }],
  });
});
```

Update the old delete test:

```ts
it("treats soft-delete no-content responses as success", async () => {
  const fetchMock = mockFetch(new Response(null, { status: 204 }));

  await expect(deleteCustomer("customer 1")).resolves.toBeUndefined();

  expect(fetchMock).toHaveBeenCalledWith("/api/customers/customer%201", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
});
```

Remove the old assertion that rewrites raw `Internal server error` into a FK-specific delete message.

- [ ] **Step 2: Write failing debts tests**

Create `src/services/debtsApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCustomerDebts, payDebt } from "./debtsApi";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("debtsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps backend string debt summary fields into numbers", async () => {
    mockFetch(new Response(JSON.stringify({
      summary: {
        totalAmount: "500.30",
        totalRemaining: "40.10",
      },
      debts: [{
        id: "d1",
        invoiceId: "i1",
        amount: "100.20",
        paid: "60.10",
        remaining: "40.10",
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(getCustomerDebts("c1")).resolves.toEqual({
      totalDebt: 500.3,
      totalRemaining: 40.1,
      debts: [expect.objectContaining({
        amount: 100.2,
        paid: 60.1,
        remaining: 40.1,
      })],
    });
  });

  it("maps debt payment responses with string money fields", async () => {
    mockFetch(new Response(JSON.stringify({
      debt: {
        id: "d1",
        invoiceId: "i1",
        amount: "100.00",
        paid: "60.00",
        remaining: "40.00",
        payments: [{ id: "p1", amount: "60.00", date: "2026-05-22T00:00:00.000Z" }],
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(payDebt("d1", 60)).resolves.toMatchObject({
      amount: 100,
      paid: 60,
      remaining: 40,
      payments: [{ amount: 60 }],
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail where behavior is missing**

Run:

```bash
npm test -- src/services/customersApi.test.ts src/services/debtsApi.test.ts
```

Expected: customer delete raw-500 expectation is obsolete and new tests may expose money parser duplication.

- [ ] **Step 4: Write minimal implementation**

In `src/services/customersApi.ts`, import:

```ts
import { toMoneyNumber, sumMoney, subtractMoney } from "../utils/money";
```

Replace money parsing helpers:

```ts
const parseApiMoney = (value: unknown): number =>
  toMoneyNumber(typeof value === "string" || typeof value === "number" ? value : undefined);

const firstApiMoney = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = toMoneyNumber(typeof value === "string" || typeof value === "number" ? value : undefined, Number.NaN);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};
```

Use `sumMoney` in `calculateDebtBalance` and `subtractMoney` in fallback paid/remaining calculations.

Simplify delete:

```ts
export const deleteCustomer = async (id: string): Promise<void> => {
  await deleteJson(`/api/customers/${encodeURIComponent(id)}`);
};
```

In `src/services/debtsApi.ts`, import:

```ts
import { sumMoney, toMoneyNumber } from "../utils/money";
```

Replace `firstApiNumber` for money fields with `firstApiMoney` and use `sumMoney` for debt totals.

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- src/services/customersApi.test.ts src/services/debtsApi.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/customersApi.ts src/services/customersApi.test.ts src/services/debtsApi.ts src/services/debtsApi.test.ts
git commit -m "feat: map customer and debt money strings"
```

---

### Task 8: Update Products And Reports API Mapping

**Files:**
- Modify: `src/services/productsApi.test.ts`
- Modify: `src/services/productsApi.ts`
- Create: `src/services/reportsApi.test.ts`
- Modify: `src/services/reportsApi.ts`

- [ ] **Step 1: Write failing product test**

Append to `src/services/productsApi.test.ts`:

```ts
import { getProductById } from "./productsApi";

it("maps product price strings into numeric product models", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
    product: {
      id: "p1",
      name: "Tea",
      barcode: "123",
      price: "10.25",
      unitCost: "7.10",
      stock: 4,
      minStock: 1,
      isActive: true,
    },
  })));

  await expect(getProductById("p1")).resolves.toMatchObject({
    price: 10.25,
    wholesalePrice: 7.1,
  });
});
```

- [ ] **Step 2: Write failing reports test**

Create `src/services/reportsApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDailyProfit } from "./reportsApi";

describe("reportsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps daily profit money strings into numbers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        date: "2026-05-22",
        totalRevenue: "1200.50",
        totalCost: "700.10",
        netProfit: "500.40",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(getDailyProfit("2026-05-22")).resolves.toEqual({
      date: "2026-05-22",
      totalRevenue: 1200.5,
      totalCost: 700.1,
      netProfit: 500.4,
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail where behavior is missing**

Run:

```bash
npm test -- src/services/productsApi.test.ts src/services/reportsApi.test.ts
```

Expected: tests either fail on missing shared parsing or pass for existing `Number` behavior. If they pass immediately, keep them as regression tests and still route money parsing through `toMoneyNumber`.

- [ ] **Step 4: Write minimal implementation**

In `src/services/productsApi.ts`, import:

```ts
import { toMoneyNumber } from "../utils/money";
```

Use money parsing for `price`, `wholesalePrice`, `unitCost`, `costPrice`, and similar price fields:

```ts
const parseApiMoney = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = toMoneyNumber(typeof value === "string" || typeof value === "number" ? value : undefined, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
};
```

Keep count parsing with the existing numeric helper for `stock`, `minStock`, page, and limit.

In `src/services/reportsApi.ts`, import:

```ts
import { toMoneyNumber } from "../utils/money";
```

Replace `parseNum`:

```ts
const parseMoney = (v: unknown): number =>
  toMoneyNumber(typeof v === "string" || typeof v === "number" ? v : undefined);
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npm test -- src/services/productsApi.test.ts src/services/reportsApi.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/productsApi.ts src/services/productsApi.test.ts src/services/reportsApi.ts src/services/reportsApi.test.ts
git commit -m "feat: map product and report money strings"
```

---

### Task 9: Update Offline And Store Money Arithmetic

**Files:**
- Modify: `src/services/offlineSync.test.ts`
- Modify: `src/services/offlineSync.ts`
- Modify: `src/store/AppStore.tsx`

- [ ] **Step 1: Write failing offline tests**

Append to `src/services/offlineSync.test.ts`:

```ts
it("builds offline invoices with decimal-safe remaining balances", () => {
  const invoice = buildOfflineInvoice({
    items: [{
      productId: "p1",
      productName: "Tea",
      barcode: "123",
      price: 0.1,
      wholesalePrice: 0,
      quantity: 3,
      total: 0.3,
    }],
    paymentMethod: "partial",
    customerId: "c1",
    paidAmount: 0.1,
  }, [product], customer, new Date("2026-05-17T10:00:00.000Z"));

  expect(invoice.total).toBe(0.3);
  expect(invoice.paid).toBe(0.1);
  expect(invoice.remaining).toBe(0.2);
});

it("applies cached debt payments with decimal-safe balances", () => {
  const decimalCustomer: Customer = {
    ...customer,
    debtBalance: 0.3,
    debts: [{
      id: "d1",
      invoiceId: "i1",
      description: "Decimal debt",
      date: "2026-05-01T00:00:00.000Z",
      amount: 0.3,
      paid: 0,
      remaining: 0.3,
    }],
  };

  expect(applyCustomerDebtPayment([decimalCustomer], "c1", 0.1 + 0.2)[0]).toMatchObject({
    debtBalance: 0,
    debts: [{ paid: 0.3, remaining: 0, isPaid: true }],
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/services/offlineSync.test.ts
```

Expected: FAIL on decimal drift before implementation.

- [ ] **Step 3: Write minimal implementation**

In `src/services/offlineSync.ts`, import:

```ts
import { addMoney, compareMoney, maxMoney, minMoney, subtractMoney } from "../utils/money";
```

Replace direct money math:

```ts
remaining: maxMoney(subtractMoney(total, paid), 0),
```

Payment application:

```ts
if (compareMoney(remainingPayment, 0) <= 0 || compareMoney(debt.remaining, 0) <= 0) return debt;

const paidNow = minMoney(debt.remaining, remainingPayment);
remainingPayment = subtractMoney(remainingPayment, paidNow);
const remaining = maxMoney(subtractMoney(debt.remaining, paidNow), 0);

return {
  ...debt,
  paid: addMoney(debt.paid, paidNow),
  remaining,
  isPaid: compareMoney(remaining, 0) === 0 ? true : debt.isPaid,
};
```

In `src/store/AppStore.tsx`, import:

```ts
import { addMoney, compareMoney, maxMoney, subtractMoney, sumMoney } from "../utils/money";
```

Replace direct money reductions and comparisons:

```ts
totalDebt: sumMoney(debts.map((debt) => debt.amount)),
totalRemaining: sumMoney(debts.map((debt) => debt.remaining)),
```

Use `compareMoney(amount, totalDebt) === 1` and `compareMoney(paid, total) === 1` for payment validation, and `maxMoney(subtractMoney(total, paid), 0)` for remaining values.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npm test -- src/services/offlineSync.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/offlineSync.ts src/services/offlineSync.test.ts src/store/AppStore.tsx
git commit -m "feat: use decimal arithmetic in offline flows"
```

---

### Task 10: Verify Report Pagination Cap

**Files:**
- Modify: `src/services/reportsData.test.ts`

- [ ] **Step 1: Add regression assertion**

In `src/services/reportsData.test.ts`, keep or add:

```ts
expect(REPORTS_PAGE_SIZE).toBe(100);
```

The existing expectations should continue to assert:

```ts
expect(listProducts).toHaveBeenCalledWith({
  isActive: true,
  page: 1,
  limit: REPORTS_PAGE_SIZE,
});
expect(listCustomers).toHaveBeenCalledWith({
  page: 1,
  limit: REPORTS_PAGE_SIZE,
});
expect(listInvoices).toHaveBeenNthCalledWith(1, {
  page: 1,
  limit: REPORTS_PAGE_SIZE,
});
```

- [ ] **Step 2: Run test**

Run:

```bash
npm test -- src/services/reportsData.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/services/reportsData.test.ts
git commit -m "test: lock report pagination at backend max"
```

---

### Task 11: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted service and utility tests**

Run:

```bash
npm test -- src/utils/money.test.ts src/utils/calculations.test.ts src/services/apiClient.test.ts src/services/authApi.test.ts src/services/invoicesApi.test.ts src/services/customersApi.test.ts src/services/debtsApi.test.ts src/services/productsApi.test.ts src/services/reportsApi.test.ts src/services/offlineSync.test.ts src/services/reportsData.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS with TypeScript and Vite build success.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional committed changes or a clean worktree.

---

## Self-Review

- Spec coverage: money string responses, decimal arithmetic, structured API errors, 429 handling, pagination max, by-number endpoint, and soft-delete compatibility all map to tasks above.
- Placeholder scan: no task uses open placeholder wording or vague "add tests" instructions without concrete code.
- Type consistency: money helpers use `MoneyInput`; UI/store models remain `number`; API error metadata uses `ApiClientError`; all paths match repository structure.
