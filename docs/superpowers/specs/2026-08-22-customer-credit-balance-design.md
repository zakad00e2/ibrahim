# Customer Credit Balance Design

> Date: 2026-08-22

## Goal

Allow a customer-level debt payment to exceed the customer's current debt. The backend applies the payment to open debts and stores the excess as customer credit. Future debts consume that credit automatically.

The customer UI replaces "إجمالي الدين" with "الرصيد" and displays one signed value:

- Debt is negative: a debt of 80 is shown as `-80`.
- Customer credit is positive: credit of 40 is shown as `+40`.
- No debt or credit is shown as `0`.

## Scope

Frontend work in this repository:

- Add customer credit and signed balance fields to frontend models and API mappers.
- Replace the sequential customer-debt payment call with an atomic customer-level payment contract.
- Continue allowing overpayments in the customer-level payment flow only.
- Keep single-debt payments capped at that debt's remaining amount.
- Apply overpayments optimistically while offline and replay them with an idempotency key.
- Display the signed balance and update customer-facing Arabic labels.
- Add automated tests for API mapping, signed balance calculations, optimistic offline behavior, store behavior, and UI labels.
- Produce a backend handoff report describing the required endpoint and transaction behavior.

Out of scope:

- Cash refunds or manual adjustments to customer credit.
- Allowing overpayment against one specific debt.
- Storing backend accounting records in the frontend.
- Changing store-level debt reports to subtract customer credit. Debt and credit remain separate accounting totals.

## Balance Semantics

The backend owns two non-negative accounting values:

- `totalRemaining`: the customer's unpaid debt.
- `creditBalance`: money held for the customer.

The signed display balance is:

`balance = creditBalance - totalRemaining`

The frontend may calculate this value when the backend does not return `balance`, but the backend should return all three values so every client uses the same authoritative state.

After a successful online backend transaction, `totalRemaining` and `creditBalance` should not both be positive: available credit is applied to debt immediately. Both may appear temporarily in local offline state while queued operations are being reconciled.

## API Contract

### Atomic Customer Payment

Add:

`POST /api/debts/customer/:customerId/pay`

Request:

```json
{
  "amount": 120,
  "notes": "optional",
  "clientOperationId": "stable-unique-id"
}
```

Response:

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

The frontend sends one request for the full amount. It must not split the payment across multiple API calls.

For rollout compatibility, if this endpoint returns 404 or 405 and the amount does not exceed the loaded debt, the frontend may fall back to the existing sequential per-debt payment behavior. An overpayment must never use that fallback because the excess cannot be stored atomically.

### Customer And Debt Reads

Customer list/detail responses and `GET /api/debts/customer/:customerId` should return:

- `creditBalance`
- `balance`

Money values may be JSON numbers or decimal strings; service mappers normalize them through the existing money helpers.

### New Debt Creation

When an invoice or opening debt is created, the backend applies available customer credit in the same database transaction:

1. Create the invoice and debt.
2. Consume `min(creditBalance, newDebtRemaining)`.
3. Record a debt payment whose source is customer credit.
4. Reduce both debt remaining and customer credit by the consumed amount.
5. Return the reconciled invoice, debt, and customer balance.

## Frontend Data Flow

### Online Customer Payment

1. The customer-level payment dialog accepts any finite amount greater than zero.
2. The store creates a stable `clientOperationId`.
3. The service posts the complete amount to the atomic endpoint.
4. The returned debt summary and credit balance replace local customer state.
5. On failure, the store refreshes authoritative data and shows an Arabic error.

### Offline Customer Payment

1. Queue the existing `payCustomerDebt` operation with the complete amount and `clientOperationId`.
2. Apply the amount to cached debts in order.
3. Put any excess into `creditBalance`.
4. Recalculate the signed `balance`.
5. On reconnect, replay the same atomic request with the same idempotency key.
6. Replace optimistic state with the backend response.

### New Offline Debt

When a debt invoice is created offline, local state consumes cached credit immediately and stores the reconciled optimistic debt and credit. During replay, the backend remains authoritative and performs the same reconciliation atomically.

## UI

- Replace customer-facing "إجمالي الدين" labels with "الرصيد".
- Render signed balances explicitly:
  - negative values for debt,
  - positive values with a leading `+` for credit,
  - zero without a sign.
- Preserve the existing currency formatting.
- The customer-level payment dialog no longer rejects an amount above the current debt.
- The single-debt dialog continues to reject an amount above that debt's remaining value.
- After payment, show a success message that distinguishes a normal debt payment from credit created by an overpayment when the response provides enough information.

## Error Handling

- Reject non-finite, zero, and negative amounts in the frontend.
- Do not silently discard an overpayment when the backend endpoint is unavailable.
- Treat 404/405 on an overpayment as an unsupported backend contract and show a clear Arabic message.
- Reuse structured API status handling rather than matching English backend messages.
- Preserve queued offline operations on network or server failure.
- The backend must make `clientOperationId` unique within the store so retries return the original result without applying money twice.

## Testing

Use TDD for implementation.

- Balance utility tests:
  - debt-only produces a negative signed balance,
  - credit-only produces a positive signed balance,
  - decimal arithmetic remains money-safe.
- API tests:
  - maps `creditBalance` and `balance` from numbers and strings,
  - posts the full customer payment with `clientOperationId`,
  - falls back only for non-overpayments on 404/405,
  - never splits or drops an overpayment.
- Offline tests:
  - payment below debt reduces debt,
  - exact payment produces zero,
  - excess payment clears debts and adds credit,
  - future offline debt consumes cached credit,
  - replay keeps the same idempotency key.
- Store tests:
  - customer-level overpayment is accepted,
  - single-debt overpayment remains rejected,
  - optimistic state rolls back or refreshes after a non-network failure.
- UI tests:
  - "الرصيد" replaces "إجمالي الدين",
  - signed negative, positive, and zero balances render correctly,
  - customer-level input is not capped by current debt.

Final verification:

- `npm test`
- `npm run build`

## Backend Handoff Requirements

The handoff report must request:

- a non-negative persisted customer credit balance or an equivalent credit ledger,
- the atomic customer payment endpoint above,
- oldest-debt-first allocation in a database transaction,
- automatic credit consumption when creating future debts,
- durable idempotency keyed by store and `clientOperationId`,
- decimal-safe server arithmetic,
- response fields `creditBalance` and `balance`,
- backend tests for overpayment, retry, concurrent payments, and credit consumption.

## Risks And Mitigations

Risk: deploying the frontend before the atomic backend endpoint makes overpayment unavailable online.

Mitigation: keep ordinary payment compatibility on 404/405, reject unsupported online overpayment clearly, and retain offline operations until the backend can process them.

Risk: optimistic offline credit differs from server allocation order.

Mitigation: use oldest-first local allocation and always replace local state with the authoritative backend response after synchronization.

Risk: representing accounting state as one signed stored number hides whether money is debt or credit.

Mitigation: store debt and credit separately; derive the signed number only for display.

## Self-Review

- The design keeps accounting ownership on the backend.
- Overpayment applies only to customer-level payment.
- Credit is only used against future debt and cannot be refunded in this scope.
- Online and offline flows retain idempotency.
- The rollout behavior never discards excess money.
- Store debt reports remain debt reports and do not conflate customer credit with receivables.
