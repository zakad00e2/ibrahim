# Invoice Fixed Discount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Let cashiers apply and persist an optional fixed monetary discount while creating an invoice.

**Architecture:** Add 'discount' as a first-class property of the draft, sale request, and invoice model. Centralize subtotal-minus-discount calculation in 'calculations.ts' and use the final amount for payment, debt, offline, API, and receipt flows.

**Tech Stack:** React 18, TypeScript, Vitest, Decimal.js-backed money helpers, Dexie offline queue, Vite.

## Global Constraints

- Support only a fixed amount discount at invoice creation; do not add percentage discounts or invoice-editing UI.
- Default 'discount' to 0 so existing stored drafts and invoices remain valid.
- Reject a negative, non-finite, or subtotal-exceeding discount; do not silently clamp an invalid submitted sale.
- Use the existing money helpers for all currency arithmetic.
- Persist and show the discount in the printed receipt; show its line only when it is greater than zero.
- Use the final total after discount for cash, partial payment, debt, remaining balance, and offline invoice generation.

---

## File Structure

- 'src/types/index.ts' — Adds discount to invoice and sale creation types.
- 'src/utils/calculations.ts' — Owns final-total and discount-validation rules.
- 'src/utils/calculations.test.ts' — Verifies decimal-safe calculation and boundaries.
- 'src/services/invoicesApi.ts' — Sends and maps the persisted discount.
- 'src/services/invoicesApi.test.ts' — Verifies API serialization and mapping.
- 'src/services/offlineSync.ts' — Builds discount-adjusted offline invoices.
- 'src/services/offlineSync.test.ts' — Verifies offline invoice totals.
- 'src/store/AppStore.tsx' — Stores draft discount and validates sales before online/offline persistence.
- 'src/store/AppStore.test.tsx' — Verifies final-total validation.
- 'src/pages/CashierPage.tsx' — Renders the input, summary, sale payload, and print snapshot.
- 'src/pages/CashierPage.test.tsx' — Verifies checkout payload, summary, and receipt.

### Task 1: Add the domain contract and money rules

**Files:**

- Modify: 'src/types/index.ts:69-107'
- Modify: 'src/utils/calculations.ts:1-21'
- Test: 'src/utils/calculations.test.ts'

**Interfaces:**

- Produces 'Invoice.discount: number', 'SaleRequest.discount?: number', and 'calculateInvoiceTotal(items, discount?): number'.
- Produces 'validateInvoiceDiscount(subtotal, discount): "invalid-discount" | "discount-exceeds-subtotal" | null'.

- [ ] **Step 1: Write the failing money-rule tests**

~~~
import { calculateInvoiceTotal, validateInvoiceDiscount } from "./calculations";

it("subtracts a fixed discount using money-safe arithmetic", () => {
  expect(calculateInvoiceTotal([itemAt(10.1), itemAt(0.2)], 0.3)).toBe(10);
});

it("rejects invalid and subtotal-exceeding discounts", () => {
  expect(validateInvoiceDiscount(10, -1)).toBe("invalid-discount");
  expect(validateInvoiceDiscount(10, Number.NaN)).toBe("invalid-discount");
  expect(validateInvoiceDiscount(10, 10.01)).toBe("discount-exceeds-subtotal");
  expect(validateInvoiceDiscount(10, 10)).toBeNull();
});
~~~

- [ ] **Step 2: Run the focused test to verify it fails**

Run: 'npm test -- src/utils/calculations.test.ts'

Expected: FAIL because the two calculation functions are not exported.

- [ ] **Step 3: Add the types and minimal calculation implementation**

~~~
export type Invoice = {
  id: string;
  number: string;
  date: string;
  customerId?: string;
  customerName?: string;
  notes?: string;
  items: InvoiceItem[];
  total: number;
  paid: number;
  remaining: number;
  paymentMethod: PaymentMethod;
  discount: number;
};

export type SaleRequest = {
  items: InvoiceItem[];
  paymentMethod: PaymentMethod;
  customerId?: string;
  paidAmount?: number;
  discount?: number;
};

export const calculateInvoiceTotal = (items: InvoiceItem[], discount = 0) =>
  subtractMoney(calculateItemsTotal(items), discount);

export const validateInvoiceDiscount = (subtotal: number, discount: number) => {
  if (!Number.isFinite(discount) || discount < 0) return "invalid-discount" as const;
  return compareMoney(discount, subtotal) === 1 ? "discount-exceeds-subtotal" as const : null;
};
~~~

Use 'subtractMoney' rather than native subtraction. Keep 'Invoice.discount' required because the API mapper supplies 0 for historical records.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: 'npm test -- src/utils/calculations.test.ts'

Expected: PASS.

- [ ] **Step 5: Commit the domain rules**

~~~
git add src/types/index.ts src/utils/calculations.ts src/utils/calculations.test.ts
git commit -m "feat: add invoice fixed discount calculations"
~~~

