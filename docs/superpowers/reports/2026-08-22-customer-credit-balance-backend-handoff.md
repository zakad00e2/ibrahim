# Customer Credit Balance Backend Handoff

> Date: 2026-08-22  
> Frontend spec: `docs/superpowers/specs/2026-08-22-customer-credit-balance-design.md`

## Summary

The frontend now supports customer-level overpayments and signed balance display. The accounting logic must live in the backend. Until the backend ships the atomic endpoint below, online overpayments are rejected with a clear Arabic message; offline overpayments are queued optimistically and replayed with the same `clientOperationId`.

## Required Backend Changes

### 1. Persist customer credit separately from debt

Add a non-negative customer credit balance, or an equivalent credit ledger. Do not store debt as a negative balance.

Recommended response fields on customer and debt summary reads:

- `totalRemaining` — unpaid debt
- `creditBalance` — stored customer credit
- `balance` — signed display value: `creditBalance - totalRemaining`

### 2. Atomic customer payment endpoint

Implement:

`POST /api/debts/customer/:customerId/pay`

Request:

```json
{
  "amount": 120,
  "notes": "optional",
  "clientOperationId": "stable-unique-id"
}
```

Behavior inside one database transaction:

1. Validate `amount > 0`
2. Enforce idempotency on `(storeId, clientOperationId)` when provided
3. Allocate payment to open debts oldest-first
4. Store any excess in `creditBalance`
5. Return reconciled summary and debts

Response example:

```json
{
  "summary": {
    "totalDebt": 100,
    "totalRemaining": 0,
    "creditBalance": 20,
    "balance": 20
  },
  "debts": []
}
```

### 3. Automatic credit consumption on new debt

When creating an invoice/debt for a customer who already has credit:

1. Create the invoice and debt
2. Consume `min(creditBalance, newDebtRemaining)`
3. Record a debt payment sourced from customer credit
4. Reduce both debt remaining and customer credit in the same transaction
5. Return reconciled invoice, debt, and customer balance fields

### 4. Read endpoints

Include `creditBalance` and `balance` in:

- customer list/detail responses
- `GET /api/debts/customer/:customerId`

Money values may be JSON numbers or decimal strings.

## Frontend Rollout Behavior

- The frontend tries the atomic endpoint first.
- If it receives `404` or `405` and the payment does not exceed current debt, it falls back to the existing sequential per-debt payment flow.
- If it receives `404` or `405` and the payment exceeds current debt, it rejects the operation online with:

`الخادم لا يدعم حالياً حفظ الرصيد الزائد. حدّث نظام الباك اند أو نفّذ التسديد دون إنترنت.`

- Offline payments queue the full amount and replay the atomic endpoint with the same `clientOperationId`.

## Idempotency Requirements

- `clientOperationId` must be unique per store
- Retries must return the original result without applying money twice
- Required for offline replay and network retries

## Backend Tests To Add

- Overpayment clears debts and creates credit
- Retry with same `clientOperationId` is idempotent
- Concurrent customer payments do not double-apply money
- New debt consumes existing credit automatically
- Decimal-safe arithmetic for all money fields

## Out Of Scope

- Cash refunds from customer credit
- Overpayment on single-debt payment (`POST /api/debts/:debtId/pay`)
- Subtracting customer credit from store debt reports

## Deployment Order

1. Deploy backend with atomic endpoint and credit fields
2. Deploy frontend
3. Verify online overpayment, offline replay, and automatic credit consumption on new debt invoices
