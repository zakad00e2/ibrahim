# Carton Edit Wholesale Recalculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recalculate and persist a product's per-piece wholesale price whenever carton details are enabled or changed during editing, without changing its existing stock.

**Architecture:** Keep the existing `deriveCartonValues` function as the one source of truth for carton arithmetic. In `ProductsPage`, calculate its wholesale component whenever valid carton data is enabled; only use its stock component when creating a new carton product. The existing `updateProduct` API already omits `cartonCount` during updates and validates the returned wholesale price, so it needs no change.

**Tech Stack:** React 18, TypeScript, Vitest, Decimal.js, existing AppStore mocks.

## Global Constraints

- Calculate `wholesalePrice` as `cartonPurchasePrice / piecesPerCarton`, rounded by `deriveCartonValues` to two decimal places using half-up rounding.
- Preserve `stock` during every edit, including when carton data is newly enabled.
- Do not send `cartonCount` when updating a product.
- Preserve the existing add-product behavior: initial carton stock is `cartonCount * piecesPerCarton`.
- Do not change behavior when carton data is disabled.

---

### Task 1: Cover carton-enabled product edits with failing UI tests

**Files:**
- Modify: `src/pages/ProductsPage.test.tsx:132-222`
- Production file under test: `src/pages/ProductsPage.tsx:74-80`, `src/pages/ProductsPage.tsx:169-188`

**Interfaces:**
- Consumes: `ProductsPage`, mocked `updateProduct(id, input)`, and the existing `Product` fixture with stock `4`.
- Produces: two regression tests requiring a calculated `wholesalePrice` in the update input and an unchanged `stock`.

- [ ] **Step 1: Add a local input helper to the carton-entry suite**

Add this helper inside the `describe("ProductsPage carton entry", ...)` block, after `afterEach`, so both new tests can enter values by Arabic field label:

```ts
const setInput = (label: string, value: string) => {
  const input = Array.from(document.querySelectorAll("input")).find((candidate) =>
    candidate.parentElement?.textContent?.includes(label),
  );
  if (!(input instanceof HTMLInputElement)) throw new Error(`Missing ${label}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