### Task 2: Persist and replay discounts through API and offline invoices

**Files:**

- Modify: 'src/services/invoicesApi.ts:77-160,255-270'
- Modify: 'src/services/offlineSync.ts:120-151'
- Test: 'src/services/invoicesApi.test.ts'
- Test: 'src/services/offlineSync.test.ts'

**Interfaces:**

- Consumes 'SaleRequest.discount', 'Invoice.discount', and 'calculateInvoiceTotal' from Task 1.
- Produces API request bodies and mapped invoices with 'discount', and offline invoices whose total, paid, and remaining values use the final amount.

- [ ] **Step 1: Write failing API and offline tests**

~~~
it("maps a backend discount and sends it when creating an invoice", async () => {
  await createInvoice({ ...request, discount: 2.5 });
  expect(JSON.parse(String(init.body))).toMatchObject({ discount: 2.5 });
  await expect(listInvoices()).resolves.toEqual(expect.objectContaining({
    items: [expect.objectContaining({ discount: 2.5 })],
  }));
});

it("uses the discounted total for an offline cash invoice", () => {
  const invoice = buildOfflineInvoice({ ...request, paymentMethod: "cash", discount: 5 }, products, undefined);
  expect(invoice).toMatchObject({ discount: 5, total: 15, paid: 15, remaining: 0 });
});
~~~

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: 'npm test -- src/services/invoicesApi.test.ts src/services/offlineSync.test.ts'

Expected: FAIL because the API payload/model and offline totals have no discount support.

- [ ] **Step 3: Implement API mapping, serialization, and offline calculation**

~~~
const discount = parseMoney(
  dto.discount ?? dto.discountAmount ?? dto.discount_amount,
);

// within the mapped Invoice
discount,

// createInvoice body
discount: request.discount ?? 0,

// buildOfflineInvoice
const discount = Number(request.discount ?? 0);
const total = calculateInvoiceTotal(items, discount);
const paid =
  request.paymentMethod === "cash"
    ? total
    : request.paymentMethod === "debt"
      ? 0
      : Number(request.paidAmount ?? 0);

return {
  id: localId ?? "offline-invoice-" + timestamp,
  number: "OFFLINE-" + timestamp,
  date: now.toISOString(),
  customerId: request.customerId,
  customerName: customer?.name ?? "بيع مباشر",
  items,
  discount,
  total,
  paid,
  remaining: maxMoney(subtractMoney(total, paid), 0),
  paymentMethod: request.paymentMethod,
};
~~~

The API mapper must default a missing discount to 0; do not derive it from item prices. Preserve the current 'total' meaning: the amount payable after the discount.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: 'npm test -- src/services/invoicesApi.test.ts src/services/offlineSync.test.ts'

Expected: PASS.

- [ ] **Step 5: Commit persistence support**

~~~
git add src/services/invoicesApi.ts src/services/invoicesApi.test.ts src/services/offlineSync.ts src/services/offlineSync.test.ts
git commit -m "feat: persist invoice fixed discounts"
~~~

### Task 3: Validate discounted sales in the application store

**Files:**

- Modify: 'src/store/AppStore.tsx:127-133,201-207,1038-1158'
- Test: 'src/store/AppStore.test.tsx'

**Interfaces:**

- Consumes 'CashierDraft.discount: string', 'SaleRequest.discount', 'validateInvoiceDiscount', and 'calculateInvoiceTotal'.
- Produces a sale path that rejects invalid discounts and validates payments against the final discounted total for online and offline saves.

- [ ] **Step 1: Write failing store tests**

~~~
it("rejects a discount greater than the items subtotal", async () => {
  const result = await completeSale({ ...sale, discount: 101 });
  expect(result).toEqual(expect.objectContaining({
    ok: false,
    message: "الخصم لا يمكن أن يتجاوز المجموع",
  }));
});

it("rejects a partial payment larger than the discounted total", async () => {
  const result = await completeSale({
    ...sale, discount: 20, paymentMethod: "partial", paidAmount: 81,
  });
  expect(result).toEqual(expect.objectContaining({ ok: false }));
});
~~~

- [ ] **Step 2: Run the focused test to verify it fails**

Run: 'npm test -- src/store/AppStore.test.tsx'

Expected: FAIL because the store compares payments to the pre-discount subtotal and does not validate 'discount'.

- [ ] **Step 3: Implement draft defaults and sale validation**

~~~
export type CashierDraft = {
  items: InvoiceItem[];
  paymentMethod: PaymentMethod;
  selectedCustomerId: string;
  customerSearch: string;
  paidAmount: string;
  discount: string;
};

export const createEmptyCashierDraft = (): CashierDraft => ({
  items: [],
  paymentMethod: "cash",
  selectedCustomerId: "",
  customerSearch: "",
  paidAmount: "",
  discount: "",
});

