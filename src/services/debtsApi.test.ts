import { afterEach, describe, expect, it, vi } from "vitest";
import { getCustomerDebts, payCustomerDebtAuto, payDebt } from "./debtsApi";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("debtsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps backend string debt summary fields into numbers", async () => {
    mockFetch(new Response(JSON.stringify({
      summary: {
        totalAmount: "500.30",
        totalRemaining: "40.10",
      },
      debts: [{
        id: "d1",
        invoiceId: "i1",
        amount: "100.20",
        paid: "60.10",
        remaining: "40.10",
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(getCustomerDebts("c1")).resolves.toEqual({
      totalDebt: 500.3,
      totalRemaining: 40.1,
      debts: [expect.objectContaining({
        amount: 100.2,
        paid: 60.1,
        remaining: 40.1,
      })],
    });
  });

  it("maps debt payment responses with string money fields", async () => {
    mockFetch(new Response(JSON.stringify({
      debt: {
        id: "d1",
        invoiceId: "i1",
        amount: "100.00",
        paid: "60.00",
        remaining: "40.00",
        payments: [{ id: "p1", amount: "60.00", date: "2026-05-22T00:00:00.000Z" }],
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(payDebt("d1", 60)).resolves.toMatchObject({
      amount: 100,
      paid: 60,
      remaining: 40,
      payments: [{ amount: 60 }],
    });
  });

  it("omits clientOperationId from single debt payment requests", async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({
      debt: {
        id: "d1",
        invoiceId: "i1",
        amount: "100.00",
        paid: "25.00",
        remaining: "75.00",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await payDebt("d1", 25, "cash drawer", { clientOperationId: "payment-op-1" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      amount: 25,
      notes: "cash drawer",
    });
  });

  it("pays customer-level debt through individual debt payment endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        summary: { totalAmount: "80.00", totalRemaining: "70.00" },
        debts: [
          {
            id: "d1",
            invoiceId: "i1",
            amount: "30.00",
            paid: "0.00",
            remaining: "30.00",
          },
          {
            id: "d2",
            invoiceId: "i2",
            amount: "50.00",
            paid: "0.00",
            remaining: "40.00",
          },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        debt: {
          id: "d1",
          invoiceId: "i1",
          amount: "30.00",
          paid: "30.00",
          remaining: "0.00",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        debt: {
          id: "d2",
          invoiceId: "i2",
          amount: "50.00",
          paid: "10.00",
          remaining: "30.00",
        },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      payCustomerDebtAuto("c1", 40, "cash drawer", { clientOperationId: "customer-payment-op-1" }),
    ).resolves.toEqual({
      totalDebt: 80,
      totalRemaining: 30,
      debts: [
        expect.objectContaining({ id: "d1", paid: 30, remaining: 0 }),
        expect.objectContaining({ id: "d2", paid: 10, remaining: 30 }),
      ],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/debts/customer/c1", expect.objectContaining({
      method: "GET",
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/debts/d1/pay", expect.objectContaining({
      method: "POST",
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/debts/d2/pay", expect.objectContaining({
      method: "POST",
    }));
    expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain("/api/debts/customer/c1/pay");

    const [, firstPaymentInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(firstPaymentInit.body))).toEqual({
      amount: 30,
      notes: "cash drawer",
    });
    const [, secondPaymentInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(JSON.parse(String(secondPaymentInit.body))).toEqual({
      amount: 10,
      notes: "cash drawer",
    });
  });

  it("does not partially pay customer debts when the amount exceeds the summary", async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({
      summary: { totalAmount: "30.00", totalRemaining: "30.00" },
      debts: [{
        id: "d1",
        invoiceId: "i1",
        amount: "30.00",
        paid: "0.00",
        remaining: "30.00",
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(payCustomerDebtAuto("c1", 40)).rejects.toThrow("مبلغ التسديد أكبر من إجمالي الدين");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
