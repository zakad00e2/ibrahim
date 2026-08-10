import { describe, expect, it } from "vitest";
import {
  deriveCartonValues,
  getInvoiceItemKey,
  getInvoiceItemStockQuantity,
} from "./carton";

describe("carton helpers", () => {
  it("derives initial piece stock and per-piece wholesale price", () => {
    expect(
      deriveCartonValues({
        cartonCount: 3,
        piecesPerCarton: 12,
        cartonPurchasePrice: 180,
      }),
    ).toEqual({ stock: 36, wholesalePrice: 15 });
  });

  it("treats a legacy invoice line as a piece sale", () => {
    expect(getInvoiceItemKey({ productId: "p1" })).toBe("p1:unit");
    expect(getInvoiceItemStockQuantity({ quantity: 4 })).toBe(4);
  });

  it("uses the persisted carton stock snapshot", () => {
    expect(getInvoiceItemKey({ productId: "p1", saleUnit: "carton" })).toBe("p1:carton");
    expect(
      getInvoiceItemStockQuantity({
        quantity: 2,
        saleUnit: "carton",
        stockQuantity: 24,
      }),
    ).toBe(24);
  });
});
