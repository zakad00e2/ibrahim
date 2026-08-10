import { deleteJson, getJson, patchJson, postJson } from "./apiClient";
import type { Product, ProductInput } from "../types";
import { toMoneyNumber } from "../utils/money";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const parseApiNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const parseApiMoney = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = toMoneyNumber(
    typeof value === "string" || typeof value === "number" ? value : undefined,
    Number.NaN,
  );

  return Number.isFinite(parsed) ? parsed : null;
};

const getApiNumber = (dto: Record<string, unknown>, keys: string[], fallback = 0): number => {
  for (const key of keys) {
    const parsed = parseApiNumber(dto[key]);

    if (parsed !== null) {
      return parsed;
    }
  }

  return fallback;
};

const getApiMoney = (dto: Record<string, unknown>, keys: string[], fallback = 0): number => {
  for (const key of keys) {
    const parsed = parseApiMoney(dto[key]);

    if (parsed !== null) {
      return parsed;
    }
  }

  return fallback;
};

const getWholesalePrice = (dto: Record<string, unknown>): number => {
  const wholesalePrice = parseApiMoney(dto.wholesalePrice);

  if (wholesalePrice !== null && wholesalePrice !== 0) {
    return wholesalePrice;
  }

  return getApiMoney(
    dto,
    ["unitCost", "costPrice", "purchasePrice", "wholesale_price", "wholeSalePrice"],
    wholesalePrice ?? 0,
  );
};

const requireFiniteNumber = (value: number, label: string): number => {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  return value;
};

const productFromResponse = (payload: unknown): Product =>
  mapProduct(isRecord(payload) && (isRecord(payload.product) || isRecord(payload.data))
    ? (payload.product ?? payload.data)
    : payload);

const valuesMatch = (actual: number, expected: number): boolean =>
  Math.abs(actual - expected) < 0.005;

const DUPLICATE_BARCODE_MESSAGE = "يوجد منتج بهذا الباركود بالفعل في متجرك";

const isHttpNotFound = (error: unknown): boolean =>
  error instanceof Error &&
  "statusCode" in error &&
  (error as Error & { statusCode?: number }).statusCode === 404;

const assertWholesalePriceSaved = async (
  product: Product,
  expectedWholesalePrice: number | undefined,
): Promise<Product> => {
  if (
    expectedWholesalePrice === undefined ||
    valuesMatch(product.wholesalePrice, expectedWholesalePrice)
  ) {
    return product;
  }

  if (product.id) {
    const retryPayload = await patchJson(`/api/products/${encodeURIComponent(product.id)}`, {
      wholesalePrice: expectedWholesalePrice,
    });
    const retryProduct = productFromResponse(retryPayload);

    if (valuesMatch(retryProduct.wholesalePrice, expectedWholesalePrice)) {
      return retryProduct;
    }

    const freshProduct = await getProductById(product.id);

    if (valuesMatch(freshProduct.wholesalePrice, expectedWholesalePrice)) {
      return freshProduct;
    }
  }

  throw new Error("الخادم لم يحفظ سعر الجملة. تم إرسال القيمة لكن API أعادها بقيمة مختلفة.");
};

const assertStockSaved = async (
  product: Product,
  expectedStock: number | undefined,
): Promise<Product> => {
  if (expectedStock === undefined || product.stock === expectedStock) {
    return product;
  }

  if (product.id) {
    const retryPayload = await patchJson(`/api/products/${encodeURIComponent(product.id)}`, {
      stock: expectedStock,
    });
    const retryProduct = productFromResponse(retryPayload);

    if (retryProduct.stock === expectedStock) {
      return retryProduct;
    }

    const freshProduct = await getProductById(product.id);

    if (freshProduct.stock === expectedStock) {
      return freshProduct;
    }
  }

  throw new Error("لم يحفظ الخادم كمية المخزون اليدوية.");
};

export const mapProduct = (dto: unknown): Product => {
  if (!isRecord(dto)) {
    throw new Error("invalid product dto");
  }

  const piecesPerCarton = parseApiNumber(dto.piecesPerCarton ?? dto.pieces_per_carton);
  const cartonPurchasePrice = parseApiMoney(dto.cartonPurchasePrice ?? dto.carton_purchase_price);
  const cartonSalePrice = parseApiMoney(dto.cartonSalePrice ?? dto.carton_sale_price);

  return {
    id: String(dto.id ?? ""),
    name: String(dto.name ?? ""),
    barcode: String(dto.barcode ?? ""),
    price: getApiMoney(dto, ["price"]),
    wholesalePrice: getWholesalePrice(dto),
    stock: getApiNumber(dto, ["stock"]),
    minStock: getApiNumber(dto, ["minStock"], 5),
    isActive: dto.isActive !== false,
    ...(piecesPerCarton === null ? {} : { piecesPerCarton }),
    ...(cartonPurchasePrice === null ? {} : { cartonPurchasePrice }),
    ...(cartonSalePrice === null ? {} : { cartonSalePrice }),
  };
};

export type ProductsListResult = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};

export type ListProductsParams = {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
};

