# Customer oldest-first pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the customer list from oldest to newest, with the UI's first page backed by the API's final page, without backend changes.

**Architecture:** The store first requests page 1 to learn the query total, calculates the mirrored backend page, then resolves that page and reverses its rows. The identical flow applies to the offline cache; customer creation refreshes rather than prepends a newest record to an oldest-first page.

**Tech Stack:** React 18, TypeScript, Vitest, Dexie offline cache.

## Global Constraints

- Do not change `/api/customers` or its request parameters.
- Treat the backend and cache's existing order as newest-first.
- Preserve existing search, page controls, error, loading, and cache-fallback behavior.
- The UI page number remains one-based and must not change.

---

## File Structure

- `src/store/AppStore.tsx` — mirror each UI customer page to its backend/cache page, reverse the resolved rows, and remove the incorrect optimistic prepend after creation.
- `src/store/AppStore.test.tsx` — prove online, search, offline cache, and create flows expose an oldest-first list.

### Task 1: Add failing mirrored-pagination tests

**Files:**
- Modify: `src/store/AppStore.test.tsx`

**Interfaces:**
- Consumes: `AppStoreProvider`, `useAppStore`, `customerApiMocks.listCustomers`, `offlineDbMocks.listCachedCustomers`, and `offlineSyncMocks.shouldReadFromOfflineCache`.
- Produces: regression coverage for public `customers`, `customersQuery`, and `setCustomersQuery`.

- [ ] **Step 1: Write the failing online first-page test**

Add `newestCustomer`, `middleCustomer`, and `oldestCustomer` fixtures. Return total 3 from page 1 and the two older records from page 2; render the store and assert UI page 1 exposes the latter in reverse order.

```ts
customerApiMocks.listCustomers.mockImplementation(async ({ page }: { page?: number }) => {
  if (page === 2) return { items: [middleCustomer, oldestCustomer], total: 3, page: 2, limit: 20 };
  return { items: [newestCustomer], total: 3, page: 1, limit: 20 };
});
await waitFor(() => expect(mounted.getStore().customers).toEqual([oldestCustomer, middleCustomer]));
expect(customerApiMocks.listCustomers).toHaveBeenCalledWith({ page: 2, limit: 20 });
```

- [ ] **Step 2: Run it and verify a meaningful failure**

Run: `npm test -- src/store/AppStore.test.tsx`

Expected: FAIL because the store currently exposes page 1 in newest-first order.

- [ ] **Step 3: Write failing later-page, search, and offline tests**

Set `setCustomersQuery({ page: 2 })` against 45 records with a 20-record limit and assert the store requests backend page 2. Then set `setCustomersQuery({ search: "Ali", page: 1 })`, return search total 22, and assert it requests `{ search: "Ali", page: 2, limit: 20 }`. For cache mode, return total 3 for cache page 1 and `[middleCustomer, oldestCustomer]` for cache page 2; assert the public rows are `[oldestCustomer, middleCustomer]`.

```ts
await act(async () => mounted.getStore().setCustomersQuery({ search: "Ali", page: 1 }));
await waitFor(() => {
  expect(customerApiMocks.listCustomers).toHaveBeenCalledWith({ search: "Ali", page: 2, limit: 20 });
});
offlineSyncMocks.shouldReadFromOfflineCache.mockReturnValue(true);
expect(mounted.getStore().customers).toEqual([oldestCustomer, middleCustomer]);
```

- [ ] **Step 4: Run the tests and verify they fail**

Run: `npm test -- src/store/AppStore.test.tsx`

Expected: FAIL because cache and later/search pages still use the visible UI page directly.

- [ ] **Step 5: Commit the red checkpoint**

```bash
git add src/store/AppStore.test.tsx
git commit -m "test: cover oldest-first customer pagination"
```

### Task 2: Mirror server and cache results in the store

**Files:**
- Modify: `src/store/AppStore.tsx:552-596`
- Test: `src/store/AppStore.test.tsx`

**Interfaces:**
- Consumes: `CustomersQuery` (`search`, `page`, `limit`), `CustomersListResult`, and `listCachedCustomers(storeKey, query)`.
- Produces: `fetchCustomers(query: CustomersQuery): Promise<void>` that exposes rows oldest-first for the visible page.

