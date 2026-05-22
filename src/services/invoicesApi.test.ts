import { afterEach, describe, expect, it, vi } from "vitest";
import { getInvoiceByNumber, listInvoices } from "./invoicesApi";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("invoicesApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps backend string money fields into numeric invoice models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        id: "i1",
        number: 12,
        createdAt: "2026-05-22T10:00:00.000Z",
        total: "100.25",
        paid: "40.10",
        remaining: "60.15",
        paymentMethod: "PARTIAL",
        items: [{
          productId: "p1",
          productName: "Tea",
          barcode: "123",
          price: "10.05",
          unitCost: "7.01",
          total: "20.10",
          quantity: 2,
        }],
      }],
      meta: {
        total: 1,
        page: 1,
        limit: 100,
      },
    })));

    await expect(listInvoices({ page: 1, limit: 100 })).resolves.toEqual({
      items: [expect.objectContaining({
        total: 100.25,
        paid: 40.1,
        remaining: 60.15,
        items: [expect.objectContaining({
          price: 10.05,
          wholesalePrice: 7.01,
          total: 20.1,
        })],
      })],
      total: 1,
      page: 1,
      limit: 100,
    });
  });

  it("uses the backend by-number endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: "i12",
      number: 12,
      total: "10",
      paid: "10",
      remaining: "0",
      items: [],
      paymentMethod: "CASH",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await getInvoiceByNumber("12");

    expect(fetchMock).toHaveBeenCalledWith("/api/invoices/by-number/12", expect.objectContaining({
      method: "GET",
    }));
  });
});
