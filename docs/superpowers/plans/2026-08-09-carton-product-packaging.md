# Carton Product Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create carton-based products without manual fractional cost calculations and sell those products by piece or carton without changing existing product behavior.

**Architecture:** Keep `Product.stock` as the canonical piece count. Persist optional carton metadata on new products, send an explicit `saleUnit` on invoice lines, and retain an optional per-line `stockQuantity` snapshot for correct stock handling in client, offline, print, and reporting flows. Legacy products and invoice lines omit the optional properties and default to piece behavior.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, Dexie, `decimal.js`, existing REST API.

## Global Constraints

- Never migrate, backfill, or overwrite existing product records; carton fields are nullable and optional.
- A product without `piecesPerCarton` remains piece-only and preserves every current create, edit, cashier, invoice, and offline behavior.
- `stock` always represents pieces; carton count is an initial-create input only and is never stored as the current stock representation.
- `price` is the user-entered sale price for one piece; only `wholesalePrice` is derived from carton purchase price divided by pieces per carton.
- The server, not the browser, is authoritative for carton price, carton cost, carton size, invoice total, profit, and inventory mutation when online.
- Preserve existing `InvoiceItem` fixtures and cached legacy data by treating absent `saleUnit` as `unit` and absent `stockQuantity` as `quantity`.
- Do not release the frontend carton buttons until the backend contract below is deployed and verified in staging.

---

## Backend Release Contract (Required Before Frontend Release)

This checkout contains only the React frontend; no backend source or migration directory is present. Implement the following contract in the backend repository before releasing the client tasks that submit carton products or carton invoice lines.

### Product contract

Add nullable product columns/API fields:

```ts
piecesPerCarton?: number;
cartonPurchasePrice?: number;
cartonSalePrice?: number;
```

For `POST /api/products`, accept `cartonCount` only together with all three carton fields. Validate positive integer carton count and pieces per carton, non-negative carton prices, then persist:

```ts
stock = cartonCount * piecesPerCarton;
wholesalePrice = cartonPurchasePrice / piecesPerCarton;
```

For product patches, accept the three persisted carton fields but reject `cartonCount`; stock remains the existing piece count unless an explicit regular stock adjustment is requested. Legacy requests and rows must return unchanged behavior and nullable carton fields.

### Invoice contract

Accept each request line as:

```ts
{ productId: string; quantity: number; saleUnit?: "unit" | "carton" }
```

Treat missing `saleUnit` as `"unit"`. For a carton line, load carton data from the stored product in the same transaction, reject absent carton data, calculate `stockQuantity = quantity * piecesPerCarton`, verify stock, and snapshot the resolved carton sale price, carton purchase cost, sale unit, and stock quantity on the invoice line. For unit lines, `stockQuantity = quantity`. Invoice edit, delete, stock restoration, reports, and invoice responses must use the stored line `stockQuantity` rather than raw `quantity`.

Backend staging acceptance request:

```json
{
  "items": [
    { "productId": "carton-product", "quantity": 2, "saleUnit": "unit" },
    { "productId": "carton-product", "quantity": 1, "saleUnit": "carton" }
  ],
  "paymentMethod": "CASH"
}
```

For a twelve-piece carton, assert that stock decreases by fourteen pieces, the two lines remain separate, and the carton line uses the stored carton sale price rather than a client-supplied value. Repeat with a legacy product and a request omitting `saleUnit`; assert unchanged piece-sale behavior.

## File Structure

- Modify: `src/types/index.ts`
  - Add optional carton properties to `Product`/`ProductInput` and optional sale-unit snapshots to `InvoiceItem`.
- Create: `src/utils/carton.ts`
  - Centralize carton derivation, invoice-line identity, and stock-consumption helpers.
- Create: `src/utils/carton.test.ts`
  - Unit-test carton math and legacy defaults.
- Modify: `src/services/productsApi.ts`
  - Map optional carton response fields and send carton create/update payloads.
- Modify: `src/services/productsApi.test.ts`
  - Cover legacy mapping and carton payload serialization.
- Modify: `src/pages/ProductsPage.tsx`
  - Add carton entry fields, previews, validation, and safe edit semantics.
- Modify: `src/pages/ProductsPage.test.tsx`
  - Cover calculated create submission and legacy-product editing.
- Modify: `src/services/invoicesApi.ts`
  - Serialize/parse `saleUnit` and `stockQuantity` with legacy defaults.
