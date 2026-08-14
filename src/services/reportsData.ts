import type { Invoice, Product } from "../types";
import { getInvoiceById, listInvoices, type InvoicesListResult } from "./invoicesApi";
import { listProducts, type ProductsListResult } from "./productsApi";

export const REPORTS_PAGE_SIZE = 100;
export const REPORTS_CONCURRENCY_LIMIT = 4;
const REPORTS_MAX_PAGES = 500;
const REPORTS_MAX_ITEMS = REPORTS_PAGE_SIZE * REPORTS_MAX_PAGES;

export type ReportsDataset = {
  products: Product[];
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

  for (let fetchedPages = 0; fetchedPages < REPORTS_MAX_PAGES; fetchedPages += 1) {
    const result = await loadPage(page);
    items.push(...result.items);

    const total = Number.isFinite(result.total) ? Math.max(0, result.total) : 0;
    if (result.items.length === 0 || items.length >= REPORTS_MAX_ITEMS) break;
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

const settleWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> => {
  const safeLimit = Math.max(1, Math.floor(limit));
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= items.length) return;

    try {
      results[index] = { status: "fulfilled", value: await worker(items[index]) };
    } catch (reason) {
      results[index] = { status: "rejected", reason };
    }

    await runNext();
  };

  await Promise.all(Array.from({ length: Math.min(safeLimit, items.length) }, runNext));
  return results;
};

const loadReportProducts = (): Promise<Product[]> =>
  collectPaginatedItems<Product>((page): Promise<ProductsListResult> =>
    listProducts({ isActive: true, page, limit: REPORTS_PAGE_SIZE }),
  );

const hydrateInvoiceItems = async (invoices: Invoice[]): Promise<Invoice[]> => {
  const invoicesWithoutItems = invoices.filter((invoice) => invoice.id && invoice.items.length === 0);
  if (invoicesWithoutItems.length === 0) return invoices;

  const settled = await settleWithConcurrency(
    invoicesWithoutItems,
    REPORTS_CONCURRENCY_LIMIT,
    (invoice) => getInvoiceById(invoice.id),
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
  const [products, invoices] = await Promise.all([
    loadReportProducts(),
    loadReportInvoices(),
  ]);

  return { products, invoices };
};
