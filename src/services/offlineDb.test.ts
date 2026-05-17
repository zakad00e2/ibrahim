import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Product, SaleRequest } from "../types";
import {
  listCachedProducts,
  offlineDb,
  queueOfflineOperation,
  replaceCachedProducts,
} from "./offlineDb";

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: "p1",
  name: "Tea",
  barcode: "123",
  price: 10,
  wholesalePrice: 7,
  stock: 4,
  minStock: 1,
  isActive: true,
  ...overrides,
});

describe("offlineDb", () => {
  beforeEach(async () => {
    await offlineDb.delete();
    await offlineDb.open();
  });

  it("replaces cached products without keeping stale rows", async () => {
    await replaceCachedProducts([
      makeProduct({ id: "p1", name: "Tea" }),
      makeProduct({ id: "p2", name: "Sugar", barcode: "456" }),
    ]);

    await replaceCachedProducts([makeProduct({ id: "p2", name: "Sugar", barcode: "456" })]);

    await expect(listCachedProducts({ search: "", isActive: true, page: 1, limit: 20 })).resolves.toEqual({
      items: [makeProduct({ id: "p2", name: "Sugar", barcode: "456" })],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it("filters cached products by search, active state, and page", async () => {
    await replaceCachedProducts([
      makeProduct({ id: "p1", name: "Tea", barcode: "123", isActive: true }),
      makeProduct({ id: "p2", name: "Tea Bags", barcode: "456", isActive: true }),
      makeProduct({ id: "p3", name: "Coffee", barcode: "789", isActive: false }),
    ]);

    await expect(listCachedProducts({ search: "tea", isActive: true, page: 2, limit: 1 })).resolves.toEqual({
      items: [makeProduct({ id: "p2", name: "Tea Bags", barcode: "456", isActive: true })],
      total: 2,
      page: 2,
      limit: 1,
    });
  });

  it("queues write operations with createdAt metadata", async () => {
    const sale: SaleRequest = {
      items: [],
      paymentMethod: "cash",
    };

    const id = await queueOfflineOperation({ type: "createInvoice", payload: sale });
    const saved = await offlineDb.offlineQueue.get(id);

    expect(saved?.type).toBe("createInvoice");
    expect(saved?.payload).toEqual(sale);
    expect(saved?.createdAt).toEqual(expect.any(String));
  });
});
