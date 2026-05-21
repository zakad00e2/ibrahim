import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Customer, Invoice, Product } from "../types";
import { getCustomerDebts } from "./debtsApi";
import { getInvoiceById, listInvoices } from "./invoicesApi";
import { listProducts } from "./productsApi";
import { listCustomers } from "./customersApi";
import { loadReportsDataset, REPORTS_PAGE_SIZE } from "./reportsData";

vi.mock("./productsApi", () => ({
  listProducts: vi.fn(),
}));

vi.mock("./customersApi", () => ({
  listCustomers: vi.fn(),
}));

vi.mock("./invoicesApi", () => ({
  getInvoiceById: vi.fn(),
  listInvoices: vi.fn(),
}));

vi.mock("./debtsApi", () => ({
  getCustomerDebts: vi.fn(),
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

const customer = (id: string, debtBalance?: number): Customer => ({
  id,
  name: `Customer ${id}`,
  phone: "",
  debts: [],
  debtBalance,
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
    vi.mocked(listCustomers).mockReset();
    vi.mocked(listInvoices).mockReset();
    vi.mocked(getInvoiceById).mockReset();
    vi.mocked(getCustomerDebts).mockReset();
  });

  it("loads complete report data independently from paginated invoice and debt pages", async () => {
    const productsPage = [product("p1", 2), product("p2", 9)];
    const customersPage = [customer("c1", 25), customer("c2")];
    const invoicesPageOne = [invoice("i1", 1)];
    const invoicesPageTwo = [invoice("i2")];
    const hydratedInvoice = invoice("i2", 3);

    vi.mocked(listProducts).mockResolvedValue({
      items: productsPage,
      total: productsPage.length,
      page: 1,
      limit: REPORTS_PAGE_SIZE,
    });
    vi.mocked(listCustomers).mockResolvedValue({
      items: customersPage,
      total: customersPage.length,
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
    vi.mocked(getCustomerDebts).mockResolvedValue({
      totalDebt: 40,
      totalRemaining: 40,
      debts: [{
        id: "d1",
        invoiceId: "i2",
        description: "Debt",
        date: "2026-05-21T10:00:00.000Z",
        amount: 40,
        paid: 0,
        remaining: 40,
      }],
    });
    vi.mocked(getInvoiceById).mockResolvedValue(hydratedInvoice);

    const dataset = await loadReportsDataset();

    expect(listProducts).toHaveBeenCalledWith({
      isActive: true,
      page: 1,
      limit: REPORTS_PAGE_SIZE,
    });
    expect(listCustomers).toHaveBeenCalledWith({
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
    expect(dataset.products).toEqual(productsPage);
    expect(dataset.customers).toEqual([
      customersPage[0],
      {
        ...customersPage[1],
        debtBalance: 40,
        debts: expect.arrayContaining([expect.objectContaining({ id: "d1" })]),
      },
    ]);
    expect(dataset.invoices).toEqual([invoicesPageOne[0], hydratedInvoice]);
  });
});
