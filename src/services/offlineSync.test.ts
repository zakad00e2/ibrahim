import { describe, expect, it } from "vitest";
import type { Customer, CustomerInput, Product, SaleRequest } from "../types";
import type { OfflineOperation } from "./offlineDb";
import {
  applyCustomerDebtPayment,
  applyDebtPayment,
  applyOfflineSaleToProducts,
  buildOfflineCustomer,
  buildOfflineInvoice,
  drainOfflineQueue,
  isNetworkFailure,
  resolveOfflineCustomerReference,
  shouldReadFromOfflineCache,
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

  it("prefers cached reads while offline writes are still queued", () => {
    expect(shouldReadFromOfflineCache(true, true)).toBe(true);
    expect(shouldReadFromOfflineCache(true, false)).toBe(false);
    expect(shouldReadFromOfflineCache(false, false)).toBe(true);
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

  it("builds offline invoices with decimal-safe remaining balances", () => {
    const invoice = buildOfflineInvoice({
      items: [{
        productId: "p1",
        productName: "Tea",
        barcode: "123",
        price: 0.1,
        wholesalePrice: 0,
        quantity: 3,
        total: 0.3,
      }],
      paymentMethod: "partial",
      customerId: "c1",
      paidAmount: 0.1,
    }, [product], customer, new Date("2026-05-17T10:00:00.000Z"));

    expect(invoice.total).toBe(0.3);
    expect(invoice.paid).toBe(0.1);
    expect(invoice.remaining).toBe(0.2);
  });

  it("applies cached debt payments with decimal-safe balances", () => {
    const decimalCustomer: Customer = {
      ...customer,
      debtBalance: 0.3,
      debts: [{
        id: "d1",
        invoiceId: "i1",
        description: "Decimal debt",
        date: "2026-05-01T00:00:00.000Z",
        amount: 0.3,
        paid: 0,
        remaining: 0.3,
      }],
    };

    expect(applyCustomerDebtPayment([decimalCustomer], "c1", 0.1 + 0.2)[0]).toMatchObject({
      debtBalance: 0,
      debts: [{ paid: 0.3, remaining: 0, isPaid: true }],
    });
  });

  it("replaces offline customer ids in queued sale requests", () => {
    const request: SaleRequest = {
      items: [
        {
          productId: "p1",
          productName: "Tea",
          barcode: "123",
          price: 10,
          wholesalePrice: 7,
          quantity: 1,
          total: 10,
        },
      ],
      paymentMethod: "debt",
      customerId: "offline-customer-1",
    };

    const resolved = resolveOfflineCustomerReference(
      request,
      new Map([["offline-customer-1", "server-customer-9"]]),
    );

    expect(resolved.customerId).toBe("server-customer-9");
    expect(request.customerId).toBe("offline-customer-1");
  });

  it("does not mark the offline queue as drained when a later operation fails", async () => {
    const operations: OfflineOperation[] = [
      {
        id: 1,
        type: "createCustomer",
        payload: {
          name: "Ahmed",
          phone: "011",
        },
        localId: "offline-customer-1",
        createdAt: "2026-05-17T10:00:00.000Z",
      },
      {
        id: 2,
        type: "createInvoice",
        payload: {
          items: [],
          paymentMethod: "cash",
        },
        localId: "offline-invoice-1",
        createdAt: "2026-05-17T10:01:00.000Z",
      },
    ];
    const processed: string[] = [];
    const deleted: number[] = [];

    const result = await drainOfflineQueue({
      listOperations: async () => operations,
      processOperation: async (operation) => {
        processed.push(operation.type);
        if (operation.type === "createInvoice") {
          throw new TypeError("Failed to fetch");
        }
      },
      deleteOperation: async (id) => {
        deleted.push(id);
      },
    });

    expect(result).toMatchObject({
      processedAny: true,
      drained: false,
      wentOffline: true,
    });
    expect(processed).toEqual(["createCustomer", "createInvoice"]);
    expect(deleted).toEqual([1]);
  });
});
