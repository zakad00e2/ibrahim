import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invoice, Product } from "../types";
import { getInvoiceById, listInvoices } from "./invoicesApi";
import { listProducts } from "./productsApi";
import { loadReportsDataset, REPORTS_CONCURRENCY_LIMIT, REPORTS_PAGE_SIZE } from "./reportsData";

vi.mock("./productsApi", () => ({
  listProducts: vi.fn(),
}));

vi.mock("./invoicesApi", () => ({
  getInvoiceById: vi.fn(),
  listInvoices: vi.fn(),
}));

const product = (id: string, stock: number): Product => ({
  id,
  name: `Product ${id}`,
  barcode: id,
  price: 10,
  wholesalePrice: 5,
  stock,
  minStock: 5,
  isActive: true,
});

const invoice = (id: string, itemQuantity = 0): Invoice => ({
  id,
  number: id,
  date: "2026-05-21T10:00:00.000Z",
  customerName: "Customer",
  items: itemQuantity > 0
    ? [{
        productId: `product-${id}`,
        productName: `Product ${id}`,
        barcode: id,
        price: 10,
        wholesalePrice: 5,
        quantity: itemQuantity,
        total: itemQuantity * 10,
      }]
    : [],
  total: itemQuantity * 10,
  paid: itemQuantity * 10,
  remaining: 0,
  paymentMethod: "cash",
});

describe("loadReportsDataset", () => {
  beforeEach(() => {
    vi.mocked(listProducts).mockReset();
    vi.mocked(listInvoices).mockReset();
    vi.mocked(getInvoiceById).mockReset();
  });

  it("keeps report pagination at the backend maximum", () => {
    expect(REPORTS_PAGE_SIZE).toBe(100);
  });

  it("loads complete report table data independently from paginated invoice pages", async () => {
    const productsPage = [product("p1", 2), product("p2", 9)];
    const invoicesPageOne = [invoice("i1", 1)];
    const invoicesPageTwo = [invoice("i2")];
    const hydratedInvoice = invoice("i2", 3);

    vi.mocked(listProducts).mockResolvedValue({
      items: productsPage,
      total: productsPage.length,
      page: 1,
      limit: REPORTS_PAGE_SIZE,
    });
    vi.mocked(listInvoices)
      .mockResolvedValueOnce({
        items: invoicesPageOne,
        total: 2,
        page: 1,
        limit: 1,
      })
      .mockResolvedValueOnce({
        items: invoicesPageTwo,
        total: 2,
        page: 2,
        limit: 1,
      });
    vi.mocked(getInvoiceById).mockResolvedValue(hydratedInvoice);

    const dataset = await loadReportsDataset();

    expect(listProducts).toHaveBeenCalledWith({
      isActive: true,
      page: 1,
      limit: REPORTS_PAGE_SIZE,
    });
    expect(listInvoices).toHaveBeenNthCalledWith(1, {
      page: 1,
      limit: REPORTS_PAGE_SIZE,
    });
    expect(listInvoices).toHaveBeenNthCalledWith(2, {
      page: 2,
      limit: REPORTS_PAGE_SIZE,
    });
    expect(dataset).toEqual({
      products: productsPage,
      invoices: [invoicesPageOne[0], hydratedInvoice],
    });
  });

  it("bounds concurrent report invoice detail hydration requests", async () => {
    const invoicesPage = Array.from({ length: 12 }, (_, index) => invoice(`i${index}`));
    let activeInvoiceRequests = 0;
    let maxInvoiceRequests = 0;

    vi.mocked(listProducts).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: REPORTS_PAGE_SIZE,
    });
    vi.mocked(listInvoices).mockResolvedValue({
      items: invoicesPage,
      total: invoicesPage.length,
      page: 1,
      limit: REPORTS_PAGE_SIZE,
    });
    vi.mocked(getInvoiceById).mockImplementation(async (id: string) => {
      activeInvoiceRequests += 1;
      maxInvoiceRequests = Math.max(maxInvoiceRequests, activeInvoiceRequests);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeInvoiceRequests -= 1;
      return invoice(id, 1);
    });

    await loadReportsDataset();

    expect(maxInvoiceRequests).toBeLessThanOrEqual(REPORTS_CONCURRENCY_LIMIT);
  });
});
