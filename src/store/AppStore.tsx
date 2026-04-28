import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { mockCustomers } from "../data/mockCustomers";
import { mockInvoices } from "../data/mockInvoices";
import { mockProducts } from "../data/mockProducts";
import {
  calculateCustomerDebt,
  calculateItemsTotal,
  calculateInvoiceItemTotal,
} from "../utils/calculations";
import type {
  ActionResult,
  Customer,
  CustomerInput,
  Invoice,
  InvoiceItem,
  InvoiceUpdateRequest,
  Product,
  ProductInput,
  SaleRequest,
} from "../types";

type AppStoreValue = {
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  addProduct: (input: ProductInput) => ActionResult;
  updateProduct: (id: string, input: ProductInput) => ActionResult;
  deleteProduct: (id: string) => void;
  addCustomer: (input: CustomerInput) => ActionResult;
  updateCustomer: (id: string, input: CustomerInput) => ActionResult;
  deleteCustomer: (id: string) => void;
  payCustomerDebt: (customerId: string, amount: number) => ActionResult;
  completeSale: (request: SaleRequest) => ActionResult;
  updateInvoice: (id: string, request: InvoiceUpdateRequest) => ActionResult;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const makeInvoiceNumber = (count: number) => `F-${String(1001 + count).padStart(4, "0")}`;

const validateProduct = (input: ProductInput, products: Product[], currentId?: string): string | null => {
  if (!input.name.trim()) {
    return "اسم المنتج مطلوب";
  }

  if (!input.barcode.trim()) {
    return "الباركود مطلوب";
  }

  if (!Number.isFinite(input.price) || input.price <= 0) {
    return "السعر يجب أن يكون أكبر من صفر";
  }

  if (!Number.isFinite(input.stock) || input.stock < 0) {
    return "الكمية يجب أن تكون صفر أو أكثر";
  }

  const duplicate = products.some(
    (product) => product.barcode === input.barcode.trim() && product.id !== currentId,
  );

  return duplicate ? "لا يمكن تكرار الباركود" : null;
};

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [invoices, setInvoices] = useState<Invoice[]>(mockInvoices);

  const value = useMemo<AppStoreValue>(() => {
    const addProduct = (input: ProductInput): ActionResult => {
      const error = validateProduct(input, products);

      if (error) {
        return { ok: false, message: error };
      }

      setProducts((current) => [
        ...current,
        {
          id: createId("p"),
          name: input.name.trim(),
          barcode: input.barcode.trim(),
          price: input.price,
          stock: input.stock,
        },
      ]);

      return { ok: true, message: "تمت إضافة المنتج بنجاح" };
    };

    const updateProduct = (id: string, input: ProductInput): ActionResult => {
      const error = validateProduct(input, products, id);

      if (error) {
        return { ok: false, message: error };
      }

      setProducts((current) =>
        current.map((product) =>
          product.id === id
            ? {
                ...product,
                name: input.name.trim(),
                barcode: input.barcode.trim(),
                price: input.price,
                stock: input.stock,
              }
            : product,
        ),
      );

      return { ok: true, message: "تم تعديل المنتج بنجاح" };
    };

    const deleteProduct = (id: string) => {
      setProducts((current) => current.filter((product) => product.id !== id));
    };

    const addCustomer = (input: CustomerInput): ActionResult => {
      if (!input.name.trim()) {
        return { ok: false, message: "اسم العميل مطلوب" };
      }

      const id = createId("c");

      setCustomers((current) => [
        ...current,
        {
          id,
          name: input.name.trim(),
          phone: input.phone.trim(),
          debts: [],
        },
      ]);

      return { ok: true, message: "تمت إضافة العميل بنجاح", id };
    };

    const updateCustomer = (id: string, input: CustomerInput): ActionResult => {
      if (!input.name.trim()) {
        return { ok: false, message: "اسم العميل مطلوب" };
      }

      setCustomers((current) =>
        current.map((customer) =>
          customer.id === id
            ? {
                ...customer,
                name: input.name.trim(),
                phone: input.phone.trim(),
              }
            : customer,
        ),
      );

      return { ok: true, message: "تم تعديل العميل بنجاح" };
    };

    const deleteCustomer = (id: string) => {
      setCustomers((current) => current.filter((customer) => customer.id !== id));
    };

    const payCustomerDebt = (customerId: string, amount: number): ActionResult => {
      const customer = customers.find((item) => item.id === customerId);

      if (!customer) {
        return { ok: false, message: "العميل غير موجود" };
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, message: "أدخل مبلغ تسديد صحيح" };
      }

      const totalDebt = calculateCustomerDebt(customer.debts);

      if (amount > totalDebt) {
        return { ok: false, message: "مبلغ التسديد أكبر من إجمالي الدين" };
      }

      let remainingPayment = amount;

      setCustomers((current) =>
        current.map((item) => {
          if (item.id !== customerId) {
            return item;
          }

          return {
            ...item,
            debts: item.debts.map((debt) => {
              if (remainingPayment <= 0 || debt.remaining <= 0) {
                return debt;
              }

              const paidNow = Math.min(debt.remaining, remainingPayment);
              remainingPayment -= paidNow;

              return {
                ...debt,
                paid: debt.paid + paidNow,
                remaining: debt.remaining - paidNow,
              };
            }),
          };
        }),
      );

      return { ok: true, message: "تم تسجيل التسديد بنجاح" };
    };

    const completeSale = (request: SaleRequest): ActionResult => {
      if (request.items.length === 0) {
        return { ok: false, message: "لا يمكن إتمام بيع بدون منتجات" };
      }

      const total = calculateItemsTotal(request.items);
      const customer = request.customerId
        ? customers.find((item) => item.id === request.customerId)
        : undefined;

      if ((request.paymentMethod === "debt" || request.paymentMethod === "partial") && !customer) {
        return { ok: false, message: "اختر العميل قبل إتمام البيع" };
      }

      const paid =
        request.paymentMethod === "cash"
          ? total
          : request.paymentMethod === "debt"
            ? 0
            : Number(request.paidAmount ?? 0);

      if (!Number.isFinite(paid) || paid < 0) {
        return { ok: false, message: "أدخل مبلغ مدفوع صحيح" };
      }

      if (paid > total) {
        return { ok: false, message: "المبلغ المدفوع لا يمكن أن يتجاوز المجموع" };
      }

      const unavailable = request.items.find((item) => {
        const product = products.find((productItem) => productItem.id === item.productId);
        return !product || product.stock < item.quantity;
      });

      if (unavailable) {
        return { ok: false, message: `الكمية المتوفرة من ${unavailable.productName} غير كافية` };
      }

      const remaining = total - paid;
      const invoiceId = createId("inv");
      const invoice: Invoice = {
        id: invoiceId,
        number: makeInvoiceNumber(invoices.length),
        date: new Date().toISOString(),
        customerId: customer?.id,
        customerName: customer?.name ?? "بيع مباشر",
        items: request.items.map((item) => ({
          ...item,
          total: calculateInvoiceItemTotal(item.price, item.quantity),
        })),
        total,
        paid,
        remaining,
        paymentMethod: request.paymentMethod,
      };

      setInvoices((current) => [invoice, ...current]);
      setProducts((current) =>
        current.map((product) => {
          const soldItem = request.items.find((item) => item.productId === product.id);
          return soldItem ? { ...product, stock: product.stock - soldItem.quantity } : product;
        }),
      );

      if (remaining > 0 && customer) {
        setCustomers((current) =>
          current.map((item) =>
            item.id === customer.id
              ? {
                  ...item,
                  debts: [
                    ...item.debts,
                    {
                      id: createId("d"),
                      invoiceId,
                      description: `فاتورة رقم ${invoice.number}`,
                      date: invoice.date,
                      amount: remaining,
                      paid: 0,
                      remaining,
                    },
                  ],
                }
              : item,
          ),
        );
      }

      return { ok: true, message: "تم إتمام البيع بنجاح" };
    };

    const updateInvoice = (id: string, request: InvoiceUpdateRequest): ActionResult => {
      const invoice = invoices.find((item) => item.id === id);

      if (!invoice) {
        return { ok: false, message: "الفاتورة غير موجودة" };
      }

      const previousItemsByProduct = new Map(invoice.items.map((item) => [item.productId, item]));
      const nextItemsByProduct = new Map<string, InvoiceItem>();

      request.items.forEach((item) => {
        const quantity = Math.max(0, Math.floor(Number(item.quantity)));

        if (!Number.isFinite(quantity) || quantity === 0) {
          return;
        }

        const existing = nextItemsByProduct.get(item.productId);

        nextItemsByProduct.set(item.productId, {
          ...item,
          quantity: (existing?.quantity ?? 0) + quantity,
        });
      });

      const stockErrorItem = Array.from(nextItemsByProduct.values()).find((item) => {
        const previousQuantity = previousItemsByProduct.get(item.productId)?.quantity ?? 0;
        const neededQuantity = item.quantity - previousQuantity;
        const product = products.find((productItem) => productItem.id === item.productId);

        return neededQuantity > 0 && (!product || product.stock < neededQuantity);
      });

      if (stockErrorItem) {
        return { ok: false, message: `الكمية المتوفرة من ${stockErrorItem.productName} غير كافية` };
      }

      const nextItems = Array.from(nextItemsByProduct.values()).map((item) => {
        const product = products.find((productItem) => productItem.id === item.productId);
        const previousItem = previousItemsByProduct.get(item.productId);
        const price = Number.isFinite(item.price) && item.price > 0 ? item.price : (previousItem?.price ?? product?.price ?? 0);

        return {
          productId: item.productId,
          productName: product?.name ?? previousItem?.productName ?? item.productName,
          barcode: product?.barcode ?? previousItem?.barcode ?? item.barcode,
          price,
          quantity: item.quantity,
          total: calculateInvoiceItemTotal(price, item.quantity),
        };
      });

      const total = calculateItemsTotal(nextItems);
      const paid =
        invoice.paymentMethod === "cash"
          ? total
          : invoice.paymentMethod === "debt"
            ? 0
            : Math.min(invoice.paid, total);
      const remaining = Math.max(total - paid, 0);

      setInvoices((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                items: nextItems,
                total,
                paid,
                remaining,
              }
            : item,
        ),
      );

      setProducts((current) =>
        current.map((product) => {
          const previousQuantity = previousItemsByProduct.get(product.id)?.quantity ?? 0;
          const nextQuantity = nextItemsByProduct.get(product.id)?.quantity ?? 0;

          return {
            ...product,
            stock: product.stock + previousQuantity - nextQuantity,
          };
        }),
      );

      if (invoice.customerId) {
        setCustomers((current) =>
          current.map((customer) => {
            if (customer.id !== invoice.customerId) {
              return customer;
            }

            const currentDebt = customer.debts.find((debt) => debt.invoiceId === invoice.id);

            if (remaining <= 0) {
              return {
                ...customer,
                debts: customer.debts.filter((debt) => debt.invoiceId !== invoice.id),
              };
            }

            if (currentDebt) {
              return {
                ...customer,
                debts: customer.debts.map((debt) => {
                  if (debt.invoiceId !== invoice.id) {
                    return debt;
                  }

                  const debtPaid = Math.min(debt.paid, remaining);

                  return {
                    ...debt,
                    amount: remaining,
                    paid: debtPaid,
                    remaining: remaining - debtPaid,
                  };
                }),
              };
            }

            return {
              ...customer,
              debts: [
                ...customer.debts,
                {
                  id: createId("d"),
                  invoiceId: invoice.id,
                  description: `فاتورة رقم ${invoice.number}`,
                  date: invoice.date,
                  amount: remaining,
                  paid: 0,
                  remaining,
                },
              ],
            };
          }),
        );
      }

      return { ok: true, message: "تم تعديل الفاتورة بنجاح" };
    };

    return {
      products,
      customers,
      invoices,
      addProduct,
      updateProduct,
      deleteProduct,
      addCustomer,
      updateCustomer,
      deleteCustomer,
      payCustomerDebt,
      completeSale,
      updateInvoice,
    };
  }, [products, customers, invoices]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export const useAppStore = () => {
  const store = useContext(AppStoreContext);

  if (!store) {
    throw new Error("useAppStore must be used inside AppStoreProvider");
  }

  return store;
};