const buildQuery = (params: ListProductsParams): string => {
  const entries: string[] = [];

  if (params.search !== undefined && params.search !== "") {
    entries.push(`search=${encodeURIComponent(params.search)}`);
  }

  if (params.isActive !== undefined) {
    entries.push(`isActive=${String(params.isActive)}`);
  }

  if (params.page !== undefined) {
    entries.push(`page=${params.page}`);
  }

  if (params.limit !== undefined) {
    entries.push(`limit=${params.limit}`);
  }

  return entries.length ? `?${entries.join("&")}` : "";
};

const extractList = (payload: unknown): { items: unknown[]; total: number; page: number; limit: number } => {
  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length, page: 1, limit: payload.length };
  }

  if (isRecord(payload)) {
    const data = payload.data ?? payload.items ?? payload.products;

    if (Array.isArray(data)) {
      const meta = isRecord(payload.meta) ? payload.meta : payload;

      return {
        items: data,
        total: Number((meta as Record<string, unknown>).total ?? (meta as Record<string, unknown>).totalCount ?? data.length),
        page: Number((meta as Record<string, unknown>).page ?? (meta as Record<string, unknown>).currentPage ?? 1),
        limit: Number((meta as Record<string, unknown>).limit ?? (meta as Record<string, unknown>).pageSize ?? data.length),
      };
    }
  }

  return { items: [], total: 0, page: 1, limit: 20 };
};

export const listProducts = async (params: ListProductsParams = {}): Promise<ProductsListResult> => {
  const payload = await getJson(`/api/products${buildQuery(params)}`);
  const { items, total, page, limit } = extractList(payload);

  return {
    items: items.map(mapProduct),
    total,
    page,
    limit,
  };
};

export const getLowStockProducts = async (): Promise<Product[]> => {
  const payload = await getJson("/api/products/low-stock");
  const { items } = extractList(payload);

  return items.map(mapProduct);
};

export const getProductByBarcode = async (barcode: string): Promise<Product> => {
  const payload = await getJson(`/api/products/barcode/${encodeURIComponent(barcode)}`);

  return productFromResponse(payload);
};

export const getProductById = async (id: string): Promise<Product> => {
  const payload = await getJson(`/api/products/${encodeURIComponent(id)}`);

  return mapProduct(isRecord(payload) && isRecord(payload.product) ? payload.product : payload);
};

const assertBarcodeAvailable = async (barcode: string, currentProductId?: string): Promise<void> => {
  const normalizedBarcode = barcode.trim();

  if (!normalizedBarcode) return;

  try {
    const existingProduct = await getProductByBarcode(normalizedBarcode);

    if (!currentProductId || existingProduct.id !== currentProductId) {
      throw new Error(DUPLICATE_BARCODE_MESSAGE);
    }
  } catch (error) {
    if (isHttpNotFound(error)) return;
    throw error;
  }
};

export const createProduct = async (input: ProductInput): Promise<Product> => {
  await assertBarcodeAvailable(input.barcode);

  const cartonPayload = input.piecesPerCarton === undefined
    ? {}
    : {
        piecesPerCarton: requireFiniteNumber(input.piecesPerCarton, "piecesPerCarton"),
        cartonCount: requireFiniteNumber(input.cartonCount ?? Number.NaN, "cartonCount"),
        cartonPurchasePrice: requireFiniteNumber(input.cartonPurchasePrice ?? Number.NaN, "cartonPurchasePrice"),
        cartonSalePrice: requireFiniteNumber(input.cartonSalePrice ?? Number.NaN, "cartonSalePrice"),
      };

  const payload = await postJson("/api/products", {
    name: input.name.trim(),
    barcode: input.barcode.trim(),
    price: requireFiniteNumber(input.price, "price"),
    wholesalePrice: requireFiniteNumber(input.wholesalePrice, "wholesalePrice"),
    stock: requireFiniteNumber(input.stock, "stock"),
    minStock: requireFiniteNumber(input.minStock, "minStock"),
    ...cartonPayload,
  });

  const productWithWholesalePrice = await assertWholesalePriceSaved(
    productFromResponse(payload),
    input.wholesalePrice,
  );

  return assertStockSaved(productWithWholesalePrice, input.stock);
};

export const updateProduct = async (id: string, input: Partial<ProductInput> & { isActive?: boolean }): Promise<Product> => {
  if (input.barcode !== undefined) {
    await assertBarcodeAvailable(input.barcode, id);
  }

  const { cartonCount: _cartonCount, ...updateInput } = input;
  const payload = await patchJson(`/api/products/${encodeURIComponent(id)}`, {
    ...updateInput,
    name: updateInput.name?.trim(),
    barcode: updateInput.barcode?.trim(),
    price: updateInput.price === undefined ? undefined : requireFiniteNumber(updateInput.price, "price"),
    wholesalePrice:
      updateInput.wholesalePrice === undefined
        ? undefined
        : requireFiniteNumber(updateInput.wholesalePrice, "wholesalePrice"),
    stock: updateInput.stock === undefined ? undefined : requireFiniteNumber(updateInput.stock, "stock"),
    minStock: updateInput.minStock === undefined ? undefined : requireFiniteNumber(updateInput.minStock, "minStock"),
  });

  return assertWholesalePriceSaved(productFromResponse(payload), input.wholesalePrice);
};

export const deleteProduct = async (id: string): Promise<void> => {
  await deleteJson(`/api/products/${encodeURIComponent(id)}`);
};