```

- [ ] **Step 2: Write a failing test for enabling carton data on a legacy product**

Append this test to the carton-entry suite. It opens the existing product for editing, enables carton data, and proves that saving must derive `180 / 12 = 15` while retaining the original stock of `4`:

```ts
it("derives wholesale price when carton data is enabled while editing a legacy product", async () => {
  mounted = await renderProductsPage();
  await act(async () => findButtonByText(mounted!.container, "تعديل").click());

  const checkbox = document.querySelector('input[type="checkbox"]');
  if (!(checkbox instanceof HTMLInputElement)) throw new Error("Carton toggle was not rendered");
  await act(async () => checkbox.click());

  await act(async () => {
    setInput("عدد القطع في الكرتونة", "12");
    setInput("سعر شراء الكرتونة", "180");
    setInput("سعر بيع الكرتونة", "240");
  });
  await act(async () => {
    findButtonByText(document.body, "حفظ التعديل").click();
    await Promise.resolve();
  });

  expect(storeMocks.updateProduct).toHaveBeenCalledWith("product-1", expect.objectContaining({
    piecesPerCarton: 12,
    cartonPurchasePrice: 180,
    cartonSalePrice: 240,
    wholesalePrice: 15,
    stock: 4,
  }));
});
```

- [ ] **Step 3: Write a failing test for changing existing carton data**

Temporarily update `storeMocks.product` inside the test with carton values, then change the purchase price to prove that the new derived price is sent while stock remains `4`:

```ts
it("recalculates wholesale price after carton purchase price changes during editing", async () => {
  storeMocks.product = {
    ...storeMocks.product,
    piecesPerCarton: 12,
    cartonPurchasePrice: 180,
    cartonSalePrice: 240,
  };
  mounted = await renderProductsPage();
  await act(async () => findButtonByText(mounted!.container, "تعديل").click());

  await act(async () => setInput("سعر شراء الكرتونة", "240"));
  expect(document.body.textContent).toContain("سعر جملة القطعة المحسوب");

  await act(async () => {
    findButtonByText(document.body, "حفظ التعديل").click();
    await Promise.resolve();
  });

  expect(storeMocks.updateProduct).toHaveBeenCalledWith("product-1", expect.objectContaining({
    cartonPurchasePrice: 240,
    wholesalePrice: 20,
    stock: 4,
  }));
});
```

- [ ] **Step 4: Run the focused test to verify RED**

Run:

```powershell
npm test -- src/pages/ProductsPage.test.tsx
```

Expected: both new tests fail because editing currently returns `null` from `cartonWholesalePreview` and keeps the prior manual wholesale value.

### Task 2: Derive carton wholesale price during edit and make the tests pass

**Files:**
- Modify: `src/pages/ProductsPage.tsx:74-80`
- Modify: `src/pages/ProductsPage.tsx:169-188`
- Test: `src/pages/ProductsPage.test.tsx:132-222`

**Interfaces:**
- Consumes: `ProductForm.cartonEnabled`, `piecesPerCarton`, `cartonPurchasePrice`, `editingProduct`, and `deriveCartonValues({ cartonCount, piecesPerCarton, cartonPurchasePrice })`.
- Produces: `cartonWholesalePreview: number | null` for display and `effectiveWholesalePrice: number | null` for the add/update input.

- [ ] **Step 1: Allow the preview to calculate in both create and edit modes**

In the `cartonWholesalePreview` memo, remove the `editingProduct` condition. Keep all existing validation and derive with `cartonCount: 1`, because only the wholesale component is used for the preview:

```ts
const cartonWholesalePreview = useMemo(() => {
  if (!form.cartonEnabled) return null;
  const piecesPerCarton = parseLocalizedNumber(form.piecesPerCarton);
  const cartonPurchasePrice = parseLocalizedNumber(form.cartonPurchasePrice);
  if (piecesPerCarton === null || cartonPurchasePrice === null || !Number.isInteger(piecesPerCarton) || piecesPerCarton <= 0 || cartonPurchasePrice < 0) return null;
  return deriveCartonValues({ cartonCount: 1, piecesPerCarton, cartonPurchasePrice }).wholesalePrice;
}, [form.cartonEnabled, form.cartonPurchasePrice, form.piecesPerCarton]);
```

- [ ] **Step 2: Separate stock derivation from wholesale derivation in submit**

Replace the create-only `derived` value with a carton-data-derived value for all valid carton forms. Use `cartonCount` only for the new-product stock value; preserve the parsed `stock` value for updates:

```ts
const derivedCartonValues = form.cartonEnabled
  ? deriveCartonValues({
      cartonCount: isCreatingCartonProduct ? cartonCount! : 1,
      piecesPerCarton: piecesPerCarton!,
      cartonPurchasePrice: cartonPurchasePrice!,
    })
  : null;
const effectiveWholesalePrice = derivedCartonValues?.wholesalePrice ?? wholesalePrice;
const effectiveStock = isCreatingCartonProduct ? derivedCartonValues!.stock : stock;
```

Pass `effectiveStock` as the `stock` property of `input`. Retain the existing `cartonCount` spread that is limited to `isCreatingCartonProduct`.

- [ ] **Step 3: Run the focused test to verify GREEN**

Run:

```powershell
npm test -- src/pages/ProductsPage.test.tsx
```

Expected: all tests pass, including the two edit regressions and the existing new-carton product test.

- [ ] **Step 4: Run focused type and API regressions**

Run:

```powershell
npm test -- src/utils/carton.test.ts src/services/productsApi.test.ts src/pages/ProductsPage.test.tsx
npm run build
git diff --check
```

Expected: all commands exit successfully and no whitespace errors are reported.

- [ ] **Step 5: Commit the implementation**

```powershell
git add -- src/pages/ProductsPage.tsx src/pages/ProductsPage.test.tsx
git commit -m "fix: recalculate wholesale price on carton edits"
```

## Plan Self-Review

- Spec coverage: Task 1 requires regressions for enabling carton data on a legacy product and editing existing carton data; Task 2 calculates and submits the correct wholesale price while preserving update stock and add-product stock behavior.
- Constraint coverage: the plan keeps `cartonCount` limited to creates, preserves non-carton behavior via the nullable derived value, and keeps the existing Decimal.js rounding path.
- Placeholder scan: the plan has no deferred work markers or unspecified test cases.
- Type consistency: all referenced names are existing `ProductsPage` values or are defined in Task 2; the API continues to receive the established `input` shape.
