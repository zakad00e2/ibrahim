# Customer list: oldest-first pagination

## Goal

Show customers in creation order from oldest to newest without changing the backend API. The first page in the Customers screen must therefore represent the backend's last page.

## Scope

- Keep the existing backend request shape (`search`, `page`, `limit`).
- Apply the same ordering when the user searches.
- Preserve the existing UI labels and pagination controls.
- Do not change the backend or database schema.

## Design

The frontend will translate each visible page number to its mirrored backend page number using the total number of pages. For example, when the backend has five pages, UI page 1 requests backend page 5, UI page 2 requests backend page 4, and so on.

The customer rows returned for a backend page are reversed before display. Assuming the backend's default is newest-first, this makes the combined UI sequence oldest-first across all pages. The total count and displayed current page remain UI-oriented and unchanged.

When a search changes, the UI page resets to 1 as it does today, and the mirrored backend page is recalculated from that search result's total. Offline cache reads retain their existing local pagination because the cache does not store the complete server result set or a stable creation-order field; inferring mirrored server pages there could duplicate or skip locally cached records.

## Error handling

If the total is zero, the requested backend page remains 1 and the empty state continues to render. Existing network, loading, and cache-fallback behaviour stays unchanged.

## Tests

Add focused store tests that prove:

1. UI page 1 fetches the backend's final page and exposes its rows reversed.
2. Later UI pages map to preceding backend pages.
3. Search results use the same mirrored-page behavior.
4. Offline cached customer results use only their requested local page, without inferring a server page order.
