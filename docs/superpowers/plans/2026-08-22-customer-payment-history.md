# Customer Payment History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display one chronological payment-history table for all debts in the customer details modal.

**Architecture:** Reuse the payments already returned by `GET /api/customers/{id}` and mapped into `selectedCustomer.debts`. Derive a flattened, newest-first view model in `CustomersPage`, carrying the parent debt's invoice number into each row, then render it below the existing debts table without additional API calls.

**Tech Stack:** React 18, TypeScript, Vitest, jsdom, Tailwind CSS

---

### Task 1: Render a unified customer payment history

**Files:**
- Modify: `src/pages/CustomersPage.test.tsx:11-274`
- Modify: `src/pages/CustomersPage.tsx:88-127,592-641`

- [ ] **Step 1: Reset mutable payment fixtures between tests**

Add these resets to the existing `beforeEach` in `CustomersPage.test.tsx`:

```tsx
storeMocks.debt.payments = [];
storeMocks.customer.debts = [storeMocks.debt];
```

- [ ] **Step 2: Write a failing test for combined, newest-first payments**

Add this test inside `describe("CustomersPage details modal", ...)`:

```tsx
it("shows all customer payments in one newest-first history table", async () => {
  storeMocks.debt.payments = [
    {
      id: "payment-oldest",
      amount: 2,
      date: "2026-08-22T08:00:00.000Z",
      notes: "oldest payment",
    },
    {
      id: "payment-newest",
      amount: 3,
      date: "2026-08-22T10:00:00.000Z",
      notes: "newest payment",
    },
  ];
  storeMocks.customer.debts = [
    storeMocks.debt,
    {
      ...storeMocks.debt,
      id: "debt-2",
      invoiceId: "invoice-2",
      invoiceNumber: "INV-2026-002",
      payments: [
        {
          id: "payment-middle",
          amount: 4,
          date: "2026-08-22T09:00:00.000Z",
          notes: "middle payment",
        },
      ],
    },
  ];
  mounted = await renderCustomersPage();

  await act(async () => {
    findButtonByText(mounted!.container, "تسديد الدين").click();
  });

  const dialog = document.querySelector('[role="dialog"][aria-label="تفاصيل العميل"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("Customer details dialog was not rendered");
  }

  const heading = Array.from(dialog.querySelectorAll("p")).find(
    (element) => element.textContent === "سجل دفعات العميل",
  );
  const history = heading?.parentElement;
  if (!(history instanceof HTMLElement)) {
    throw new Error("Customer payment history was not rendered");
  }

  const rows = Array.from(history.querySelectorAll("tbody tr"));
  expect(rows).toHaveLength(3);
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining("newest payment"),
    expect.stringContaining("middle payment"),
    expect.stringContaining("oldest payment"),
  ]);
  expect(history.textContent).toContain("INV-2026-001");
  expect(history.textContent).toContain("INV-2026-002");
  expect(history.textContent).not.toContain("غير متوفر");
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npm test -- src/pages/CustomersPage.test.tsx
```

Expected: FAIL with `Customer payment history was not rendered`, proving the unified history does not exist yet.

- [ ] **Step 4: Derive flattened payments in the component**

After `getDebtInvoiceNumber` in `CustomersPage.tsx`, add:

```tsx
const selectedCustomerPayments = useMemo(() => {
  if (!selectedCustomer) return [];

  const paymentTimestamp = (date: string) => {
    const timestamp = Date.parse(date);
    return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
  };

  return selectedCustomer.debts
    .flatMap((debt) =>
      (debt.payments ?? []).map((payment) => ({
        payment,
        invoiceNumber: getDebtInvoiceNumber(debt),
      })),
    )
    .sort(
      (left, right) =>
        paymentTimestamp(right.payment.date) - paymentTimestamp(left.payment.date),
    );
}, [getDebtInvoiceNumber, selectedCustomer]);
```

- [ ] **Step 5: Render the unified table below the debts table**

Immediately after the existing customer debts table wrapper, add:

