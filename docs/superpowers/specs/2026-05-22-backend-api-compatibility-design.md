# Backend API Compatibility Design

> Date: 2026-05-22

## Goal

Update the frontend to match the backend API changes delivered after phases 1 through 6, with special focus on decimal-safe money handling, new API error metadata, and changed endpoint details.

## Scope

This change covers the frontend code already present in the repository. It does not add new product flows for endpoints that the current app does not call.

Covered:

- Accept financial response fields returned as strings from debts, invoices, products, customers, and reports.
- Use `decimal.js` for local financial arithmetic where the cashier, reports, offline queue, and debt flows calculate totals.
- Preserve current UI-facing models as `number` for now, so pages and components remain stable.
- Preserve request payload behavior by sending money values as numbers.
- Expose API error metadata such as HTTP status, Prisma `code`, Prisma `target`, response body, and `Retry-After`.
- Improve 429 handling messages for auth and shared API calls.
- Update invoice number lookup to call `/api/invoices/by-number/:n`.
- Keep pagination requests at or below the backend max of 100 in report/export style loaders.
- Keep customer delete behavior aligned with soft delete: treat `204 No Content` as success and remove the old special workaround for raw FK-related 500 errors when it is no longer needed.

Out of scope:

- Adding new `/api/sync/push` or `/api/sync/init` service methods, because the current frontend drains offline operations through existing endpoint calls and does not call the backend sync endpoints.
- Adding `/api/health` UI or polling, because no current page uses it.
- Changing every money property type in `src/types/index.ts` to `string | number`; the compatibility boundary will stay in service mappers and money utilities.

## Current Context

The project is a Vite, React, and TypeScript frontend with Vitest tests. API mapping is split across `src/services/*Api.ts`, shared state and offline behavior live in `src/store/AppStore.tsx`, and financial calculations live mostly in `src/utils/calculations.ts` and `src/services/offlineSync.ts`.

Existing service mappers already convert many API values with `Number(value)`, so string financial responses are partly supported. The risk is not only parsing; arithmetic still uses JavaScript numbers in totals, debt reductions, report aggregation, and invoice item calculations.

## Recommended Approach

Add a focused money utility module backed by `decimal.js`, then route financial parsing and arithmetic through it.

The app will keep `Product`, `Invoice`, `InvoiceItem`, `Debt`, `DebtPayment`, and summary money fields as `number`. That keeps the UI and store code stable while allowing the API boundary and local calculations to avoid float drift.

## Architecture

### Money Utilities

Create `src/utils/money.ts` with a small API:

- `toMoneyNumber(value, fallback = 0)` parses API strings, numbers, and empty values into a finite number.
- `addMoney(...values)` sums using `Decimal`.
- `subtractMoney(left, right)` subtracts using `Decimal`.
- `multiplyMoney(left, right)` multiplies using `Decimal`.
- `sumMoney(values)` reduces arrays of money values.
- `compareMoney(left, right)` returns `-1`, `0`, or `1`.
- `minMoney(left, right)` and `maxMoney(left, right)` support payment capping and remaining balances.

The utilities return numbers because the existing UI and store contracts use numbers. Calculations are done with `Decimal` internally before converting back.

### API Mapping

Update mappers in:

- `src/services/customersApi.ts`
- `src/services/debtsApi.ts`
- `src/services/invoicesApi.ts`
- `src/services/productsApi.ts`
- `src/services/reportsApi.ts`
- `src/services/adminApi.ts` only if financial fields are found during implementation

Parsing helpers such as `parseApiNumber`, `parseNum`, and `firstApiNumber` should use the money utility for money fields. Non-money integer fields such as stock, quantity, counts, page, and limit should stay as number parsing with integer semantics.

### Calculations

Update financial arithmetic in:

- `src/utils/calculations.ts`
- `src/services/offlineSync.ts`
- `src/store/AppStore.tsx` where it directly subtracts paid values, creates offline debts, or aggregates debt balances
- `src/services/reportsData.ts` only if it performs money math directly

Quantity and stock math remains normal number math.

### Error Handling

Update `src/services/apiClient.ts` so thrown errors carry:

- `statusCode`
- `unauthorized`
- `code`
- `target`
- `body`
- `retryAfterSeconds`

The same behavior should be reused by public auth calls in `src/services/authApi.ts`. A 429 response should produce a readable Arabic message that includes the retry delay when the header exists.

The app should branch on HTTP status and structured `code` where needed, not exact backend message text.

### Endpoint Compatibility

Change `getInvoiceByNumber` from `/api/invoices/number/:n` to `/api/invoices/by-number/:n`.

Report data loaders already use `REPORTS_PAGE_SIZE = 100`, which matches the backend cap. Keep that constant and add regression coverage so future edits do not request larger report pages.

### Sync And Health

No new sync endpoint client will be added unless the implementation finds a current caller. Existing offline queue operations call create invoice, create customer, and debt payment endpoints individually, so `/api/sync/push` overpayment handling is not directly reachable from current code.

No health client will be added because the UI does not call `/api/health`.

## Testing Strategy

Use TDD for each behavioral change.

Tests to add or update:

- `src/utils/money.test.ts`
  - verifies `0.1 + 0.2` style additions return money-safe values
  - verifies string inputs parse correctly
  - verifies comparison handles string and number inputs
- `src/utils/calculations.test.ts`
  - verifies invoice totals and debt comparisons use money-safe arithmetic
- `src/services/invoicesApi.test.ts`
  - verifies string money fields from invoice responses map to numeric frontend models
  - verifies `getInvoiceByNumber` calls `/api/invoices/by-number/:n`
- `src/services/customersApi.test.ts`
  - verifies string debt and summary fields map correctly
  - updates delete customer expectation for soft-delete success and removes obsolete raw 500 special-case behavior if necessary
- `src/services/debtsApi.test.ts`
  - verifies debt summary string fields map correctly
- `src/services/reportsApi.test.ts`
  - verifies report money strings map correctly
- `src/services/apiClient.test.ts`
  - verifies 429 includes retry delay and exposes `retryAfterSeconds`
  - verifies Prisma error metadata is exposed on thrown errors
- `src/services/authApi.test.ts`
  - verifies public auth 429 uses the same readable throttling behavior

Final verification:

- `npm test`
- `npm run build`

## Risks And Mitigations

Risk: converting Decimal results back to `number` can still lose precision after the calculation.

Mitigation: the app displays and stores UI state as numbers today. The important fix is avoiding JavaScript float drift during intermediate arithmetic. A future wider refactor can introduce a `MoneyValue` model if needed.

Risk: changing shared error objects can break existing status checks.

Mitigation: preserve `statusCode` and `unauthorized`, then add metadata fields without removing current behavior.

Risk: adding `decimal.js` affects bundle size.

Mitigation: use it only in one utility module and import the focused helpers elsewhere.

## Self-Review

- No endpoint URLs are invented for currently unused sync or health flows.
- The design keeps current UI models stable.
- Pagination remains capped at 100 for report loaders.
- The test list covers money parsing, money arithmetic, endpoint path compatibility, and new error metadata.
