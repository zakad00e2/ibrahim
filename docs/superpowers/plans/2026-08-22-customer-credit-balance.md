# Customer Credit Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow customer-level overpayments to become credit, show signed customer balance in the UI, and support optimistic offline credit until the backend atomic endpoint is available.

**Architecture:** Keep `debtBalance` and `creditBalance` separate in models; derive signed `balance = creditBalance - debt`. Route online customer payments through `POST /api/debts/customer/:id/pay` with sequential fallback only for non-overpayments on 404/405. Apply credit optimistically offline and when creating offline debts.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, Dexie offline cache, decimal.js money helpers

## Global Constraints

- Overpayment allowed only for customer-level payment, not single-debt payment
- Credit applies automatically to future debts; no cash refunds
- Offline overpayment must work optimistically and replay with `clientOperationId`
- Replace customer-facing "إجمالي الدين" with "الرصيد"
- Signed display: debt negative, credit positive with `+`, zero unsigned
- Backend owns atomic accounting; frontend ships API contract + handoff report

---

### Task 1: Balance utilities and types

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/utils/calculations.ts`
- Modify: `src/utils/formatCurrency.ts`
- Test: `src/utils/calculations.test.ts`, `src/utils/formatCurrency.test.ts`

- [ ] Add `creditBalance` and `balance` to `Customer` and `DebtSummary`
- [ ] Add `getCustomerCreditBalance`, `getCustomerBalance`, `syncCustomerBalances`
- [ ] Add `formatSignedBalance`
- [ ] Add unit tests

### Task 2: API mapping and atomic payment

**Files:**
- Modify: `src/services/customersApi.ts`
- Modify: `src/services/debtsApi.ts`
- Test: `src/services/debtsApi.test.ts`, `src/services/customersApi.test.ts`

- [ ] Map `creditBalance` and signed `balance`; stop treating `dto.balance` as debt
- [ ] Add atomic `POST /api/debts/customer/:id/pay`
- [ ] Update `payCustomerDebtAuto` with fallback rules
- [ ] Update tests

### Task 3: Offline credit behavior

**Files:**
- Modify: `src/services/offlineSync.ts`
- Modify: `src/services/offlineDb.ts`
- Test: `src/services/offlineSync.test.ts`

- [ ] Overpayment adds `creditBalance` in `applyCustomerDebtPayment`
- [ ] Add `applyCreditToNewDebt` and use it for offline debt creation
- [ ] Cache `creditBalance` in `cacheCustomerDebts`

### Task 4: Store and UI

**Files:**
- Modify: `src/store/AppStore.tsx`
- Modify: `src/pages/CustomersPage.tsx`
- Test: `src/store/AppStore.test.tsx`, `src/pages/CustomersPage.test.tsx`

- [ ] Remove customer-level overpayment rejection
- [ ] Persist credit fields after payment/sync
- [ ] Replace labels and render signed balance
- [ ] Update tests

### Task 5: Backend handoff report

**Files:**
- Create: `docs/superpowers/reports/2026-08-22-customer-credit-balance-backend-handoff.md`

- [ ] Document endpoint, transaction rules, idempotency, and response fields

### Task 6: Verification

- [ ] Run `npm test`
- [ ] Run `npm run build`