```tsx
<div>
  <p className="mb-2 text-sm font-medium text-zinc-700">سجل دفعات العميل</p>
  <div className="overflow-x-auto rounded-lg border border-zinc-200">
    <table className="w-full min-w-[620px] text-right text-sm">
      <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
        <tr>
          <th className="px-4 py-3">تاريخ الدفعة</th>
          <th className="px-4 py-3">المبلغ</th>
          <th className="px-4 py-3">رقم الفاتورة</th>
          <th className="px-4 py-3">ملاحظات</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {selectedCustomerPayments.map(({ payment, invoiceNumber }) => (
          <tr key={payment.id}>
            <td className="px-4 py-3 font-normal text-zinc-600">
              {formatDate(payment.date)}
            </td>
            <td className="px-4 py-3 font-medium text-emerald-700">
              <AnimatedDigits value={formatCurrency(payment.amount)} />
            </td>
            <td className="px-4 py-3 font-medium text-zinc-950">
              {invoiceNumber}
            </td>
            <td className="px-4 py-3 font-normal text-zinc-500">
              {payment.notes || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/pages/CustomersPage.test.tsx
```

Expected: all `CustomersPage.test.tsx` tests PASS with no warnings or errors.

- [ ] **Step 7: Write a failing test for the empty state**

Add this test inside the same `describe` block:

```tsx
it("shows an empty payment-history state when the customer has no payments", async () => {
  mounted = await renderCustomersPage();

  await act(async () => {
    findButtonByText(mounted!.container, "تسديد الدين").click();
  });

  const dialog = document.querySelector('[role="dialog"][aria-label="تفاصيل العميل"]');
  if (!(dialog instanceof HTMLElement)) {
    throw new Error("Customer details dialog was not rendered");
  }

  expect(dialog.textContent).toContain("سجل دفعات العميل");
  expect(dialog.textContent).toContain("لا توجد دفعات مسجلة لهذا العميل");
});
```

- [ ] **Step 8: Run the empty-state test and verify RED**

Run:

```bash
npm test -- src/pages/CustomersPage.test.tsx
```

Expected: FAIL because `لا توجد دفعات مسجلة لهذا العميل` is absent.

- [ ] **Step 9: Add the empty-state branch**

Replace the payment table wrapper added in Step 5 with:

```tsx
{selectedCustomerPayments.length === 0 ? (
  <div className="rounded-lg bg-zinc-50 px-4 py-6 text-center text-sm font-normal text-zinc-500">
    لا توجد دفعات مسجلة لهذا العميل
  </div>
) : (
  <div className="overflow-x-auto rounded-lg border border-zinc-200">
    <table className="w-full min-w-[620px] text-right text-sm">
      <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
        <tr>
          <th className="px-4 py-3">تاريخ الدفعة</th>
          <th className="px-4 py-3">المبلغ</th>
          <th className="px-4 py-3">رقم الفاتورة</th>
          <th className="px-4 py-3">ملاحظات</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {selectedCustomerPayments.map(({ payment, invoiceNumber }) => (
          <tr key={payment.id}>
            <td className="px-4 py-3 font-normal text-zinc-600">
              {formatDate(payment.date)}
            </td>
            <td className="px-4 py-3 font-medium text-emerald-700">
              <AnimatedDigits value={formatCurrency(payment.amount)} />
            </td>
            <td className="px-4 py-3 font-medium text-zinc-950">
              {invoiceNumber}
            </td>
            <td className="px-4 py-3 font-normal text-zinc-500">
              {payment.notes || "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
```

- [ ] **Step 10: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/pages/CustomersPage.test.tsx
```

Expected: all focused tests PASS.

### Task 2: Verify the complete change

**Files:**
- Verify: `src/pages/CustomersPage.tsx`
- Verify: `src/pages/CustomersPage.test.tsx`

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test
```

Expected: all tests PASS with no unhandled errors.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: TypeScript compilation and Vite production build both complete successfully.

- [ ] **Step 3: Review the final diff**

Run:

```bash
git diff -- src/pages/CustomersPage.tsx src/pages/CustomersPage.test.tsx
```

Expected: the diff contains only the unified payment-history view model, UI, and tests. Do not create a commit unless the user explicitly requests one.
