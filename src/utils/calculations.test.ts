import { describe, expect, it } from "vitest";
import {
  calculateCustomerDebt,
  calculateInvoiceItemTotal,
  calculateItemsTotal,
  validateDebtPaymentAmount,
} from "./calculations";

describe("validateDebtPaymentAmount", () => {
  it("rejects payments above the selected debt remaining balance", () => {
    expect(validateDebtPaymentAmount({ remaining: 50 }, 75)).toBe("amount-exceeds-remaining");
  });

  it("allows positive payments up to the selected debt remaining balance", () => {
    expect(validateDebtPaymentAmount({ remaining: 50 }, 50)).toBeNull();
    expect(validateDebtPaymentAmount({ remaining: 50 }, 25)).toBeNull();
  });
});

describe("money-safe calculations", () => {
  it("calculates invoice totals without JavaScript float drift", () => {
    expect(calculateInvoiceItemTotal(0.1, 3)).toBe(0.3);
    expect(calculateItemsTotal([
      {
        productId: "p1",
        productName: "A",
        barcode: "1",
        price: 0.1,
        wholesalePrice: 0,
        quantity: 1,
        total: 0.1,
      },
      {
        productId: "p2",
        productName: "B",
        barcode: "2",
        price: 0.2,
        wholesalePrice: 0,
        quantity: 1,
        total: 0.2,
      },
    ])).toBe(0.3);
  });

  it("aggregates customer debt and validates payments with decimal comparison", () => {
    expect(calculateCustomerDebt([
      {
        id: "d1",
        invoiceId: "i1",
        description: "Debt",
        date: "2026-05-22T00:00:00.000Z",
        amount: 0.3,
        paid: 0,
        remaining: 0.1,
      },
      {
        id: "d2",
        invoiceId: "i2",
        description: "Debt",
        date: "2026-05-22T00:00:00.000Z",
        amount: 0.3,
        paid: 0,
        remaining: 0.2,
      },
    ])).toBe(0.3);
    expect(validateDebtPaymentAmount({ remaining: 0.3 }, 0.1 + 0.2)).toBeNull();
  });
});
