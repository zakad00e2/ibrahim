import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertCircle, CheckCircle2, Minus, Plus, ReceiptText, Search, Trash2, UserPlus } from "lucide-react";
import { AnimatedDigits } from "../components/AnimatedDigits";
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
import { formatCurrency, formatNumber, normalizeDigits, toArabicDigits } from "../utils/formatCurrency";

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
    const term = normalizeDigits(search).trim().toLowerCase();

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
    const term = normalizeDigits(customerSearch).trim().toLowerCase();

    if (!term) {
      return customers;
    }

    return customers.filter(
      (customer) => customer.name.toLowerCase().includes(term) || customer.phone.includes(term),
    );
  }, [customers, customerSearch]);

  const total = useMemo(() => calculateItemsTotal(items), [items]);
  const effectivePaid =
    paymentMethod === "cash" ? total : paymentMethod === "debt" ? 0 : Number(normalizeDigits(paidAmount || "0"));
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
          item.productId === product.id && item.quantity < product.stock
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

    setNotice({ type: "success", text: `تمت إضافة ${toArabicDigits(product.name)} إلى الفاتورة` });
  };

  const handleBarcodeEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    const product = findProductByBarcode(products, normalizeDigits(barcode));

    if (!product) {
      setNotice({ type: "error", text: "الباركود غير موجود في قائمة المنتجات" });
      setBarcode("");
      return;
    }

    addProductToInvoice(product);
    setBarcode("");
  };

  const updateItemQuantity = (productId: string, delta: number) => {
    const product = products.find((item) => item.id === productId);

    if (!product) {
      return;
    }

    setItems((current) =>
      current.map((item) => {
        if (item.productId !== productId) {
          return item;
        }

        const nextQuantity = Math.min(product.stock, Math.max(1, item.quantity + delta));

        return {
          ...item,
          quantity: nextQuantity,
          total: calculateInvoiceItemTotal(item.price, nextQuantity),
        };
      }),
    );
  };

  const increaseQuantity = (productId: string) => updateItemQuantity(productId, 1);

  const decreaseQuantity = (productId: string) => updateItemQuantity(productId, -1);

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
      paidAmount: Number(normalizeDigits(paidAmount || "0")),
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex flex-col gap-5">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-zinc-900" htmlFor="barcode">
            امسح الباركود هنا
          </label>
          <div className="relative">
            <input
              ref={barcodeInputRef}
              id="barcode"
              value={barcode}
              onChange={(event) => setBarcode(normalizeDigits(event.target.value))}
              onKeyDown={handleBarcodeEnter}
              className="h-12 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-base font-bold outline-none transition focus:border-zinc-500 focus:bg-white sm:h-14 sm:px-4 sm:text-xl"
            />
            {barcode ? null : (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base font-normal leading-none text-zinc-400 sm:right-4 sm:text-xl">
                اكتب أو امسح الباركود
              </span>
            )}
          </div>

          {notice ? (
            <div
              className={[
                "mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-normal",
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

        <div className="font-features-normal order-3 rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-medium text-zinc-950">المنتجات</h3>
              <p className="text-sm font-light text-zinc-500">اضغط على المنتج لإضافته بسرعة</p>
            </div>
            <label className="relative block lg:w-80">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                value={toArabicDigits(search)}
                onChange={(event) => setSearch(normalizeDigits(event.target.value))}
                placeholder="بحث بالاسم أو الباركود"
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-10 pl-3 text-sm font-semibold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>
          </div>

          <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 2xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const status = getStockStatus(product.stock);

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProductToInvoice(product)}
                  disabled={product.stock === 0}
                  className="flex min-h-28 flex-col rounded-lg border border-zinc-200 bg-white p-3 text-right transition hover:border-brand-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-60 sm:min-h-32"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-950">{toArabicDigits(product.name)}</p>
                    </div>
                    <StatusBadge className="!font-normal" tone={status.tone} size="sm">{status.label}</StatusBadge>
                  </div>
                  <div className="mt-auto pt-3">
                    <p className="mb-2 text-xs font-semibold text-zinc-500">{product.barcode}</p>
                    <div className="flex items-end justify-between gap-3 text-sm font-bold">
                      <span className="text-brand-700"><AnimatedDigits value={formatCurrency(product.price)} /></span>
                      <span className="font-normal text-zinc-500">المخزون: <AnimatedDigits value={formatNumber(product.stock)} /></span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="order-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
            <ReceiptText className="h-5 w-5 text-brand-600" />
            <h3 className="text-lg font-medium text-zinc-950">الفاتورة الحالية</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-right text-sm sm:min-w-[760px]">
              <thead className="bg-zinc-50 text-xs font-normal text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-normal">اسم المنتج</th>
                  <th className="px-4 py-3 font-normal">السعر</th>
                  <th className="px-4 py-3 text-center font-normal">الكمية</th>
                  <th className="px-4 py-3 font-normal">الإجمالي</th>
                  <th className="px-4 py-3 font-normal">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center font-normal text-zinc-500">
                      لم تتم إضافة منتجات بعد
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.productId}>
                      <td className="px-4 py-2 font-normal text-zinc-950">{toArabicDigits(item.productName)}</td>
                      <td className="px-4 py-2 text-base font-normal"><AnimatedDigits value={formatCurrency(item.price)} /></td>
                      <td className="px-4 py-2 text-center">
                        <div className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-7 w-7 rounded-md"
                            aria-label="تقليل الكمية"
                            onClick={() => decreaseQuantity(item.productId)}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-6 text-center font-normal"><AnimatedDigits value={formatNumber(item.quantity)} /></span>
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-7 w-7 rounded-md"
                            aria-label="زيادة الكمية"
                            onClick={() => increaseQuantity(item.productId)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-base font-normal text-brand-700"><AnimatedDigits value={formatCurrency(item.total)} /></td>
                      <td className="px-4 py-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
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

      <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 xl:sticky xl:top-5">
        <h3 className="text-xl font-medium text-zinc-950">ملخص الفاتورة</h3>

        <dl className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <dt className="font-normal text-zinc-500">المجموع الكلي</dt>
            <dd className="text-xl font-normal text-zinc-950 sm:text-2xl"><AnimatedDigits value={formatCurrency(total)} /></dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-normal text-zinc-500">المبلغ المدفوع</dt>
            <dd className="font-normal text-emerald-700"><AnimatedDigits value={formatCurrency(effectivePaid || 0)} /></dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-normal text-zinc-500">المتبقـــــــــــــي</dt>
            <dd className="font-normal text-red-700"><AnimatedDigits value={formatCurrency(remaining)} /></dd>
          </div>
        </dl>

        <div className="mt-6">
          <label className="font-features-styled mb-2 block text-sm font-medium text-zinc-900">طريقة الدفع</label>
          <div className="grid grid-cols-3 gap-2">
            {paymentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => resetPaymentFields(option.value)}
                className={[
                  "font-features-normal rounded-lg border px-2 py-2 text-xs font-normal transition sm:px-3 sm:text-sm",
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
              <span className="font-features-styled text-sm font-medium text-zinc-900">اختيار العميل</span>
              <Button
                variant="ghost"
                size="sm"
                className="!font-normal"
                icon={<UserPlus className="h-4 w-4" />}
                onClick={openCustomerModal}
              >
                إضافة عميل جديد
              </Button>
            </div>

            <label className="relative block">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                value={toArabicDigits(customerSearch)}
                onChange={(event) => {
                  setCustomerSearch(normalizeDigits(event.target.value));
                  setSelectedCustomerId("");
                }}
                placeholder="ابحث باسم العميل أو رقم الهاتف"
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-10 pl-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>

            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-zinc-200 bg-white">
              {filteredCustomers.length === 0 ? (
                <div className="p-3 text-sm font-normal text-zinc-500">لا يوجد عملاء مطابقون</div>
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
                    <span className="font-features-normal font-normal">{toArabicDigits(customer.name)}</span>
                    <span className="text-xs font-normal text-zinc-500">{customer.phone || "بدون هاتف"}</span>
                  </button>
                ))
              )}
            </div>

            {selectedCustomer ? (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
                العميل المختار: <span className="font-features-normal">{toArabicDigits(selectedCustomer.name)}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {paymentMethod === "partial" ? (
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-extrabold text-zinc-900">المبلغ المدفوع</span>
            <input
              type="text"
              inputMode="decimal"
              min="0"
              value={toArabicDigits(paidAmount)}
              onChange={(event) => setPaidAmount(normalizeDigits(event.target.value))}
              placeholder="٠"
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>
        ) : null}

        <Button
          fullWidth
          className="mt-6 !font-normal"
          size="md"
          onClick={handleCompleteSale}
        >
          إتمام البيع
          <CheckCircle2 className="h-5 w-5" />
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
            <span className="mb-2 block text-sm font-normal text-zinc-900">اسم العميل</span>
            <input
              value={toArabicDigits(customerForm.name)}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, name: normalizeDigits(event.target.value) }))
              }
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-normal text-zinc-900">رقم الهاتف</span>
            <input
              value={customerForm.phone}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, phone: normalizeDigits(event.target.value) }))
              }
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
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
