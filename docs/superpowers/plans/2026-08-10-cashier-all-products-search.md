# Cashier All Products Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every active product in the cashier and search those products immediately by name or barcode.

**Architecture:** Keep the paginated `products` state for the products-management page. Add a separate `cashierProducts` dataset in `AppStore`, loaded from every active-products API page and cached in IndexedDB; `CashierPage` reads only that dataset. Search stays in `CashierPage` and filters the complete in-memory dataset after digit normalization.

**Tech Stack:** React 18, TypeScript, Vitest, Vite, Dexie, Tailwind CSS.

## Global Constraints

- Cashier products include active products only (`isActive: true`).
- Do not change products-management paging, filtering, or its existing `products` state.
- Use API pages of 100 products, stop after an empty/short page or the reported total, and guard the loop at 500 pages.
- Read all active cached products when offline or when the product request fails due to a network failure.
- Preserve the current barcode scan, stock validation, invoice draft, and product-card behavior.

---

## File Structure

- Modify: `src/store/AppStore.tsx` — own and load the full active-products dataset for the cashier.
- Modify: `src/store/AppStore.test.tsx` — prove the store loads all API pages and publishes the complete dataset.
- Modify: `src/pages/CashierPage.tsx` — render, search, and use the dedicated cashier dataset, including loading and error feedback.
- Modify: `src/pages/CashierPage.test.tsx` — prove a product beyond the management-page boundary is rendered and searchable.

### Task 1: Load a complete active-products dataset for the cashier

**Files:**
- Modify: `src/store/AppStore.tsx:136-162, 314-434, 1380-1456`
- Test: `src/store/AppStore.test.tsx:1-310`

**Interfaces:**
- Consumes: `listProducts({ isActive: true, page, limit: 100 })`, `listCachedProducts(storeCacheKey, { isActive: true, page: 1, limit: Number.MAX_SAFE_INTEGER })`, and `upsertCachedProducts(storeCacheKey, items)`.
- Produces: `cashierProducts: Product[]`, `cashierProductsLoading: boolean`, and `cashierProductsError: string | null` on `AppStoreValue` and `useAppStore()`.

- [ ] **Step 1: Write the failing store test for multi-page cashier loading**

  Add this test after the existing product-action test in `src/store/AppStore.test.tsx`:

  ```tsx
  it("loads every active product page for the cashier", async () => {
    const laterProduct = { ...existingProduct, id: "product-101", name: "Later product", barcode: "101" };
    productApiMocks.listProducts
      .mockResolvedValueOnce({ items: [existingProduct], total: 2, page: 1, limit: 100 })
      .mockResolvedValueOnce({ items: [laterProduct], total: 2, page: 2, limit: 100 });

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
  ```

- [ ] **Step 2: Run the focused store test to verify it fails**

  Run: `npm test -- src/store/AppStore.test.tsx`

  Expected: FAIL because `cashierProductsLoading` and `cashierProducts` do not exist on the store value.

- [ ] **Step 3: Add complete-dataset state and a paginated loader to `AppStore`**

  Extend `AppStoreValue` and provider state:

  ```tsx
  cashierProducts: Product[];
  cashierProductsLoading: boolean;
  cashierProductsError: string | null;

  const [cashierProducts, setCashierProducts] = useState<Product[]>([]);
  const [cashierProductsLoading, setCashierProductsLoading] = useState(false);
  const [cashierProductsError, setCashierProductsError] = useState<string | null>(null);
  ```

  Add `fetchCashierProducts` next to `fetchProducts`. It must: clear state when `storeCacheKey` is absent; read one unpaginated cache query when offline/pending writes; otherwise request `{ isActive: true, page, limit: 100 }` sequentially; append each page; stop when `items.length === 0`, collected items meet `total`, a page is short, or 500 pages have been requested; cache the final array with one `upsertCachedProducts` call; set the full array; and on a network failure replace it with the unpaginated active cache. For non-network errors, set `cashierProductsError` using `toUserFacingMessage(err, "تعذر تحميل منتجات الكاشير.")`.

  Trigger it in a `useEffect` whenever `isStoreSession`, `storeCacheKey`, or `fetchCashierProducts` changes. Reset all three cashier-product states in the existing store-session reset effect. Expose them in the memoized context value and dependency list.

- [ ] **Step 4: Run the focused store test to verify it passes**

  Run: `npm test -- src/store/AppStore.test.tsx`

  Expected: PASS, including the new two-page assertion and existing store tests.

