# Manual Carton Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the manually entered product quantity for carton-enabled product creation while retaining automatic per-piece wholesale pricing.

**Architecture:** `ProductsPage` currently derives both stock and wholesale price with `deriveCartonValues` when a carton product is created. The page will instead submit its parsed manual `stock` field and use the existing helper only for wholesale price. The persisted `Product.stock` value is already the source displayed in the product list and used for carton-sale stock deductions, so no list or invoice changes are needed.

**Tech Stack:** React, TypeScript, Vitest, decimal.js

## Global Constraints

- Do not migrate, rewrite, or infer stock for existing products.
- Keep `cartonCount` validation and its creation payload metadata unchanged.
- Keep carton sale behavior and `piecesPerCarton`-based inventory deduction unchanged.
- Keep the automatic per-piece wholesale price rounded to two decimal places.

---

## File structure

- Modify: `src/pages/ProductsPage.test.tsx` — prove the creation form submits manual stock for a carton product.
- Modify: `src/pages/ProductsPage.tsx` — stop replacing manual stock with `cartonCount * piecesPerCarton` during submission.
- Create: `docs/superpowers/specs/2026-08-10-manual-carton-stock-design.md` — record the approved behavior.
- Create: `docs/superpowers/plans/2026-08-10-manual-carton-stock.md` — record this implementation plan.

### Task 1: Preserve manually entered carton stock on product creation

**Files:**

- Modify: `src/pages/ProductsPage.test.tsx:185-220`
- Modify: `src/pages/ProductsPage.tsx:184-205`

**Interfaces:**

- Consumes: `ProductForm.stock` as a localized numeric string, parsed by `parseLocalizedNumber`.
- Consumes: `deriveCartonValues({ cartonCount, piecesPerCarton, cartonPurchasePrice })`, using its `wholesalePrice` result only.
- Produces: the `addProduct` payload with `stock: number` equal to the manually entered form quantity.

- [x] **Step 1: Write the failing test**

In the existing `submits a carton product without a manually entered wholesale price` test, populate the `الكمية` field with `100` and change the `addProduct` expectation to this exact payload subset:

```ts
expect(storeMocks.addProduct).toHaveBeenCalledWith(expect.objectContaining({
  wholesalePrice: 0.83,
  stock: 100,
}));
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm test -- src/pages/ProductsPage.test.tsx
```

Expected: the carton creation assertion fails because the current payload contains `stock: 96` from `4 * 24` rather than `100`.

- [x] **Step 3: Implement the minimal production change**

In `handleSubmit`, retain the carton calculation only to obtain `wholesalePrice`. Change the submitted stock expression from:

```ts
stock: derived?.stock ?? stock,
```

to:

```ts
stock,
```

Do not alter carton validation, carton metadata, or the `effectiveWholesalePrice` expression.

- [x] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm test -- src/pages/ProductsPage.test.tsx
```

Expected: PASS, including the creation test that asserts `stock: 100` and `wholesalePrice: 0.83`.

- [x] **Step 5: Run the relevant regression tests and production build**

Run:

```powershell
npm test -- src/pages/ProductsPage.test.tsx src/utils/carton.test.ts src/pages/CashierPage.test.tsx src/services/offlineSync.test.ts
npm run build
```

Expected: all selected tests and the TypeScript/Vite production build pass.

- [x] **Step 6: Commit the verified change**

Run:

```powershell
git add src/pages/ProductsPage.tsx src/pages/ProductsPage.test.tsx docs/superpowers/specs/2026-08-10-manual-carton-stock-design.md docs/superpowers/plans/2026-08-10-manual-carton-stock.md
git commit -m "fix: preserve manual carton stock"
```

Do not stage `tsconfig.app.tsbuildinfo`; it is a generated workspace artifact.
