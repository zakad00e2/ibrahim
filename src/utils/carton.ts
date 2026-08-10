import type { InvoiceItem, SaleUnit } from "../types";
import { toMoneyNumber } from "./money";

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
  wholesalePrice: toMoneyNumber(cartonPurchasePrice / piecesPerCarton),
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