- [ ] **Step 1: Add the pure mirroring helper**

Directly above `fetchCustomers`, add this function. It makes empty results use page 1 and clamps out-of-range UI pages.

```ts
const getMirroredCustomerPage = (page: number, total: number, limit: number) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return Math.max(1, Math.min(totalPages, totalPages - page + 1));
};
```

- [ ] **Step 2: Implement online loading after the test is red**

Build the existing parameters once. Always request backend page 1 to receive the current total, calculate the mirrored page, then issue a second request only if it differs. Hydrate and cache the resolved page, reverse a copy, and retain the first result's total.

```ts
const firstResult = await listCustomers({ ...params, page: 1 });
const backendPage = getMirroredCustomerPage(query.page, firstResult.total, query.limit);
const result = backendPage === 1 ? firstResult : await listCustomers({ ...params, page: backendPage });
const items = await hydrateCustomerDebtSummaries(result.items);
await upsertCachedCustomers(storeCacheKey, items);
setCustomers([...items].reverse());
setCustomersTotal(firstResult.total);
```

- [ ] **Step 3: Implement cache and network-fallback loading**

Replace both direct cache reads with a page-1 cache discovery, mirrored cache-page read when necessary, and reversed resolved items.

```ts
const firstCached = await listCachedCustomers(storeCacheKey, { ...query, page: 1 });
const cachePage = getMirroredCustomerPage(query.page, firstCached.total, query.limit);
const cached = cachePage === 1 ? firstCached : await listCachedCustomers(storeCacheKey, { ...query, page: cachePage });
setCustomers([...cached.items].reverse());
setCustomersTotal(firstCached.total);
```

- [ ] **Step 4: Run the focused tests and verify green**

Run: `npm test -- src/store/AppStore.test.tsx`

Expected: PASS. The online, later/search, and cache cases fetch the mirrored page and render it oldest-first.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/store/AppStore.tsx src/store/AppStore.test.tsx
git commit -m "feat: show customers oldest first"
```

### Task 3: Keep customer creation compatible with the new order

**Files:**
- Modify: `src/store/AppStore.tsx:819-877`
- Test: `src/store/AppStore.test.tsx`

**Interfaces:**
- Consumes: `addCustomer(input: CustomerInput)` and `fetchCustomers(customersQueryRef.current)` from Task 2.
- Produces: customer creation that refreshes the active mirrored page instead of prepending a new record.

- [ ] **Step 1: Write the failing creation test**

Arrange the post-create fetch to return the old final backend page. Call `addCustomer(queuedCustomerInput)` while UI page 1 is visible, then assert the new customer is absent and the visible records stay oldest-first.

```ts
await act(async () => { await mounted.getStore().addCustomer(queuedCustomerInput); });
expect(mounted.getStore().customers).toEqual([oldestCustomer, middleCustomer]);
expect(mounted.getStore().customers).not.toContainEqual(syncedCustomer);
```

- [ ] **Step 2: Run the test and verify a meaningful failure**

Run: `npm test -- src/store/AppStore.test.tsx`

Expected: FAIL because `mergeCustomerIntoCurrentPage` prepends the newest saved customer.

- [ ] **Step 3: Remove the incompatible optimistic prepend**

Delete `mergeCustomerIntoCurrentPage` and its calls. After a successful online create, retain the cache write then invoke the mirrored `fetchCustomers`. In the queued offline create path, invoke the same refresh after the queue/cache write instead of incrementing state and prepending.

```ts
await upsertCachedCustomers(storeCacheKey, [saved]);
await fetchCustomers(customersQueryRef.current);
return { ok: true, message: "تمت إضافة العميل بنجاح", id: saved.id };
```

- [ ] **Step 4: Verify all affected behavior**

Run: `npm test -- src/store/AppStore.test.tsx && npm run build`

Expected: PASS and exit code 0; no TypeScript errors.

- [ ] **Step 5: Commit the creation consistency fix**

```bash
git add src/store/AppStore.tsx src/store/AppStore.test.tsx
git commit -m "fix: preserve oldest-first customer pages after creation"
```
