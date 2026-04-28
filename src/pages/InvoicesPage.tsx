import { useMemo, useState } from "react";
import { Eye, Minus, Pencil, Plus, ReceiptText, Search, Trash2 } from "lucide-react";
import { AnimatedDigits } from "../components/AnimatedDigits";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store/AppStore";
import type { Invoice, InvoiceItem } from "../types";
import { calculateInvoiceItemTotal, calculateItemsTotal, getPaymentMethodLabel } from "../utils/calculations";
import { formatCurrency, formatDate, formatNumber, normalizeDigits, toArabicDigits } from "../utils/formatCurrency";

const paymentTone = {
  cash: "success",
  debt: "danger",
  partial: "warning",
} as const;

export function InvoicesPage() {
  const { invoices, products, updateInvoice } = useAppStore();
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [editSearch, setEditSearch] = useState("");
  const [editMessage, setEditMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setEditItems(invoice.items.map((item) => ({ ...item })));
    setEditSearch("");
    setEditMessage(null);
    setSelectedInvoice(null);
  };

  const closeEditModal = () => {
    setEditingInvoice(null);
    setEditItems([]);
    setEditSearch("");
    setEditMessage(null);
  };

  const getOriginalQuantity = (productId: string) =>
    editingInvoice?.items.find((item) => item.productId === productId)?.quantity ?? 0;

  const getCurrentEditQuantity = (productId: string) =>
    editItems.find((item) => item.productId === productId)?.quantity ?? 0;

  const getEditableQuantityLimit = (productId: string) => {
    const product = products.find((item) => item.id === productId);

    return (product?.stock ?? 0) + getOriginalQuantity(productId);
  };

  const setEditItemQuantity = (productId: string, value: string | number) => {
    const product = products.find((item) => item.id === productId);
    const originalItem = editingInvoice?.items.find((item) => item.productId === productId);

    if (!product && !originalItem) {
      return;
    }

    const rawValue = typeof value === "string" ? normalizeDigits(value) : String(value);
    const parsedQuantity = Number.parseInt(rawValue, 10);
    const maxQuantity = getEditableQuantityLimit(productId);
    const nextQuantity = Number.isFinite(parsedQuantity)
      ? Math.min(maxQuantity, Math.max(0, parsedQuantity))
      : 0;

    setEditItems((current) => {
      const existingItem = current.find((item) => item.productId === productId);

      if (nextQuantity === 0) {
        return current.filter((item) => item.productId !== productId);
      }

      const baseItem =
        existingItem ??
        originalItem ??
        (product
          ? {
              productId: product.id,
              productName: product.name,
              barcode: product.barcode,
              price: product.price,
              quantity: 0,
              total: 0,
            }
          : null);

      if (!baseItem) {
        return current;
      }

      const price = baseItem.price || product?.price || 0;
      const nextItem = {
        ...baseItem,
        productName: product?.name ?? baseItem.productName,
        barcode: product?.barcode ?? baseItem.barcode,
        price,
        quantity: nextQuantity,
        total: calculateInvoiceItemTotal(price, nextQuantity),
      };

      if (existingItem) {
        return current.map((item) => (item.productId === productId ? nextItem : item));
      }

      return [...current, nextItem];
    });
  };

  const changeEditItemQuantity = (productId: string, delta: number) => {
    setEditItemQuantity(productId, getCurrentEditQuantity(productId) + delta);
  };

  const filteredEditProducts = useMemo(() => {
    const term = normalizeDigits(editSearch).trim().toLowerCase();
    const visibleProducts = term
      ? products.filter(
          (product) => product.name.toLowerCase().includes(term) || product.barcode.includes(term),
        )
      : products;

    return visibleProducts.slice(0, 8);
  }, [editSearch, products]);

  const editTotal = useMemo(() => calculateItemsTotal(editItems), [editItems]);
  const editPaid = editingInvoice
    ? editingInvoice.paymentMethod === "cash"
      ? editTotal
      : editingInvoice.paymentMethod === "debt"
        ? 0
        : Math.min(editingInvoice.paid, editTotal)
    : 0;
  const editRemaining = Math.max(editTotal - editPaid, 0);

  const handleSaveInvoiceEdit = () => {
    if (!editingInvoice) {
      return;
    }

    const result = updateInvoice(editingInvoice.id, { items: editItems });
    setEditMessage({ type: result.ok ? "success" : "error", text: result.message });

    if (result.ok) {
      closeEditModal();
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-500">عدد الفواتير</p>
          <p className="mt-1 text-2xl font-extrabold text-zinc-950 sm:text-3xl"><AnimatedDigits value={formatNumber(invoices.length)} /></p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-500">إجمالي المبيعات</p>
          <p className="mt-1 text-2xl font-extrabold text-brand-700 sm:text-3xl">
            <AnimatedDigits value={formatCurrency(invoices.reduce((sum, invoice) => sum + invoice.total, 0))} />
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-500">متبقي غير مسدد</p>
          <p className="mt-1 text-2xl font-extrabold text-red-700 sm:text-3xl">
            <AnimatedDigits value={formatCurrency(invoices.reduce((sum, invoice) => sum + invoice.remaining, 0))} />
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
          <ReceiptText className="h-5 w-5 text-brand-600" />
          <div>
            <h3 className="text-lg font-extrabold text-zinc-950">الفواتير</h3>
            <p className="text-sm font-semibold text-zinc-500">فواتير تجريبية والفواتير التي تتم من شاشة الكاشير</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-right text-sm sm:min-w-[980px]">
            <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
              <tr>
                <th className="px-4 py-3">رقم الفاتورة</th>
                <th className="px-4 py-3">التاريخ</th>
                <th className="px-4 py-3">العميل</th>
                <th className="px-4 py-3">الإجمالي</th>
                <th className="px-4 py-3">المدفوع</th>
                <th className="px-4 py-3">المتبقي</th>
                <th className="px-4 py-3">طريقة الدفع</th>
                <th className="px-4 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-3 font-extrabold text-zinc-950">{invoice.number}</td>
                  <td className="px-4 py-3 font-semibold text-zinc-600">{formatDate(invoice.date)}</td>
                  <td className="font-features-normal px-4 py-3 font-bold">{invoice.customerName ? toArabicDigits(invoice.customerName) : "بيع مباشر"}</td>
                  <td className="px-4 py-3 font-extrabold text-brand-700"><AnimatedDigits value={formatCurrency(invoice.total)} /></td>
                  <td className="px-4 py-3 font-bold text-emerald-700"><AnimatedDigits value={formatCurrency(invoice.paid)} /></td>
                  <td className="px-4 py-3 font-bold text-red-700"><AnimatedDigits value={formatCurrency(invoice.remaining)} /></td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={paymentTone[invoice.paymentMethod]}>
                      {getPaymentMethodLabel(invoice.paymentMethod)}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => setSelectedInvoice(invoice)}>
                      عرض التفاصيل
                    </Button>
                      <Button className="!font-normal" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openEditModal(invoice)}>
                        تعديل
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={Boolean(selectedInvoice)}
        title={selectedInvoice ? `تفاصيل الفاتورة ${selectedInvoice.number}` : "تفاصيل الفاتورة"}
        onClose={() => setSelectedInvoice(null)}
        size="lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {selectedInvoice ? (
              <Button icon={<Pencil className="h-5 w-5" />} onClick={() => openEditModal(selectedInvoice)}>
                تعديل الفاتورة
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setSelectedInvoice(null)}>
              إغلاق
            </Button>
          </div>
        }
      >
        {selectedInvoice ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">العميل</p>
                <p className="font-features-normal mt-1 font-extrabold text-zinc-950">{selectedInvoice.customerName ? toArabicDigits(selectedInvoice.customerName) : "بيع مباشر"}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">طريقة الدفع</p>
                <p className="mt-1 font-extrabold text-zinc-950">
                  {getPaymentMethodLabel(selectedInvoice.paymentMethod)}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-700">المدفوع</p>
                <p className="mt-1 font-extrabold text-emerald-700"><AnimatedDigits value={formatCurrency(selectedInvoice.paid)} /></p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-xs font-bold text-red-700">المتبقي</p>
                <p className="mt-1 font-extrabold text-red-700"><AnimatedDigits value={formatCurrency(selectedInvoice.remaining)} /></p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full min-w-[620px] text-right text-sm sm:min-w-[680px]">
                <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">اسم المنتج</th>
                    <th className="px-4 py-3">السعر</th>
                    <th className="px-4 py-3">الكمية</th>
                    <th className="px-4 py-3">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {selectedInvoice.items.map((item) => (
                    <tr key={`${selectedInvoice.id}-${item.productId}`}>
                      <td className="px-4 py-3 font-normal text-zinc-950">{toArabicDigits(item.productName)}</td>
                      <td className="px-4 py-3 font-semibold"><AnimatedDigits value={formatCurrency(item.price)} /></td>
                      <td className="px-4 py-3 font-bold"><AnimatedDigits value={formatNumber(item.quantity)} /></td>
                      <td className="px-4 py-3 font-extrabold text-brand-700"><AnimatedDigits value={formatCurrency(item.total)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editingInvoice)}
        title={editingInvoice ? `تعديل الفاتورة ${editingInvoice.number}` : "تعديل الفاتورة"}
        onClose={closeEditModal}
        size="xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeEditModal}>
              إلغاء
            </Button>
            <Button icon={<Pencil className="h-5 w-5" />} onClick={handleSaveInvoiceEdit}>
              حفظ التعديل
            </Button>
          </div>
        }
      >
        {editingInvoice ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">الإجمالي بعد التعديل</p>
                <p className="mt-1 text-lg font-extrabold text-brand-700">
                  <AnimatedDigits value={formatCurrency(editTotal)} />
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-700">المدفوع</p>
                <p className="mt-1 text-lg font-extrabold text-emerald-700">
                  <AnimatedDigits value={formatCurrency(editPaid)} />
                </p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-xs font-bold text-red-700">المتبقي</p>
                <p className="mt-1 text-lg font-extrabold text-red-700">
                  <AnimatedDigits value={formatCurrency(editRemaining)} />
                </p>
              </div>
            </div>

            {editMessage ? (
              <div
                className={[
                  "rounded-lg px-3 py-2 text-sm font-bold",
                  editMessage.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                ].join(" ")}
              >
                {editMessage.text}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="w-full min-w-[760px] text-right text-sm">
                  <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">المنتج</th>
                      <th className="px-4 py-3">السعر</th>
                      <th className="px-4 py-3">المتاح</th>
                      <th className="px-4 py-3 text-center">الكمية</th>
                      <th className="px-4 py-3">الإجمالي</th>
                      <th className="px-4 py-3">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {editItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center font-normal text-zinc-500">
                          لا توجد منتجات في الفاتورة بعد التعديل
                        </td>
                      </tr>
                    ) : (
                      editItems.map((item) => (
                        <tr key={`${editingInvoice.id}-edit-${item.productId}`}>
                          <td className="px-4 py-3">
                            <p className="font-normal text-zinc-950">{toArabicDigits(item.productName)}</p>
                            <p className="mt-1 text-xs font-normal text-zinc-500">{item.barcode}</p>
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            <AnimatedDigits value={formatCurrency(item.price)} />
                          </td>
                          <td className="px-4 py-3 font-bold text-zinc-600">
                            <AnimatedDigits value={formatNumber(getEditableQuantityLimit(item.productId))} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-7 w-7 rounded-md"
                                aria-label="تقليل الكمية"
                                onClick={() => changeEditItemQuantity(item.productId, -1)}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={toArabicDigits(item.quantity)}
                                onChange={(event) => setEditItemQuantity(item.productId, event.target.value)}
                                aria-label="تعديل كمية المنتج"
                                className="h-7 w-14 rounded-md border border-transparent bg-white px-1 text-center text-sm font-normal text-zinc-950 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                              />
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-7 w-7 rounded-md"
                                aria-label="زيادة الكمية"
                                onClick={() => changeEditItemQuantity(item.productId, 1)}
                                disabled={item.quantity >= getEditableQuantityLimit(item.productId)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-extrabold text-brand-700">
                            <AnimatedDigits value={formatCurrency(item.total)} />
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="حذف المنتج من الفاتورة"
                              onClick={() => setEditItemQuantity(item.productId, 0)}
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

              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={toArabicDigits(editSearch)}
                    onChange={(event) => setEditSearch(normalizeDigits(event.target.value))}
                    placeholder="إضافة منتج للاستبدال"
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-10 pl-3 text-sm font-normal outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </label>

                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {filteredEditProducts.map((product) => {
                    const currentQuantity = getCurrentEditQuantity(product.id);
                    const quantityLimit = getEditableQuantityLimit(product.id);
                    const canAdd = currentQuantity < quantityLimit;

                    return (
                      <button
                        key={`edit-add-${product.id}`}
                        type="button"
                        disabled={!canAdd}
                        onClick={() => setEditItemQuantity(product.id, currentQuantity + 1)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-sm transition hover:border-brand-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-60"
                      >
                        <span>
                          <span className="block font-normal text-zinc-950">{toArabicDigits(product.name)}</span>
                          <span className="mt-0.5 block text-xs font-normal text-zinc-500">{product.barcode}</span>
                        </span>
                        <span className="text-xs font-bold text-zinc-600">
                          <AnimatedDigits value={formatNumber(quantityLimit - currentQuantity)} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