- [ ] **Step 5: Commit the store dataset change**

  ```bash
  git add src/store/AppStore.tsx src/store/AppStore.test.tsx
  git commit -m "feat: load all active cashier products"
  ```

### Task 2: Render and search the full cashier dataset

**Files:**
- Modify: `src/pages/CashierPage.tsx:61-87, 178-189, 550-600`
- Test: `src/pages/CashierPage.test.tsx:18-110, 210-320`

**Interfaces:**
- Consumes: `cashierProducts: Product[]`, `cashierProductsLoading: boolean`, and `cashierProductsError: string | null` from `useAppStore()`.
- Produces: the full active product-card list, local name/barcode filtering, and explicit loading, error, and zero-results content in the cashier products section.

- [ ] **Step 1: Write the failing page test for a later product and local search**

  Add a fourth product to the `storeHarness.products` fixture named `"Later Coffee"` with barcode `"9876543210"`. Return it as `cashierProducts` from the mocked store while returning only the first three products as `products`. Then add:

  ```tsx
  it("shows and searches cashier products beyond the management page", async () => {
    const view = await renderCashier();

    expect(view.container.textContent).toContain("Later Coffee");

    const searchInput = view.container.querySelector('input[placeholder*="بحث"]');
    if (!(searchInput instanceof HTMLInputElement)) throw new Error("Search input was not rendered");

    await act(async () => {
      searchInput.value = "9876543210";
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const cards = view.container.querySelector('[aria-label="قائمة منتجات قابلة للتمرير العمودي"]');
    expect(cards?.textContent).toContain("Later Coffee");
    expect(cards?.textContent).not.toContain("Test Rice");
  });
  ```

- [ ] **Step 2: Run the focused page test to verify it fails**

  Run: `npm test -- src/pages/CashierPage.test.tsx`

  Expected: FAIL because the page still uses `products` rather than `cashierProducts`.

- [ ] **Step 3: Consume the complete dataset and add product-list states**

  Destructure `cashierProducts`, `cashierProductsLoading`, and `cashierProductsError` from the store. Replace the `filteredProducts` source and all product lookups used by the cashier (`findProductByBarcode`, quantity updates, and stock checks) with `cashierProducts` so a later-page product works after a click or barcode scan.

  In the product-card container, render exactly one of these before the map:

  ```tsx
  {cashierProductsLoading ? <p className="p-4 text-sm text-zinc-500">جار تحميل المنتجات...</p> : null}
  {cashierProductsError ? <p className="p-4 text-sm text-red-700">{cashierProductsError}</p> : null}
  {!cashierProductsLoading && !cashierProductsError && filteredProducts.length === 0 ? (
    <p className="p-4 text-sm text-zinc-500">لا توجد منتجات مطابقة للبحث.</p>
  ) : null}
  {!cashierProductsLoading && !cashierProductsError ? filteredProducts.map(/* existing card */) : null}
  ```

  Keep the existing `normalizeDigits(search).trim().toLowerCase()` matching logic and the existing card markup, click handler, zero-stock disablement, and scroll container classes.

- [ ] **Step 4: Run focused page and store tests to verify they pass**

  Run: `npm test -- src/pages/CashierPage.test.tsx src/store/AppStore.test.tsx`

  Expected: PASS; the later product appears, searching its barcode leaves it as the matching product, and existing invoice-draft behavior remains green.

- [ ] **Step 5: Commit the cashier UI change**

  ```bash
  git add src/pages/CashierPage.tsx src/pages/CashierPage.test.tsx
  git commit -m "feat: search all cashier products"
  ```

### Task 3: Verify the integrated behavior

**Files:**
- Modify: none.
- Test: `src/store/AppStore.test.tsx`, `src/pages/CashierPage.test.tsx`.

**Interfaces:**
- Consumes: completed store and page interfaces from Tasks 1 and 2.
- Produces: verified production build with no TypeScript errors.

- [ ] **Step 1: Run the complete automated test suite**

  Run: `npm test`

  Expected: PASS with no failing test files.

- [ ] **Step 2: Run the production build**

  Run: `npm run build`

  Expected: PASS; TypeScript completes and Vite emits the production bundle.

- [ ] **Step 3: Inspect the final diff and worktree status**

  Run: `git diff HEAD~2..HEAD --check` and `git status --short`

  Expected: no whitespace errors; no uncommitted changes from this feature.

