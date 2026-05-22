import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteCustomer, getCustomerById } from "./customersApi";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("customersApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves backend delete errors instead of assuming a foreign-key delete failure", async () => {
    mockFetch(
      new Response(JSON.stringify({ message: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(deleteCustomer("customer-1")).rejects.toThrow("Internal server error");
  });

  it("sends the delete request to the selected customer endpoint", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await expect(deleteCustomer("customer 1")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith("/api/customers/customer%201", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("maps backend string debt fields into numeric customer debt models", async () => {
    mockFetch(
      new Response(JSON.stringify({
        id: "c1",
        name: "Ibrahim",
        phone: "010",
        summary: {
          totalRemaining: "60.15",
        },
        debts: [{
          id: "d1",
          invoiceId: "i1",
          description: "Invoice",
          date: "2026-05-22T10:00:00.000Z",
          amount: "100.25",
          paid: "40.10",
          remaining: "60.15",
          payments: [{
            id: "p1",
            amount: "40.10",
            date: "2026-05-22T10:05:00.000Z",
          }],
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getCustomerById("c1")).resolves.toMatchObject({
      debtBalance: 60.15,
      debts: [{
        amount: 100.25,
        paid: 40.1,
        remaining: 60.15,
        payments: [{ amount: 40.1 }],
      }],
    });
  });
});
