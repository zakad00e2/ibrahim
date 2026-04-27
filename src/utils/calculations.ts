import type { Customer, Invoice, InvoiceItem, PaymentMethod, Product } from "../types";

export const calculateInvoiceItemTotal = (price: number, quantity: number) => price * quantity;

export const calculateItemsTotal = (items: InvoiceItem[]) =>
  items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export const calculateCustomerDebt = (debts: Customer["debts"]) =>
  debts.reduce((sum, debt) => sum + debt.remaining, 0);

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
      const current = byProduct.get(item.productId) ?? {
        name: item.productName,
        quantity: 0,
        total: 0,
      };

      byProduct.set(item.productId, {
        name: item.productName,
        quantity: current.quantity + item.quantity,
        total: current.total + item.total,
      });
    });
  });

  return Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
};

export const findProductByBarcode = (products: Product[], barcode: string) =>
  products.find((product) => product.barcode === barcode.trim());