- Modify: `src/services/invoicesApi.test.ts`
  - Cover carton request/response mapping and legacy line mapping.
- Modify: `src/services/offlineSync.ts`
  - Resolve carton snapshots locally and aggregate actual stock consumption.
- Modify: `src/services/offlineSync.test.ts`
  - Cover mixed unit/carton offline stock behavior.
- Modify: `src/store/AppStore.tsx`
  - Validate grouped stock consumption and preserve carton line snapshots during online/offline sale completion.
- Modify: `src/store/AppStore.test.tsx`
  - Cover grouped availability and old unit-only drafts.
- Modify: `src/pages/CashierPage.tsx`
  - Add distinct piece/carton actions, invoice rows, stock limits, and printable labels.
- Modify: `src/pages/CashierPage.test.tsx`
  - Cover piece and carton rows for the same product and insufficient-stock behavior.
- Modify: `src/pages/InvoicesPage.tsx`
  - Render, edit, and key invoice lines by product plus sale unit.
- Modify: `src/pages/InvoicesPage.test.tsx`
  - Cover carton line labels and carton's piece-equivalent stock limit.

### Task 1: Define Shared Carton Types and Calculations

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/carton.ts`
- Create: `src/utils/carton.test.ts`

**Interfaces:**
- Produces `SaleUnit`, optional carton fields on `Product`, optional `saleUnit`/`stockQuantity` on `InvoiceItem`, `deriveCartonValues`, `getInvoiceItemKey`, and `getInvoiceItemStockQuantity`.
- Consumed by product API/UI, invoice API, offline sync, store, cashier, and invoices page.

- [ ] **Step 1: Write the failing carton utility tests**

Create `src/utils/carton.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveCartonValues, getInvoiceItemKey, getInvoiceItemStockQuantity } from "./carton";

