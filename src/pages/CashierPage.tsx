import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertCircle, CheckCircle2, Minus, Plus, ReceiptText, Search, Trash2, UserPlus } from "lucide-react";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store/AppStore";
import type { InvoiceItem, PaymentMethod, Product } from "../types";
import {
  calculateInvoiceItemTotal,
  calculateItemsTotal,
  findProductByBarcode,
  getStockStatus,
} from "../utils/calculations";
import { formatCurrency } from "../utils/formatCurrency";

type Notice = {
  type: "success" | "error";
  text: string;
} | null;

type CustomerForm = {
  name: string;
  phone: string;
};

const paymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "كاش" },
  { value: "debt", label: "دين" },
  { value: "partial", label: "دفع جزئي" },
];

export function CashierPage() {
  const { products, customers, addCustomer, completeSale } = useAppStore();
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>({ name: "", phone: "" });
  const [customerFormError, setCustomerFormError] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return products;
    }

    return products.filter(
      (product) => product.name.toLowerCase().includes(term) || product.barcode.includes(term),
    );
  }, [products, search]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId),
    [customers, selectedCustomerId],
  );

  const filteredCustomers = useMemo(() => {
    const term = customerSearch.trim().toLowerCase();

    if (!term) {
      return customers;
    }

    return customers.filter(
      (customer) => customer.name.toLowerCase().includes(term) || customer.phone.includes(term),
    );
  }, [customers, customerSearch]);

  const total = useMemo(() => calculateItemsTotal(items), [items]);
  const effectivePaid =
    paymentMethod === "cash" ? total : paymentMethod === "debt" ? 0 : Number(paidAmount || 0);
  const remaining = Math.max(total - (Number.isFinite(effectivePaid) ? effectivePaid : 0), 0);

  const addProductToInvoice = (product: Product) => {
    if (product.stock === 0) {
      setNotice({ type: "error", text: "هذا المنتج نفد من المخزون" });
      return;
    }

    const currentItem = items.find((item) => item.productId === product.id);

    if (currentItem && currentItem.quantity >= product.stock) {
      setNotice({ type: "error", text: "لا توجد كمية إضافية متوفرة من هذا المنتج" });
      return;
    }

    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);

      if (existing) {
        return current.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                total: calculateInvoiceItemTotal(item.price, item.quantity + 1),
              }
            : item,
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          price: product.price,
          quantity: 1,
          total: product.price,
        },
      ];
    });

    setNotice({ type: "success", text: `تمت إضافة ${product.name} إلى الفاتورة` });
  };

  const handleBarcodeEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const product = findProductByBarcode(products, barcode);

    if (!product) {
      setNotice({ type: "error", text: "الباركود غير موجود في قائمة المنتجات" });
      setBarcode("");
      return;
    }

    addProductToInvoice(product);
    setBarcode("");
  };

  const increaseQuantity = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    const invoiceItem = items.find((item) => item.productId === productId);

    if (!product || !invoiceItem) {
      return;
    }

    if (invoiceItem.quantity >= product.stock) {
      setNotice({ type: "error", text: "الكمية المطلوبة أكبر من المخزون المتاح" });
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: item.quantity + 1,
              total: calculateInvoiceItemTotal(item.price, item.quantity + 1),
            }
          : item,
      ),
    );
  };

  const decreaseQuantity = (productId: string) => {
    setItems((current) =>
      current.map((item) =>
        item.productId === productId && item.quantity > 1
          ? {
              ...item,
              quantity: item.quantity - 1,
              total: calculateInvoiceItemTotal(item.price, item.quantity - 1),
            }
          : item,
      ),
    );
  };

  const removeItem = (productId: string) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  };

  const resetPaymentFields = (method: PaymentMethod) => {
    setPaymentMethod(method);

    if (method === "cash") {
      setSelectedCustomerId("");
      setCustomerSearch("");
      setPaidAmount("");
    }

    if (method === "debt") {
      setPaidAmount("");
    }
  };

  const handleSelectCustomer = (customerId: string) => {
    const customer = customers.find((item) => item.id === customerId);

    setSelectedCustomerId(customerId);
    setCustomerSearch(customer?.name ?? "");
  };

  const openCustomerModal = () => {
    setCustomerForm({ name: customerSearch, phone: "" });
    setCustomerFormError("");
    setCustomerModalOpen(true);
  };

  const closeCustomerModal = () => {
    setCustomerModalOpen(false);
    setCustomerForm({ name: "", phone: "" });
    setCustomerFormError("");
  };

  const handleAddCustomer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = addCustomer(customerForm);

    if (!result.ok) {
      setCustomerFormError(result.message);
      return;
    }

    if (result.id) {
      setSelectedCustomerId(result.id);
    }

    setCustomerSearch(customerForm.name.trim());
    setNotice({ type: "success", text: "تمت إضافة العميل واختياره للفاتورة" });
    closeCustomerModal();
  };

  const handleCompleteSale = () => {
    const result = completeSale({
      items,
      paymentMethod,
      customerId: selectedCustomerId || undefined,
      paidAmount: Number(paidAmount || 0),
    });

    setNotice({ type: result.ok ? "success" : "error", text: result.message });

    if (result.ok) {
      setItems([]);
      setPaymentMethod("cash");
      setSelectedCustomerId("");
      setPaidAmount("");
      barcodeInputRef.current?.focus();
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex flex-col gap-5">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-extrabold text-zinc-900" htmlFor="barcode">
            امسح الباركود هنا
          </label>
          <input
            ref={barcodeInputRef}
            id="barcode"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            onKeyDown={handleBarcodeEnter}
            placeholder="اكتب أو امسح الباركود ثم اضغط Enter"
            className="h-14 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-4 text-xl font-bold outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
          />

          {notice ? (
            <div
              className={[
                "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold",
                notice.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
              ].join(" ")}
            >
              {notice.type === "success" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              {notice.text}
            </div>
          ) : null}
        </div>

        <div className="order-3 rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-extrabold text-zinc-950">المنتجات</h3>
              <p className="text-sm font-semibold text-zinc-500">اضغط على المنتج لإضافته بسرعة</p>
            </div>
            <label className="relative block lg:w-80">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="بحث بالاسم أو الباركود"
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-10 pl-3 text-sm font-semibold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const status = getStockStatus(product.stock);

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProductToInvoice(product)}
                  disabled={product.stock === 0}
                  className="rounded-lg border border-zinc-200 bg-white p-3 text-right transition hover:border-brand-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-extrabold text-zinc-950">{product.name}</p>
                      <p className="mt-1 text-xs font-semibold text-zinc-500">{product.barcode}</p>
                    </div>
                    <StatusBadge tone={status.tone} size="sm">{status.label}</StatusBadge>
                  </div>
                  <div className="mt-3 flex items-end justify-between text-sm font-bold">
                    <span className="text-brand-700">{formatCurrency(product.price)}</span>
                    <span className="text-zinc-500">المخزون: {product.stock}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="order-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
            <ReceiptText className="h-5 w-5 text-brand-600" />
            <h3 className="text-lg font-extrabold text-zinc-950">الفاتورة الحالية</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-sm">
              <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
                <tr>
                  <th className="px-4 py-3">اسم المنتج</th>
                  <th className="px-4 py-3">السعر</th>
                  <th className="px-4 py-3">الكمية</th>
                  <th className="px-4 py-3">الإجمالي</th>
                  <th className="px-4 py-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center font-semibold text-zinc-500">
                      لم تتم إضافة منتجات بعد
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.productId}>
                      <td className="px-4 py-3 font-bold text-zinc-950">{item.productName}</td>
                      <td className="px-4 py-3 font-semibold">{formatCurrency(item.price)}</td>
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1">
                          <Button
                            size="icon"
                            variant="secondary"
                            aria-label="زيادة الكمية"
                            onClick={() => increaseQuantity(item.productId)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-extrabold">{item.quantity}</span>
                          <Button
                            size="icon"
                            variant="secondary"
                            aria-label="تقليل الكمية"
                            onClick={() => decreaseQuantity(item.productId)}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-extrabold text-brand-700">{formatCurrency(item.total)}</td>
                      <td className="px-4 py-3">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="حذف المنتج من الفاتورة"
                          onClick={() => removeItem(item.productId)}
                        >
                          <Trash2 className="h-5 w-5 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-5 shadow-sm xl:sticky xl:top-6">
        <h3 className="text-xl font-extrabold text-zinc-950">ملخص الفاتورة</h3>

        <dl className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <dt className="font-bold text-zinc-500">المجموع الكلي</dt>
            <dd className="text-2xl font-extrabold text-zinc-950">{formatCurrency(total)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-bold text-zinc-500">المبلغ المدفوع</dt>
            <dd className="font-extrabold text-emerald-700">{formatCurrency(effectivePaid || 0)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-bold text-zinc-500">المتبقي</dt>
            <dd className="font-extrabold text-red-700">{formatCurrency(remaining)}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <label className="mb-2 block text-sm font-extrabold text-zinc-900">طريقة الدفع</label>
          <div className="grid grid-cols-3 gap-2">
            {paymentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => resetPaymentFields(option.value)}
                className={[
                  "rounded-lg border px-3 py-2 text-sm font-extrabold transition",
                  paymentMethod === option.value
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {paymentMethod === "debt" || paymentMethod === "partial" ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-zinc-900">اختيار العميل</span>
              <Button
                variant="ghost"
                size="sm"
                icon={<UserPlus className="h-4 w-4" />}
                onClick={openCustomerModal}
              >
                إضافة عميل جديد
              </Button>
            </div>

            <label className="relative block">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                value={customerSearch}
                onChange={(event) => {
                  setCustomerSearch(event.target.value);
                  setSelectedCustomerId("");
                }}
                placeholder="ابحث باسم العميل أو رقم الهاتف"
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-10 pl-3 text-sm font-bold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>

            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
              {filteredCustomers.length === 0 ? (
                <div className="p-3 text-sm font-semibold text-zinc-500">لا يوجد عملاء مطابقون</div>
              ) : (
                filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => handleSelectCustomer(customer.id)}
                    className={[
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-right text-sm transition hover:bg-brand-50",
                      selectedCustomerId === customer.id ? "bg-brand-50 text-brand-700" : "text-zinc-800",
                    ].join(" ")}
                  >
                    <span className="font-extrabold">{customer.name}</span>
                    <span className="text-xs font-semibold text-zinc-500">{customer.phone || "بدون هاتف"}</span>
                  </button>
                ))
              )}
            </div>

            {selectedCustomer ? (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                العميل المختار: {selectedCustomer.name}
              </p>
            ) : null}
          </div>
        ) : null}

        {paymentMethod === "partial" ? (
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-extrabold text-zinc-900">المبلغ المدفوع</span>
            <input
              type="number"
              min="0"
              value={paidAmount}
              onChange={(event) => setPaidAmount(event.target.value)}
              placeholder="0"
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>
        ) : null}

        <Button
          fullWidth
          className="mt-6"
          size="md"
          icon={<CheckCircle2 className="h-5 w-5" />}
          onClick={handleCompleteSale}
        >
          إتمام البيع
        </Button>
      </aside>

      <Modal
        open={customerModalOpen}
        title="إضافة عميل جديد"
        onClose={closeCustomerModal}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeCustomerModal}>
              إلغاء
            </Button>
            <Button type="submit" form="cashier-customer-form" icon={<UserPlus className="h-5 w-5" />}>
              إضافة واختيار العميل
            </Button>
          </div>
        }
      >
        <form id="cashier-customer-form" className="grid gap-4" onSubmit={handleAddCustomer}>
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-zinc-900">اسم العميل</span>
            <input
              value={customerForm.name}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, name: event.target.value }))
              }
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-zinc-900">رقم الهاتف</span>
            <input
              value={customerForm.phone}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, phone: event.target.value }))
              }
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>

          {customerFormError ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
              {customerFormError}
            </div>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
