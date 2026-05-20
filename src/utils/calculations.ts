import type { Customer, Debt, Invoice, InvoiceItem, PaymentMethod, Product } from "../types";

export type DebtPaymentValidationError = "missing-debt" | "invalid-amount" | "amount-exceeds-remaining";

export const calculateInvoiceItemTotal = (price: number, quantity: number) => price * quantity;

export const calculateItemsTotal = (items: InvoiceItem[]) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export const calculateInvoiceItemCost = (wholesalePrice: number, quantity: number) =>
  wholesalePrice * quantity;

export const calculateItemsCost = (items: InvoiceItem[]) =>
  items.reduce((sum, item) => sum + calculateInvoiceItemCost(item.wholesalePrice, item.quantity), 0);

export const calculateItemsProfit = (items: InvoiceItem[]) =>
  items.reduce((sum, item) => sum + (item.price - item.wholesalePrice) * item.quantity, 0);

export const calculateCustomerDebt = (debts: Customer["debts"]) =>
  debts.reduce((sum, debt) => sum + debt.remaining, 0);

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

  return amount > debt.remaining ? "amount-exceeds-remaining" : null;
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
        total: current.total + lineTotal,
      });
    });
  });

  return Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
};

export const findProductByBarcode = (products: Product[], barcode: string) =>
  products.find((product) => product.barcode === barcode.trim());
