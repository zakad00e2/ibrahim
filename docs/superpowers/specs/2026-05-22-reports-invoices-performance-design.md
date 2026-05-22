# Reports and Invoice Pagination Performance

## Context

The app is a Vite, React, and TypeScript cashier frontend. Store data is loaded
through service functions and centralized in `src/store/AppStore.tsx`. The app
also has IndexedDB-backed offline support, so fetch paths must keep the existing
online, offline, and pending-offline-write behavior intact.

The reported slow areas are:

- The `/reports` page.
- Moving between pages in `/invoices`.

Current code shows two likely performance causes.

`src/services/reportsData.ts` builds the reports dataset by loading all active
products, all customers, and all invoices. It also hydrates missing customer debt
summaries with per-customer requests and hydrates missing invoice items with
per-invoice detail requests. This can create many network requests before the
reports page feels complete.

`src/store/AppStore.tsx` loads invoices one page at a time. `InvoicesPage` swaps
to a full loading table whenever `invoicesLoading` is true, so page navigation
can feel slower than the actual request. There is no in-memory page cache and no
request ordering guard, so fast navigation can also let an older request update
the visible invoice list after a newer request has started.

## Goal

Make reports and invoice pagination feel faster without backend changes.

The frontend should:

- Reuse recently loaded reports data instead of reloading the full dataset on
  every reports-page visit.
- Keep already visible data on screen while refreshing in the background.
- Cache previously loaded invoice pages by query.
- Prevent stale invoice-page responses from overwriting newer page state.
- Preserve current offline behavior and mutation flows.

## User Experience

On `/reports`, the daily profit cards continue to load from
`getDailyProfit(selectedDate)` because that endpoint is already focused and
date-specific. The heavier dashboard dataset loads separately.

If a reports dataset has already been loaded recently, the page shows it
immediately and marks the dataset as refreshing while a background refresh runs.
If no dataset is available, the page keeps the current loading state.

If the background refresh fails but cached data is available, the cached data
stays visible and the page shows a small non-blocking error message. If there is
no cached data, the existing empty/error behavior remains.

On `/invoices`, changing to a page already loaded in the current session shows
that page immediately. Changing to a page not yet cached keeps the current table
visible with a lightweight refresh indicator while the new page loads. The page
buttons can remain disabled during a request, but the user should not see the
whole table disappear unless there is no previous invoice data at all.

## Architecture

### Reports Dataset Cache

Add a small module-level cache to `src/services/reportsData.ts`.

The cache stores:

- The last successful `ReportsDataset`.
- The time it was loaded.
- An optional in-flight load promise so concurrent callers share one request.

Expose a loader that can return cached data quickly and refresh in the
background. The exact shape can be minimal, for example:

```ts
type ReportsDatasetResult = {
  data: ReportsDataset;
  fromCache: boolean;
  refreshing: boolean;
  refresh?: Promise<ReportsDataset>;
};
```

The existing `loadReportsDataset` behavior remains available for tests and for a
forced fresh load. A new helper can wrap it, or `loadReportsDataset` can accept
options as long as existing call sites and tests stay clear.

Use a short time-to-live so reports are not stale for long. A practical first
value is 60 seconds. Manual refresh is out of scope for this pass, so automatic
background refresh is enough.

### Reports Page State

Update `src/pages/ReportsPage.tsx` so the heavy dataset has separate states for:

- Initial loading.
- Background refreshing.
- Error.
- Stale cached display.

The daily profit state remains independent. A slow dataset refresh must not make
daily revenue/profit cards appear blocked.

### Invoice Page Cache

Add an in-memory invoice-page cache inside `AppStoreProvider`, keyed by the
normalized invoice query:

```ts
search | page | limit
```

Each cache entry stores:

- `items`
- `total`
- `loadedAt`

When `fetchInvoices(query)` starts, it checks the cache first. If a hit exists,
it immediately applies the cached page and then starts a background refresh for
that same query.

If no hit exists but the current invoice list is not empty, `invoicesLoading`
can still be true, but the existing table data remains visible. `InvoicesPage`
should render a small "refreshing" message or subtle opacity state instead of
the full skeleton table in that case.

### Stale Response Guard

Track an incrementing invoice request id with `useRef`. Each call to
`fetchInvoices` captures its request id. Before setting invoice state after any
await, compare the captured id with the latest id. If it is not the latest, skip
state writes.

This protects fast page navigation and search changes from displaying stale
results.

### Offline Behavior

Do not bypass the current logic that chooses IndexedDB reads when offline or
when pending offline writes exist.

The cache is a UI acceleration layer only:

- Online fresh responses update the in-memory cache.
- Offline IndexedDB responses may also populate the in-memory cache for the
  current session.
- Mutations that call `refreshInvoices` keep working through the same fetch
  helper.
- Store/session changes clear invoice page cache along with existing state.

## Data Flow

Reports:

1. User opens `/reports`.
2. Daily profit request starts for the selected date.
3. Reports dataset loader checks memory cache.
4. If cached data exists, the page renders it immediately.
5. A background refresh loads products, customers, invoices, and needed details.
6. Successful refresh replaces the cached dataset and visible dataset.
7. Failed refresh keeps cached data visible when available.

Invoices:

1. User clicks next or previous page.
2. `setInvoicesQuery` updates page state.
3. `fetchInvoices` computes a cache key from the query.
4. If cached, cached page state is applied immediately.
5. A request id is captured and the fresh fetch begins.
6. When the request resolves, it updates state only if it is still the latest
   request.
7. Fresh data is saved to the in-memory page cache.

## Error Handling

Reports:

- If there is no cached dataset and the fresh load fails, show the current error
  message.
- If cached data exists and refresh fails, keep cached data visible and show a
  non-blocking error near the loading indicator.
- Do not let a failed heavy reports dataset request block daily profit results.

Invoices:

- If a fresh invoice page load fails and there is cached or previous visible
  data, keep visible data on screen and show the existing invoice error message.
- If there is no visible data and no cache, keep the current empty/error state.
- Network failures still fall back to IndexedDB through existing logic.

## Testing

Add focused tests around behavior, not styling.

Reports data tests:

- A second cached reports load returns the previous dataset without issuing the
  full set of API calls again.
- Concurrent cached/fresh callers share the in-flight load instead of duplicating
  requests.
- A failed background refresh keeps cached data available.

Invoice store/page tests:

- Loading an invoice page caches it by search, page, and limit.
- Returning to a cached invoice page applies cached data immediately.
- An older invoice request does not overwrite state after a newer request has
  started.
- Invoice loading UI keeps existing rows visible during page changes when rows
  already exist.

Run before completion:

```powershell
npm.cmd test
npm.cmd run build
```

## Out of Scope

- Backend endpoint changes.
- A new reports API contract.
- Manual refresh controls.
- Persistent reports cache in IndexedDB.
- Broad UI redesign.
- Changing invoice detail/edit behavior.
