# Reports Summary Endpoints Design

## Goal

Make the reports page show a stable, authoritative total debt and load its summary cards quickly without waiting for all customers, customer debts, and invoice details.

## Root Cause

The page currently loads every product, customer, and invoice. It then requests debt details for every customer whose list response does not contain a balance and requests full details for every invoice whose list response does not contain items. These N+1 request chains delay the page.

Debt detail requests use partial settlement. Failed customer requests are silently ignored, leaving those customers with no debt balance. The page then counts them as zero, so the displayed total can change between refreshes depending on which requests succeeded.

## Selected Approach

Use the backend's aggregate endpoints as the authoritative sources for summary cards:

- `GET /api/debts/summary` supplies `totalRemaining` for total store debt.
- `GET /api/invoices/daily-sales?date=YYYY-MM-DD` supplies `summary.invoiceCount` for the selected date.
- The existing `GET /api/reports/daily-profit?date=YYYY-MM-DD` continues to supply revenue and profit.

Load these independent summaries in parallel. Keep the lower report tables on a separate background data path so they cannot delay or corrupt the summary cards.

## API Mapping

Add a store debt summary mapper that accepts backend money strings and returns numeric values. The client model will expose:

- `totalDebts`
- `totalAmount`
- `totalPaid`
- `totalRemaining`
- `unpaidCount`
- `unpaidRemaining`

Add a daily sales mapper that accepts both wrapped and direct payloads, converts money fields to numbers, and exposes at least:

- `date`
- `invoiceCount`
- `totalSales`
- `totalPaid`
- `totalCash`
- `totalOnline`
- `totalDebt`

Invoice rows returned by daily sales are not needed for the summary card and will not be used by the reports page.

## Page Data Flow

On initial render:

1. Request daily profit for the selected date.
2. Request daily sales for the selected date.
3. Request the store debt summary once because it is not date-specific.
4. Render each summary value as soon as its own request completes.
5. Load products and invoices for the lower tables independently in the background.

Whenever the selected date changes, repeat only the daily-profit and daily-sales requests for the new date.

The lower-table dataset will no longer load customers or call a debt endpoint per customer. The invoice count will no longer be derived by loading and filtering all invoice pages.

## Loading and Error Behavior

Each summary has independent loading and error state. A slow top-products table must not fade or block the debt, sales, profit, or invoice-count cards.

If the debt summary request fails, the page must not calculate a partial fallback from customer requests and must not replace an already displayed valid value with zero. With no previous valid value, the card shows an unavailable placeholder and a user-facing error.

Changing dates must guard against stale responses so an older request cannot overwrite the latest selected date.

## Table Data

Products remain paginated through the existing products API for the low-stock table. Invoices remain paginated and hydrated for the all-time top-products table. These operations stay bounded by the existing page and concurrency limits, but they run independently from the summary cards.

Further optimization of the top-products table would require a backend aggregate endpoint and is outside this fix.

## Testing

Add tests that prove:

- debt summary money strings map to numeric values;
- daily sales summary strings map correctly and the date query is encoded;
- the reports page uses `totalRemaining` and `invoiceCount` from aggregate endpoints;
- the reports dataset no longer requests customers or per-customer debt summaries;
- a failed debt summary never produces a partial or false zero total;
- stale date responses cannot overwrite the latest date;
- existing report data, API, full-suite, and production-build checks remain green.

## Scope

This change is frontend-only. It uses already deployed backend endpoints and does not alter authentication, debt mutation behavior, invoice creation, or the meaning of the all-time top-products table.
