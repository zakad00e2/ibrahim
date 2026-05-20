import { describe, expect, it } from "vitest";
import type { Customer, CustomerInput, Product, SaleRequest } from "../types";
import {
  applyCustomerDebtPayment,
  applyDebtPayment,
  applyOfflineSaleToProducts,
  buildOfflineCustomer,
  buildOfflineInvoice,
  isNetworkFailure,
} from "./offlineSync";

const product: Product = {
  id: "p1",
  name: "Tea",
  barcode: "123",
  price: 10,
  wholesalePrice: 7,
  stock: 5,
  minStock: 1,
  isActive: true,
};

const customer: Customer = {
  id: "c1",
  name: "Ibrahim",
  phone: "010",
  debtBalance: 50,
  debts: [
    {
      id: "d1",
      invoiceId: "i1",
      description: "Old invoice",
      date: "2026-05-01T00:00:00.000Z",
      amount: 50,
      paid: 0,
      remaining: 50,
    },
  ],
};

describe("offlineSync", () => {
  it("only treats offline state and fetch-like errors as network failures", () => {
    expect(isNetworkFailure(new Error("server validation failed"), true)).toBe(false);
    expect(isNetworkFailure(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isNetworkFailure({ message: "Failed to fetch" }, true)).toBe(true);
    expect(isNetworkFailure("Failed to fetch", true)).toBe(true);
    expect(isNetworkFailure(new Error("anything"), false)).toBe(true);
  });

  it("builds an offline invoice with totals and local customer naming", () => {
    const request: SaleRequest = {
      items: [
        {
          productId: "p1",
          productName: "Tea",
          barcode: "123",
          price: 10,
          wholesalePrice: 7,
          quantity: 2,
          total: 20,
        },
      ],
      paymentMethod: "partial",
      customerId: "c1",
      paidAmount: 5,
    };

    expect(
      buildOfflineInvoice(request, [product], customer, new Date("2026-05-17T10:00:00.000Z")),
    ).toMatchObject({
      id: "offline-invoice-1779012000000",
      number: "OFFLINE-1779012000000",
      customerName: "Ibrahim",
      total: 20,
      paid: 5,
      remaining: 15,
      paymentMethod: "partial",
    });
  });

  it("builds an offline customer with an opening debt", () => {
    const input: CustomerInput = {
      name: "Ahmed",
      phone: "011",
      initialDebt: 75,
    };

    expect(buildOfflineCustomer(input, new Date("2026-05-17T10:00:00.000Z"))).toEqual({
      id: "offline-customer-1779012000000",
      name: "Ahmed",
      phone: "011",
      debtBalance: 75,
      debts: [
        {
          id: "offline-debt-offline-customer-1779012000000",
          invoiceId: "",
          description: "دين افتتاحي",
          date: "2026-05-17T10:00:00.000Z",
          amount: 75,
          paid: 0,
          remaining: 75,
          isPaid: false,
        },
      ],
    });
  });

  it("reduces product stock for an offline sale", () => {
    expect(
      applyOfflineSaleToProducts([product], [{ ...product, productId: "p1", productName: "Tea", quantity: 2, total: 20 }]),
    ).toEqual([{ ...product, stock: 3 }]);
  });

  it("applies customer debt payments across cached debts", () => {
    expect(applyCustomerDebtPayment([customer], "c1", 20)[0]).toMatchObject({
      debtBalance: 30,
      debts: [{ id: "d1", paid: 20, remaining: 30 }],
    });
  });

  it("applies a single debt payment in cached customers", () => {
    expect(applyDebtPayment([customer], "d1", 15)[0]).toMatchObject({
      debtBalance: 35,
      debts: [{ id: "d1", paid: 15, remaining: 35 }],
    });
  });
});
