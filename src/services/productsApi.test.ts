import { afterEach, describe, expect, it, vi } from "vitest";
import { createProduct, getProductById, mapProduct, updateProduct } from "./productsApi";
import type { Product, ProductInput } from "../types";

const makeProductInput = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  name: "Tea",
  barcode: "123",
  price: 10,
  wholesalePrice: 7,
  stock: 4,
  minStock: 1,
  isActive: true,
  ...overrides,
});

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

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("productsApi barcode uniqueness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks creating a product when another product already uses the barcode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeProduct({ id: "existing-product" })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createProduct(makeProductInput())).rejects.toThrow("يوجد منتج بهذا الباركود بالفعل في متجرك");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/products/barcode/123", expect.objectContaining({ method: "GET" }));
  });

  it("allows creating a product when the barcode lookup returns not found", async () => {
    const created = makeProduct({ id: "new-product" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Not found" }, 404))
      .mockResolvedValueOnce(jsonResponse(created));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createProduct(makeProductInput())).resolves.toEqual(created);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/products/barcode/123", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/products", expect.objectContaining({ method: "POST" }));
  });

  it("does not send isActive when creating a product", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Not found" }, 404))
      .mockResolvedValueOnce(jsonResponse(makeProduct({ id: "new-product" })));
    vi.stubGlobal("fetch", fetchMock);

    await createProduct(makeProductInput());

    const createOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const requestBody = JSON.parse(String(createOptions.body)) as Record<string, unknown>;

    expect(requestBody).not.toHaveProperty("isActive");
  });

  it("blocks updating a product to a barcode used by a different product", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeProduct({ id: "other-product" })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateProduct("current-product", makeProductInput())).rejects.toThrow(
      "يوجد منتج بهذا الباركود بالفعل في متجرك",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/products/barcode/123", expect.objectContaining({ method: "GET" }));
  });

  it("allows updating a product when the barcode lookup returns the same product", async () => {
    const updated = makeProduct({ id: "current-product", name: "Updated tea" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ product: makeProduct({ id: "current-product" }) }))
      .mockResolvedValueOnce(jsonResponse(updated));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateProduct("current-product", makeProductInput({ name: "Updated tea" }))).resolves.toEqual(updated);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/products/barcode/123", expect.objectContaining({ method: "GET" }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/products/current-product",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("maps product price strings through money normalization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      product: {
        id: "p1",
        name: "Tea",
        barcode: "123",
        price: "0.30000000000000004",
        unitCost: "0.10000000000000002",
        stock: 4,
        minStock: 1,
        isActive: true,
      },
    })));

    await expect(getProductById("p1")).resolves.toMatchObject({
      price: 0.3,
      wholesalePrice: 0.1,
    });
  });

  it("maps optional carton data without changing legacy products", () => {
    expect(mapProduct({ id: "legacy", name: "Legacy", barcode: "1", price: 8, stock: 9 }))
      .toMatchObject({ id: "legacy", stock: 9 });
    expect(mapProduct({ id: "legacy", name: "Legacy", barcode: "1", price: 8, stock: 9 }))
      .not.toHaveProperty("piecesPerCarton");

    expect(mapProduct({
      id: "carton", name: "Tea", barcode: "2", price: 5, stock: 24,
      piecesPerCarton: 12, cartonPurchasePrice: "180", cartonSalePrice: "240",
    })).toMatchObject({ piecesPerCarton: 12, cartonPurchasePrice: 180, cartonSalePrice: 240 });
  });

  it("sends carton entry data only when it is provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Not found" }, 404))
      .mockResolvedValueOnce(jsonResponse(makeProduct({ id: "carton", stock: 36, wholesalePrice: 15 })));
    vi.stubGlobal("fetch", fetchMock);

    await createProduct(makeProductInput({
      stock: 36,
      wholesalePrice: 15,
      piecesPerCarton: 12,
      cartonCount: 3,
      cartonPurchasePrice: 180,
      cartonSalePrice: 240,
    }));

    const requestBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(requestBody).toMatchObject({
      piecesPerCarton: 12,
      cartonCount: 3,
      cartonPurchasePrice: 180,
      cartonSalePrice: 240,
    });
  });

  it("restores manually entered stock when a carton creation response recalculates it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Not found" }, 404))
      .mockResolvedValueOnce(jsonResponse(makeProduct({ id: "carton", stock: 96, wholesalePrice: 0.83 })))
      .mockResolvedValueOnce(jsonResponse(makeProduct({ id: "carton", stock: 100, wholesalePrice: 0.83 })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createProduct(makeProductInput({
      stock: 100,
      wholesalePrice: 0.83,
      piecesPerCarton: 24,
      cartonCount: 4,
      cartonPurchasePrice: 20,
      cartonSalePrice: 30,
    }))).resolves.toMatchObject({ stock: 100, wholesalePrice: 0.83 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/products/carton",
      expect.objectContaining({ method: "PATCH" }),
    );
    const patchOptions = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(patchOptions.body))).toEqual({ stock: 100 });
  });
});
