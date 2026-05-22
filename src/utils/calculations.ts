import type { Customer, Debt, Invoice, InvoiceItem, PaymentMethod, Product } from "../types";
import { addMoney, compareMoney, multiplyMoney, subtractMoney, sumMoney } from "./money";

export type DebtPaymentValidationError = "missing-debt" | "invalid-amount" | "amount-exceeds-remaining";

export const calculateInvoiceItemTotal = (price: number, quantity: number) =>
  multiplyMoney(price, quantity);

export const calculateItemsTotal = (items: InvoiceItem[]) =>
  sumMoney(items.map((item) => calculateInvoiceItemTotal(item.price, item.quantity)));

export const calculateInvoiceItemCost = (wholesalePrice: number, quantity: number) =>
  multiplyMoney(wholesalePrice, quantity);

export const calculateItemsCost = (items: InvoiceItem[]) =>
  sumMoney(items.map((item) => calculateInvoiceItemCost(item.wholesalePrice, item.quantity)));

export const calculateItemsProfit = (items: InvoiceItem[]) =>
  sumMoney(items.map((item) => multiplyMoney(subtractMoney(item.price, item.wholesalePrice), item.quantity)));

export const calculateCustomerDebt = (debts: Customer["debts"]) =>
  sumMoney(debts.map((debt) => debt.remaining));

export const getCustomerDebtTotal = (customer: Pick<Customer, "debts" | "debtBalance">) => {
  const calculated = calculateCustomerDebt(customer.debts);
  return customer.debts.length > 0 ? calculated : (customer.debtBalance ?? calculated);
};

export const validateDebtPaymentAmount = (
  debt: Pick<Debt, "remaining"> | null | undefined,
  amount: number,
): DebtPaymentValidationError | null => {
  if (!debt) {
    return "missing-debt";
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return "invalid-amount";
  }

  return compareMoney(amount, debt.remaining) === 1 ? "amount-exceeds-remaining" : null;
};

export const getStockStatus = (stock: number) => {
  if (stock === 0) {
    return { label: "نفد المخزون", tone: "danger" as const };
  }

  if (stock < 5) {
    return { label: "كمية قليلة", tone: "warning" as const };
  }

  return { label: "متوفر", tone: "success" as const };
};

export const getPaymentMethodLabel = (paymentMethod: PaymentMethod) => {
  const labels: Record<PaymentMethod, string> = {
    cash: "كاش",
    debt: "دين",
    partial: "دفع جزئي",
  };

  return labels[paymentMethod];
};

export const getTopSellingProducts = (invoices: Invoice[]) => {
  const byProduct = new Map<string, { name: string; quantity: number; total: number }>();

  invoices.forEach((invoice) => {
    invoice.items.forEach((item) => {
      const productKey = item.productId || item.productName || item.barcode;
      if (!productKey) return;

      const productName = item.productName || item.barcode || "منتج غير مسمى";
      const lineTotal = item.total || calculateInvoiceItemTotal(item.price, item.quantity);
      const current = byProduct.get(productKey) ?? {
        name: productName,
        quantity: 0,
        total: 0,
      };

      byProduct.set(productKey, {
        name: productName || current.name,
        quantity: current.quantity + item.quantity,
        total: addMoney(current.total, lineTotal),
      });
    });
  });

  return Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
};

export const findProductByBarcode = (products: Product[], barcode: string) =>
  products.find((product) => product.barcode === barcode.trim());
