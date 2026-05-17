# Offline Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PWA caching, IndexedDB persistence, offline read fallback, and queued offline sale/debt writes to the React cashier app.

**Architecture:** Keep HTTP DTO mapping inside the existing API services and add a dedicated Dexie service for local persistence. `AppStore` remains the orchestration layer: successful network reads hydrate IndexedDB, network failures read from IndexedDB, offline writes enqueue operations and apply local optimistic state, and the online event drains the queue.

**Tech Stack:** React 18, Vite 6, TypeScript, `vite-plugin-pwa`, Workbox runtime caching, Dexie, Vitest, fake-indexeddb.

---

### Task 1: Dependencies And Tests

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/services/offlineDb.test.ts`

- [ ] **Step 1: Install runtime and test dependencies**

Run:

```bash
npm.cmd install dexie vite-plugin-pwa
npm.cmd install -D vitest fake-indexeddb
```

Expected: `package.json` gains `dexie`, `vite-plugin-pwa`, `vitest`, and `fake-indexeddb`.

- [ ] **Step 2: Add a test script**

Set `package.json` scripts to include:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write failing Dexie tests**

Create tests that import the wished-for API from `src/services/offlineDb.ts`:

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { offlineDb, queueOfflineOperation, replaceCachedProducts } from "./offlineDb";

describe("offlineDb", () => {
  beforeEach(async () => {
    await offlineDb.delete();
    await offlineDb.open();
  });

  it("replaces cached products without keeping stale rows", async () => {
    await replaceCachedProducts([
      { id: "p1", name: "Tea", barcode: "1", price: 10, wholesalePrice: 7, stock: 4, minStock: 1, isActive: true },
    ]);
    await replaceCachedProducts([]);

    await expect(offlineDb.products.toArray()).resolves.toEqual([]);
  });

  it("queues write operations with createdAt metadata", async () => {
    const id = await queueOfflineOperation({ type: "payDebt", payload: { debtId: "d1", amount: 25 } });
    const saved = await offlineDb.offlineQueue.get(id);

    expect(saved?.type).toBe("payDebt");
    expect(saved?.createdAt).toEqual(expect.any(String));
  });
});
```

Run:

```bash
npm.cmd test -- src/services/offlineDb.test.ts
```

Expected: FAIL because `src/services/offlineDb.ts` does not exist yet.

### Task 2: Dexie Offline Database

**Files:**
- Create: `src/services/offlineDb.ts`
- Modify: `src/services/offlineDb.test.ts`

- [ ] **Step 1: Implement the database schema**

Create a Dexie database with tables:

```ts
products: "id, barcode, name, isActive, stock"
customers: "id, name, phone"
invoices: "id, number, date, customerId"
debts: "id, invoiceId, date, remaining, isPaid"
offlineQueue: "++id, type, createdAt"
```

Use the existing `Product`, `Customer`, `Invoice`, `Debt`, and request types from `src/types/index.ts`.

- [ ] **Step 2: Implement cache replacement helpers**

Implement helpers named `replaceCachedProducts`, `replaceCachedCustomers`, `replaceCachedInvoices`, `replaceCachedDebts`, and `queueOfflineOperation`, each using a Dexie transaction.

- [ ] **Step 3: Run the focused tests**

Run:

```bash
npm.cmd test -- src/services/offlineDb.test.ts
```

Expected: PASS.

### Task 3: AppStore Offline Reads And State

**Files:**
- Modify: `src/store/AppStore.tsx`

- [ ] **Step 1: Add `isOffline` to the context**

Expose:

```ts
isOffline: boolean;
```

Initialize it from `navigator.onLine === false` and update it with `online` / `offline` window events.

- [ ] **Step 2: Cache successful network reads**

After successful `listProducts`, `listCustomers`, `listInvoices`, `getCustomerDebts`, `getCustomerById`, `getDebtById`, and `getInvoiceById` calls, write normalized data into Dexie with replacement or upsert helpers.

- [ ] **Step 3: Fall back only on network failures**

When `navigator.onLine === false` or a thrown error is a fetch/network failure, read from Dexie and set state from cached records. Preserve normal API validation/server errors instead of hiding them with cached data.

- [ ] **Step 4: Run TypeScript build**

Run:

```bash
npm.cmd run build
```

Expected: no TypeScript errors from the new context value or Dexie imports.

### Task 4: Offline Queue For Writes

**Files:**
- Modify: `src/services/offlineDb.ts`
- Modify: `src/store/AppStore.tsx`

- [ ] **Step 1: Queue the required offline writes**

When offline or a network failure occurs, queue:

```ts
{ type: "createInvoice", payload: SaleRequest }
{ type: "payCustomerDebt", payload: { customerId: string; amount: number; notes?: string } }
{ type: "payDebt", payload: { debtId: string; amount: number; notes?: string } }
```

- [ ] **Step 2: Apply local optimistic data**

For offline invoice creation, create a local invoice id like `offline-invoice-${Date.now()}` and reduce product stock locally. For debt payments, update customer debts locally using the same payment allocation logic already present in `AppStore`.

- [ ] **Step 3: Drain the queue on reconnect**

When the app receives the `online` event, process queued operations oldest-first, delete only successful items, refresh products/customers/invoices after successful drain, and leave failed items in the queue for the next retry.

### Task 5: PWA And Offline Banner

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Configure Vite PWA**

Add `VitePWA` with `registerType: "autoUpdate"`, generated service worker, manifest, Workbox precaching, and runtime caching for `/api/*` using `NetworkFirst`.

- [ ] **Step 2: Show the offline banner**

Use `useAppStore()` in `Layout` and render a top banner only when `isOffline` is true:

```tsx
<div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
  أنت غير متصل بالإنترنت — يتم عرض البيانات المحفوظة
</div>
```

- [ ] **Step 3: Final verification**

Run:

```bash
npm.cmd test -- src/services/offlineDb.test.ts
npm.cmd run build
```

Expected: tests pass and production build succeeds.