describe("carton helpers", () => {
  it("derives initial piece stock and per-piece wholesale price", () => {
    expect(deriveCartonValues({ cartonCount: 3, piecesPerCarton: 12, cartonPurchasePrice: 180 }))
      .toEqual({ stock: 36, wholesalePrice: 15 });
  });

  it("keeps legacy invoice lines as piece sales", () => {
    expect(getInvoiceItemKey({ productId: "p1" })).toBe("p1:unit");
    expect(getInvoiceItemStockQuantity({ quantity: 4 })).toBe(4);
  });

  it("uses the persisted carton stock snapshot when present", () => {
    expect(getInvoiceItemKey({ productId: "p1", saleUnit: "carton" })).toBe("p1:carton");
    expect(getInvoiceItemStockQuantity({ quantity: 2, saleUnit: "carton", stockQuantity: 24 })).toBe(24);
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
npm test -- src/utils/carton.test.ts
```

Expected: FAIL because `src/utils/carton.ts` does not exist.

- [ ] **Step 3: Add the types and minimal helpers**

Add `SaleUnit` immediately after `PaymentMethod`, then append these exact members before the closing brace of the existing `Product`, `ProductInput`, and `InvoiceItem` types in `src/types/index.ts`:

```ts
export type SaleUnit = "unit" | "carton";

// Product members
piecesPerCarton?: number;
cartonPurchasePrice?: number;
cartonSalePrice?: number;

// ProductInput members
piecesPerCarton?: number;
cartonPurchasePrice?: number;
cartonSalePrice?: number;
cartonCount?: number;

// InvoiceItem members
saleUnit?: SaleUnit;
stockQuantity?: number;
```

Create `src/utils/carton.ts`:

```ts
import type { InvoiceItem, SaleUnit } from "../types";
import { toMoneyNumber } from "./money";

export const deriveCartonValues = ({
  cartonCount,
  piecesPerCarton,
  cartonPurchasePrice,
}: {
  cartonCount: number;
  piecesPerCarton: number;
  cartonPurchasePrice: number;
}) => ({
  stock: cartonCount * piecesPerCarton,
  wholesalePrice: toMoneyNumber(cartonPurchasePrice / piecesPerCarton),
});

export const getSaleUnit = (item: Pick<InvoiceItem, "saleUnit">): SaleUnit =>
  item.saleUnit === "carton" ? "carton" : "unit";

export const getInvoiceItemKey = (item: Pick<InvoiceItem, "productId" | "saleUnit">): string =>
  `${item.productId}:${getSaleUnit(item)}`;

export const getInvoiceItemStockQuantity = (
  item: Pick<InvoiceItem, "quantity" | "stockQuantity">,
): number => Number.isFinite(item.stockQuantity) ? Math.max(0, item.stockQuantity as number) : item.quantity;
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npm test -- src/utils/carton.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the shared contract**

```bash
git add src/types/index.ts src/utils/carton.ts src/utils/carton.test.ts
git commit -m "feat: add carton product domain helpers"
```

### Task 2: Support Carton Product Creation and Safe Legacy Mapping

**Files:**
- Modify: `src/services/productsApi.ts`
- Modify: `src/services/productsApi.test.ts`
- Modify: `src/pages/ProductsPage.tsx`
- Modify: `src/pages/ProductsPage.test.tsx`

**Interfaces:**
- Consumes `deriveCartonValues` and optional carton fields from Task 1.
- Produces valid product create/update payloads and a product form that submits calculated `stock`/`wholesalePrice` only for carton mode.

- [ ] **Step 1: Write API and form tests before implementation**

Add to `src/services/productsApi.test.ts` a mapper test for both shapes:

```ts
expect(mapProduct({ id: "legacy", name: "Legacy", barcode: "1", price: "8", stock: 9 }))
  .toMatchObject({ id: "legacy", stock: 9, piecesPerCarton: undefined });

expect(mapProduct({
  id: "carton", name: "Tea", barcode: "2", price: 5, stock: 24,
  piecesPerCarton: 12, cartonPurchasePrice: "180", cartonSalePrice: "240",
})).toMatchObject({ piecesPerCarton: 12, cartonPurchasePrice: 180, cartonSalePrice: 240 });
```

Add a ProductsPage test that opens «إضافة منتج», enables carton mode, enters three cartons of twelve pieces at purchase price 180, submits a manual piece sale price, and expects `addProduct` to receive `stock: 36`, `wholesalePrice: 15`, `piecesPerCarton: 12`, `cartonCount: 3`, and `cartonSalePrice`.

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:

```bash
npm test -- src/services/productsApi.test.ts src/pages/ProductsPage.test.tsx
```

Expected: FAIL because product carton fields and form controls are absent.

- [ ] **Step 3: Map carton fields and serialize the precise API payload**

In `src/services/productsApi.ts`, parse optional numeric carton fields only when the source is present; do not use `0` as a fallback. In `createProduct`, send `cartonCount` only for creates and preserve the existing payload for legacy products:

```ts
const cartonPayload = input.piecesPerCarton === undefined
  ? {}
  : {
      piecesPerCarton: requireFiniteNumber(input.piecesPerCarton, "piecesPerCarton"),
      cartonPurchasePrice: requireFiniteNumber(input.cartonPurchasePrice!, "cartonPurchasePrice"),
      cartonSalePrice: requireFiniteNumber(input.cartonSalePrice!, "cartonSalePrice"),
      cartonCount: requireFiniteNumber(input.cartonCount!, "cartonCount"),
    };
```

Use the same persisted carton fields without `cartonCount` in `updateProduct`.

- [ ] **Step 4: Implement carton mode in the product modal**

Extend `ProductForm` with `cartonEnabled`, `piecesPerCarton`, `cartonCount`, `cartonPurchasePrice`, and `cartonSalePrice`. Add this local parser before `handleSubmit`; return an Arabic validation message and stop submission whenever a number is missing, non-finite, non-integer, or not positive:

```ts
const parseCartonForm = (form: ProductForm):
  | { cartonCount: number; piecesPerCarton: number; cartonPurchasePrice: number; cartonSalePrice: number }
  | null => {
  const cartonCount = parseLocalizedNumber(form.cartonCount);
  const piecesPerCarton = parseLocalizedNumber(form.piecesPerCarton);
  const cartonPurchasePrice = parseLocalizedNumber(form.cartonPurchasePrice);
  const cartonSalePrice = parseLocalizedNumber(form.cartonSalePrice);

  if (
    cartonCount === null || piecesPerCarton === null || cartonPurchasePrice === null || cartonSalePrice === null ||
    !Number.isInteger(cartonCount) || !Number.isInteger(piecesPerCarton) || cartonCount <= 0 || piecesPerCarton <= 0 ||
    cartonPurchasePrice < 0 || cartonSalePrice < 0
  ) return null;

  return { cartonCount, piecesPerCarton, cartonPurchasePrice, cartonSalePrice };
};
```

On submit, call `deriveCartonValues` and override only the submitted `stock` and `wholesalePrice` in carton mode:

```ts
const carton = form.cartonEnabled ? parseCartonForm(form) : null;
const derived = carton ? deriveCartonValues(carton) : null;

const input = {
  name: form.name.trim(),
  barcode: form.barcode.trim(),
  price,
  wholesalePrice: derived?.wholesalePrice ?? wholesalePrice,
  stock: derived?.stock ?? stock,
  minStock,
  ...(carton ?? {}),
  isActive: true,
};
```

Render the preview as read-only Arabic copy: «المخزون الناتج: … قطعة» and «سعر جملة القطعة: …». When editing an existing carton product, populate carton size/prices but keep the existing piece `stock` field editable and hide `cartonCount`; never recompute stock during edit. A legacy product leaves carton mode disabled and retains the existing modal fields.

- [ ] **Step 5: Run targeted tests and type-check**

Run:

```bash
npm test -- src/services/productsApi.test.ts src/pages/ProductsPage.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit the product workflow**

```bash
git add src/services/productsApi.ts src/services/productsApi.test.ts src/pages/ProductsPage.tsx src/pages/ProductsPage.test.tsx
git commit -m "feat: add carton product entry workflow"
```

### Task 3: Preserve Sale Units Through API, Store, and Offline Sync

**Files:**
- Modify: `src/services/invoicesApi.ts`
- Modify: `src/services/invoicesApi.test.ts`
- Modify: `src/services/offlineSync.ts`
- Modify: `src/services/offlineSync.test.ts`
- Modify: `src/store/AppStore.tsx`
- Modify: `src/store/AppStore.test.tsx`

**Interfaces:**
- Consumes `getSaleUnit`, `getInvoiceItemKey`, and `getInvoiceItemStockQuantity` from Task 1.
- Produces sale requests that contain `saleUnit`, invoice mappers that default legacy data to unit behavior, and local stock checks that aggregate consumption across mixed rows.

- [ ] **Step 1: Write failing API, offline, and store tests**

Add invoice API assertions:

```ts
expect(postJson).toHaveBeenCalledWith("/api/invoices", expect.objectContaining({
  items: [
    { productId: "p1", quantity: 2, saleUnit: "unit" },
    { productId: "p1", quantity: 1, saleUnit: "carton" },
  ],
}));

expect(mapInvoice({ id: "i1", date: "2026-08-09", total: 12, items: [{ productId: "legacy", quantity: 3, price: 4 }] }).items[0]).toMatchObject({
  saleUnit: "unit", stockQuantity: 3,
});
```

Add an offline test with two piece units and one twelve-piece carton of the same product, and assert `applyOfflineSaleToProducts([{ id: "p1", stock: 20 }], items)` leaves stock `6`. Add an AppStore sale test that rejects a mixed request consuming more pieces than the product has.

- [ ] **Step 2: Run targeted tests to verify they fail**

Run:

```bash
npm test -- src/services/invoicesApi.test.ts src/services/offlineSync.test.ts src/store/AppStore.test.tsx
```

Expected: FAIL because requests omit `saleUnit` and local stock code only observes the first matching item.

- [ ] **Step 3: Extend invoice transport and response mapping**

In `src/services/invoicesApi.ts`, include `saleUnit: getSaleUnit(item)` in create and update request mapping. Parse response aliases `saleUnit`/`sale_unit` and `stockQuantity`/`stock_quantity`; when absent, return `saleUnit: "unit"` and `stockQuantity: quantity` so callers never need special-case old API data.

- [ ] **Step 4: Resolve local snapshots and aggregate actual piece consumption**

In `src/services/offlineSync.ts`, resolve carton price/cost and stock quantity from the cached product only for `saleUnit === "carton"`:

```ts
const isCarton = getSaleUnit(item) === "carton";
const piecesPerCarton = product?.piecesPerCarton;
if (isCarton && (!piecesPerCarton || product.cartonSalePrice === undefined || product.cartonPurchasePrice === undefined)) {
  throw new Error("تعذر بيع الكرتونة لأن بيانات التغليف غير مكتملة");
}

const stockQuantity = isCarton ? item.quantity * piecesPerCarton! : item.quantity;
const price = isCarton ? product!.cartonSalePrice! : product?.price ?? item.price;
const wholesalePrice = isCarton ? product!.cartonPurchasePrice! : product?.wholesalePrice ?? item.wholesalePrice;
```

Replace `find`-based stock subtraction with an aggregation keyed by product ID:

```ts
const soldByProductId = new Map<string, number>();
soldItems.forEach((item) => {
  soldByProductId.set(item.productId, (soldByProductId.get(item.productId) ?? 0) + getInvoiceItemStockQuantity(item));
});
```

Use that map for offline product updates.

In `src/store/AppStore.tsx`, create the same per-product requested-stock map before online/offline sale completion and reject any product where aggregate requested pieces exceed `product.stock`. Preserve `saleUnit` and `stockQuantity` when enriching a server invoice response.

- [ ] **Step 5: Run targeted tests and build**

Run:

```bash
npm test -- src/services/invoicesApi.test.ts src/services/offlineSync.test.ts src/store/AppStore.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit transaction and offline support**

```bash
git add src/services/invoicesApi.ts src/services/invoicesApi.test.ts src/services/offlineSync.ts src/services/offlineSync.test.ts src/store/AppStore.tsx src/store/AppStore.test.tsx
git commit -m "feat: preserve carton sales through invoice sync"
```

### Task 4: Add Piece and Carton Actions to the Cashier

**Files:**
- Modify: `src/pages/CashierPage.tsx`
- Modify: `src/pages/CashierPage.test.tsx`

**Interfaces:**
- Consumes carton product fields and Task 1 invoice helpers.
- Produces invoice lines keyed by product plus sale unit and sends their preserved `saleUnit` to Task 3.

- [ ] **Step 1: Write failing cashier behavior tests**

Add a carton-enabled product fixture with `stock: 24`, `piecesPerCarton: 12`, `cartonPurchasePrice: 180`, and `cartonSalePrice: 240`. Test that clicking the standard product action adds one `saleUnit: "unit"` row, clicking «إضافة كرتونة» adds a separate `saleUnit: "carton"` row priced at 240 with `stockQuantity: 12`, and clicking carton again when only fewer than twelve pieces remain renders the Arabic insufficient-stock notice.

- [ ] **Step 2: Run the cashier test to verify it fails**

Run:

```bash
npm test -- src/pages/CashierPage.test.tsx
```

Expected: FAIL because carton controls and separate line keys do not exist.

- [ ] **Step 3: Implement sale-unit-aware line operations**

Change cashier mutations to receive `saleUnit: SaleUnit`. Use `getInvoiceItemKey` for find/map/remove/render keys. Before adding or increasing either row, calculate pieces already reserved by every row for the product and compare the next aggregate to `product.stock`:

```ts
const requestedPieces = current
  .filter((item) => item.productId === product.id)
  .reduce((sum, item) => sum + getInvoiceItemStockQuantity(item), 0);
const nextPieces = requestedPieces + (saleUnit === "carton" ? product.piecesPerCarton! : 1);
if (nextPieces > product.stock) {
  setNotice({ type: "error", text: "لا يتوفر مخزون يكفي لإضافة كرتونة كاملة" });
  return current;
}
```

Create carton rows with carton sale/purchase snapshots and `stockQuantity = quantity * piecesPerCarton`. Recalculate a changed carton line's stock snapshot on every quantity change. Keep barcode scanning and primary product clicks mapped to `"unit"`.

- [ ] **Step 4: Add visible carton controls and labels**

On carton-configured product cards, render a secondary «إضافة كرتونة» button showing the carton sale price. Disable it when the remaining unreserved piece stock is below `piecesPerCarton`. In mobile cards, desktop table rows, and `PrintableInvoiceReceipt`, show `قطعة` or `كرتونة` next to the product name and use `getInvoiceItemKey(item)` for React keys and all line actions.

- [ ] **Step 5: Run cashier tests and build**

Run:

```bash
npm test -- src/pages/CashierPage.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit cashier support**

```bash
git add src/pages/CashierPage.tsx src/pages/CashierPage.test.tsx
git commit -m "feat: sell carton products from cashier"
```

### Task 5: Render and Edit Carton Lines in Invoice History

**Files:**
- Modify: `src/pages/InvoicesPage.tsx`
- Modify: `src/pages/InvoicesPage.test.tsx`

**Interfaces:**
- Consumes the optional line snapshots and `getInvoiceItemKey`/`getInvoiceItemStockQuantity` from Task 1.
- Produces invoice detail, print-ready history, and editing behavior that keep carton and unit rows distinct.

- [ ] **Step 1: Write failing invoice-history tests**

Add one invoice containing a unit row and a carton row for `productId: "p1"`. Assert the detail modal renders both rows with distinct `قطعة` and `كرتونة` labels and the carton quantity as carton count. Add an edit-limit test where a product has twelve pieces per carton and a carton invoice line; assert the maximum editable carton quantity is calculated from available pieces divided by twelve, not raw `product.stock`.

- [ ] **Step 2: Run invoice page tests to verify they fail**

Run:

```bash
npm test -- src/pages/InvoicesPage.test.tsx
```

Expected: FAIL because invoice rows are keyed and merged by `productId` only.

- [ ] **Step 3: Make invoice page operations sale-unit-aware**

Replace every `productId`-only row key, find, map, remove, and quantity updater in `src/pages/InvoicesPage.tsx` with an item key from `getInvoiceItemKey`. Preserve a line's `saleUnit`, `stockQuantity`, price, and wholesale cost when editing. For a carton line, set the editable ceiling to:

```ts
Math.floor(availablePieceStock / product.piecesPerCarton)
```

where `availablePieceStock` includes stock restored by the currently edited invoice's own line snapshots. Present the sale-unit label beside the item name in details and edit tables. When adding a new product during edit, keep the existing default piece sale; only show an additional carton-add action for carton-enabled products.

- [ ] **Step 4: Run invoice page tests and build**

Run:

```bash
npm test -- src/pages/InvoicesPage.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit invoice-history support**

```bash
git add src/pages/InvoicesPage.tsx src/pages/InvoicesPage.test.tsx
git commit -m "feat: display carton invoice lines"
```

### Task 6: Run Cross-Flow Regression Verification

**Files:**
- Modify only if a regression test fails: files named in Tasks 1–5.

**Interfaces:**
- Verifies the full feature contract across product entry, online sale, offline sale, invoice history, reports, printing, and legacy data.

- [ ] **Step 1: Add cross-flow regression fixtures**

Add or extend tests with these fixed values: twelve pieces per carton, purchase price 180, carton sale price 240, manual piece sale price 25, and initial count three cartons. Assert derived stock 36, piece wholesale 15, one carton sale uses price/cost 240/180 and stock quantity 12, and a mixed invoice with two pieces plus one carton consumes fourteen pieces.

- [ ] **Step 2: Run focused regression suites**

Run:

```bash
npm test -- src/utils/carton.test.ts src/services/productsApi.test.ts src/services/invoicesApi.test.ts src/services/offlineSync.test.ts src/store/AppStore.test.tsx src/pages/ProductsPage.test.tsx src/pages/CashierPage.test.tsx src/pages/InvoicesPage.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run the complete frontend verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, production build succeeds, and Git reports no whitespace errors.

- [ ] **Step 4: Verify staging backend compatibility manually**

Create one carton product and one legacy product in staging. Sell a carton and pieces from the carton product in one invoice, edit that invoice, then delete it. Confirm inventory, printed invoice lines, profit/cost reports, and invoice history use carton snapshots correctly. Sell the legacy product by barcode and confirm its request omits `saleUnit` or is accepted as `unit` without behavior change.

- [ ] **Step 5: Commit final regression coverage**

```bash
git add src/types/index.ts src/utils/carton.ts src/utils/carton.test.ts src/services/productsApi.ts src/services/productsApi.test.ts src/services/invoicesApi.ts src/services/invoicesApi.test.ts src/services/offlineSync.ts src/services/offlineSync.test.ts src/store/AppStore.tsx src/store/AppStore.test.tsx src/pages/ProductsPage.tsx src/pages/ProductsPage.test.tsx src/pages/CashierPage.tsx src/pages/CashierPage.test.tsx src/pages/InvoicesPage.tsx src/pages/InvoicesPage.test.tsx
git commit -m "test: cover carton product sale regressions"
```

## Plan Self-Review

- Spec coverage: Tasks 1–2 cover optional carton data and automatic product calculations; Tasks 3–5 cover sale-unit persistence, offline behavior, cashier, invoices, printing, reports through invoice snapshots, and legacy compatibility; Task 6 covers regression and staging acceptance.
- Backend gap: the backend implementation cannot be edited from this checkout. Its exact required data/API contract and staging acceptance check are documented above as a release prerequisite.
- Placeholder scan: no deferred implementation markers are present; every implementation task identifies files, interfaces, tests, commands, and behavior.
- Type consistency: `SaleUnit`, optional `Product` carton fields, optional `InvoiceItem.saleUnit`, optional `InvoiceItem.stockQuantity`, `deriveCartonValues`, `getInvoiceItemKey`, and `getInvoiceItemStockQuantity` use the same names in every task.
