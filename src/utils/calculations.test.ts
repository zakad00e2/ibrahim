import { describe, expect, it } from "vitest";
import {
  applyCreditToNewDebt,
  calculateCustomerDebt,
  calculateInvoiceTotal,
  calculateInvoiceItemTotal,
  calculateItemsTotal,
  getCustomerBalance,
  syncCustomerBalances,
  validateInvoiceDiscount,
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
  it("subtracts a fixed discount without JavaScript float drift", () => {
    const items = [
      {
        productId: "p1",
        productName: "A",
        barcode: "1",
        price: 10.1,
        wholesalePrice: 0,
        quantity: 1,
        total: 10.1,
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
    ];

    expect(calculateInvoiceTotal(items, 0.3)).toBe(10);
  });

  it("rejects invalid and subtotal-exceeding invoice discounts", () => {
    expect(validateInvoiceDiscount(10, -1)).toBe("invalid-discount");
    expect(validateInvoiceDiscount(10, Number.NaN)).toBe("invalid-discount");
    expect(validateInvoiceDiscount(10, 10.01)).toBe("discount-exceeds-subtotal");
    expect(validateInvoiceDiscount(10, 10)).toBeNull();
  });

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

describe("customer balance helpers", () => {
  it("calculates signed balance from credit and debt", () => {
    expect(getCustomerBalance({
      debts: [],
      debtBalance: 80,
      creditBalance: 0,
    })).toBe(-80);

    expect(getCustomerBalance({
      debts: [],
      debtBalance: 0,
      creditBalance: 40,
    })).toBe(40);

    expect(getCustomerBalance({
      debts: [],
      debtBalance: 0,
      creditBalance: 0,
      balance: 0,
    })).toBe(0);
  });

  it("stores excess customer payments as credit", () => {
    const customer = {
      debts: [{
        id: "d1",
        invoiceId: "i1",
        description: "Debt",
        date: "2026-08-22T00:00:00.000Z",
        amount: 50,
        paid: 0,
        remaining: 50,
      }],
      debtBalance: 50,
      creditBalance: 0,
    };

    expect(syncCustomerBalances(customer, {
      debts: [{ ...customer.debts[0], paid: 50, remaining: 0, isPaid: true }],
      debtBalance: 0,
      creditBalance: 20,
    })).toMatchObject({
      debtBalance: 0,
      creditBalance: 20,
      balance: 20,
    });
  });

  it("consumes credit when creating a new debt", () => {
    expect(applyCreditToNewDebt({ creditBalance: 40 }, 30)).toEqual({
      creditUsed: 30,
      remainingDebt: 0,
      creditBalance: 10,
    });
  });
});
