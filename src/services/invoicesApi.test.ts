import { afterEach, describe, expect, it, vi } from "vitest";
import { createInvoice, getInvoiceByNumber, listInvoices } from "./invoicesApi";
import type { SaleRequest } from "../types";

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

  it("omits clientOperationId when clientInvoiceId is provided for invoice creation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: "server-invoice-1",
      number: 33,
      total: "20",
      paid: "20",
      remaining: "0",
      items: [],
      paymentMethod: "CASH",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request: SaleRequest = {
      items: [{
        productId: "product-1",
        productName: "Tea",
        barcode: "123",
        price: 10,
        wholesalePrice: 7,
        quantity: 2,
        total: 20,
      }],
      paymentMethod: "cash",
    };

    await createInvoice(request, { clientInvoiceId: "offline-invoice-1779012000000" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      paymentMethod: "CASH",
      clientInvoiceId: "offline-invoice-1779012000000",
      items: [{ productId: "product-1", quantity: 2 }],
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("clientOperationId");
  });

  it("omits clientInvoiceId for regular online invoice creation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      id: "server-invoice-2",
      number: 34,
      total: "10",
      paid: "10",
      remaining: "0",
      items: [],
      paymentMethod: "CASH",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createInvoice({
      items: [{
        productId: "product-2",
        productName: "Sugar",
        barcode: "456",
        price: 10,
        wholesalePrice: 8,
        quantity: 1,
        total: 10,
      }],
      paymentMethod: "cash",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("clientInvoiceId");
    expect(JSON.parse(String(init.body))).not.toHaveProperty("clientOperationId");
  });

  it("preserves carton sale units in invoice requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "i3", number: 3, total: 240, paid: 240, remaining: 0, items: [], paymentMethod: "CASH" }));
    vi.stubGlobal("fetch", fetchMock);
    await createInvoice({ items: [{ productId: "p1", productName: "Tea", barcode: "1", price: 240, wholesalePrice: 180, quantity: 1, total: 240, saleUnit: "carton", stockQuantity: 12 }], paymentMethod: "cash" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ items: [{ productId: "p1", quantity: 1, saleUnit: "carton" }] });
  });
});
