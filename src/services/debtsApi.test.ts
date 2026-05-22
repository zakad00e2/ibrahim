import { afterEach, describe, expect, it, vi } from "vitest";
import { getCustomerDebts, payDebt } from "./debtsApi";

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
});