const subtotal = calculateItemsTotal(request.items);
const discount = Number(request.discount ?? 0);
const discountError = validateInvoiceDiscount(subtotal, discount);
if (discountError === "invalid-discount") {
  return { ok: false, message: "أدخل مبلغ خصم صحيح" };
}
if (discountError === "discount-exceeds-subtotal") {
  return { ok: false, message: "الخصم لا يمكن أن يتجاوز المجموع" };
}
const total = calculateInvoiceTotal(request.items, discount);
~~~

Keep the availability check and offline queue flow intact; the queued 'SaleRequest' now includes the discount.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: 'npm test -- src/store/AppStore.test.tsx'

Expected: PASS.

- [ ] **Step 5: Commit store validation**

~~~
git add src/store/AppStore.tsx src/store/AppStore.test.tsx
git commit -m "feat: validate discounted sales"
~~~

### Task 4: Add the cashier input, totals display, and receipt details

**Files:**

- Modify: 'src/pages/CashierPage.tsx:25-63,90-130,420-480,760-875,998-1061'
- Test: 'src/pages/CashierPage.test.tsx'

**Interfaces:**

- Consumes 'cashierDraft.discount', 'calculateInvoiceTotal', 'validateInvoiceDiscount', and the discounted sale contract from Tasks 1 and 3.
- Produces a numeric discount input, a final-total summary, a sale request with 'discount', and receipt values for subtotal, discount, and final total.

- [ ] **Step 1: Write failing UI and receipt tests**

~~~
it("sends a fixed discount and displays the discounted total", async () => {
  await clickProduct(view.container);
  await setTextInput(view.container, "خصم الفاتورة", "5");
  expect(view.container.textContent).toContain("الخصم");
  expect(view.container.textContent).toContain("40");
  getCompleteSaleButton(view.container).click();
  expect(storeHarness.completeSale).toHaveBeenCalledWith(
    expect.objectContaining({ discount: 5 }),
  );
});

it("prints subtotal, discount, and final total when a discount is applied", async () => {
  await clickProduct(view.container);
  await setTextInput(view.container, "خصم الفاتورة", "5");
  getPrintButton(view.container).click();
  const receipt = document.body.querySelector(".print-receipt");
  expect(receipt.textContent).toContain("الخصم");
  expect(receipt.textContent).toContain("المجموع بعد الخصم");
});
~~~

- [ ] **Step 2: Run the focused test to verify it fails**

Run: 'npm test -- src/pages/CashierPage.test.tsx'

Expected: FAIL because the discount control and receipt lines do not exist.

- [ ] **Step 3: Implement the cashier and print UI**

~~~
const { items, paymentMethod, selectedCustomerId, customerSearch, paidAmount, discount } = cashierDraft;
const subtotal = useMemo(() => calculateItemsTotal(items), [items]);
const discountAmount = Number(normalizeDigits(discount || "0"));
const total = calculateInvoiceTotal(items, Number.isFinite(discountAmount) ? discountAmount : 0);

<label className="mt-4 block">
  <span className="mb-2 block text-sm font-medium text-zinc-900">خصم الفاتورة</span>
  <input
    aria-label="خصم الفاتورة"
    inputMode="decimal"
    value={toArabicDigits(discount)}
    onChange={(event) => setDiscount(normalizeDigits(event.target.value))}
  />
</label>

await completeSale({
  items, paymentMethod, customerId: selectedCustomer?.id,
  paidAmount: effectivePaid, discount: discountAmount,
});
~~~

Add 'setDiscount' beside the existing draft setters. In the summary show the subtotal, the editable discount, then the final total. For printing, snapshot 'subtotal', 'discount', and final 'total'; show discount and final-total lines only when 'discount > 0'. Apply the same user-facing validation before printing so the preview cannot show an invalid discount or a partial payment above the final total.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: 'npm test -- src/pages/CashierPage.test.tsx'

Expected: PASS.

- [ ] **Step 5: Commit the cashier feature**

~~~
git add src/pages/CashierPage.tsx src/pages/CashierPage.test.tsx
git commit -m "feat: add fixed discount to cashier invoices"
~~~

### Task 5: Run regression checks

**Files:**

- Modify: none unless a test identifies a defect in Tasks 1-4.

**Interfaces:**

- Verifies the complete contract from domain types through API/offline persistence and the cashier UI.

- [ ] **Step 1: Run all unit and component tests**

Run: 'npm test'

Expected: PASS with no failures.

- [ ] **Step 2: Build the production bundle and type-check**

Run: 'npm run build'

Expected: TypeScript compilation and Vite build complete successfully.

- [ ] **Step 3: Inspect the final diff for scope**

Run: 'git diff HEAD~4..HEAD --check && git status --short'

Expected: no whitespace errors and no uncommitted source changes.

- [ ] **Step 4: Commit a regression correction only if required**

If either command fails, correct the identified file, re-run both commands, then commit the explicitly corrected files with:

~~~
git commit -am "fix: correct invoice discount regression"
~~~

Skip this step when the regression checks pass without corrections.
