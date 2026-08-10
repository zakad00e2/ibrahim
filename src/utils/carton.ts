import Decimal from "decimal.js";
import type { InvoiceItem, SaleUnit } from "../types";

export type CartonValuesInput = {
  cartonCount: number;
  piecesPerCarton: number;
  cartonPurchasePrice: number;
};

export const deriveCartonValues = ({
  cartonCount,
  piecesPerCarton,
  cartonPurchasePrice,
}: CartonValuesInput): { stock: number; wholesalePrice: number } => ({
  stock: cartonCount * piecesPerCarton,
  wholesalePrice: new Decimal(cartonPurchasePrice)
    .div(piecesPerCarton)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber(),
});

export const getSaleUnit = (item: Pick<InvoiceItem, "saleUnit">): SaleUnit =>
  item.saleUnit === "carton" ? "carton" : "unit";

export const getInvoiceItemKey = (
  item: Pick<InvoiceItem, "productId" | "saleUnit">,
): string => `${item.productId}:${getSaleUnit(item)}`;

export const getInvoiceItemStockQuantity = (
  item: Pick<InvoiceItem, "quantity" | "saleUnit" | "stockQuantity">,
): number =>
  Number.isFinite(item.stockQuantity) ? Math.max(0, item.stockQuantity ?? 0) : item.quantity;
