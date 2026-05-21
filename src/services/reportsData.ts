import type { Customer, DebtSummary, Invoice, Product } from "../types";
import { getCustomerDebts } from "./debtsApi";
import { getInvoiceById, listInvoices, type InvoicesListResult } from "./invoicesApi";
import { listCustomers, type CustomersListResult } from "./customersApi";
import { listProducts, type ProductsListResult } from "./productsApi";

export const REPORTS_PAGE_SIZE = 100;

export type ReportsDataset = {
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
};

type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

const collectPaginatedItems = async <T>(
  loadPage: (page: number) => Promise<PaginatedResult<T>>,
): Promise<T[]> => {
  const items: T[] = [];
  let page = 1;

  for (let fetchedPages = 0; fetchedPages < 500; fetchedPages += 1) {
    const result = await loadPage(page);
    items.push(...result.items);

    const total = Number.isFinite(result.total) ? Math.max(0, result.total) : 0;
    if (result.items.length === 0) break;
    if (total > 0) {
      if (items.length >= total) break;
    } else {
      const limit = Number.isFinite(result.limit) && result.limit > 0 ? result.limit : REPORTS_PAGE_SIZE;
      if (result.items.length < limit) break;
    }

    page = Number.isFinite(result.page) && result.page >= page ? result.page + 1 : page + 1;
  }

  return items;
};

const loadReportProducts = (): Promise<Product[]> =>
  collectPaginatedItems<Product>((page): Promise<ProductsListResult> =>
    listProducts({ isActive: true, page, limit: REPORTS_PAGE_SIZE }),
  );

const loadReportCustomers = async (): Promise<Customer[]> => {
  const customers = await collectPaginatedItems<Customer>((page): Promise<CustomersListResult> =>
    listCustomers({ page, limit: REPORTS_PAGE_SIZE }),
  );

  const customersNeedingDebtSummary = customers.filter(
    (customer) => customer.debtBalance === undefined && customer.debts.length === 0,
  );
  if (customersNeedingDebtSummary.length === 0) return customers;

  const settled = await Promise.allSettled(
    customersNeedingDebtSummary.map(async (customer) => ({
      customerId: customer.id,
      summary: await getCustomerDebts(customer.id),
    })),
  );
  const summariesByCustomerId = new Map<string, DebtSummary>();

  settled.forEach((result) => {
    if (result.status === "fulfilled") {
      summariesByCustomerId.set(result.value.customerId, result.value.summary);
    }
  });

  if (summariesByCustomerId.size === 0) return customers;

  return customers.map((customer) => {
    const summary = summariesByCustomerId.get(customer.id);
    return summary
      ? { ...customer, debts: summary.debts, debtBalance: summary.totalRemaining }
      : customer;
  });
};

const hydrateInvoiceItems = async (invoices: Invoice[]): Promise<Invoice[]> => {
  const invoicesWithoutItems = invoices.filter((invoice) => invoice.id && invoice.items.length === 0);
  if (invoicesWithoutItems.length === 0) return invoices;

  const settled = await Promise.allSettled(
    invoicesWithoutItems.map((invoice) => getInvoiceById(invoice.id)),
  );
  const detailsById = new Map<string, Invoice>();

  settled.forEach((result) => {
    if (result.status === "fulfilled") {
      detailsById.set(result.value.id, result.value);
    }
  });

  if (detailsById.size === 0) return invoices;
  return invoices.map((invoice) => detailsById.get(invoice.id) ?? invoice);
};

const loadReportInvoices = async (): Promise<Invoice[]> => {
  const invoices = await collectPaginatedItems<Invoice>((page): Promise<InvoicesListResult> =>
    listInvoices({ page, limit: REPORTS_PAGE_SIZE }),
  );
  return hydrateInvoiceItems(invoices);
};

export const loadReportsDataset = async (): Promise<ReportsDataset> => {
  const [products, customers, invoices] = await Promise.all([
    loadReportProducts(),
    loadReportCustomers(),
    loadReportInvoices(),
  ]);

  return { products, customers, invoices };
};
