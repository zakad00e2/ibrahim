import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, ReceiptText, Search, Trash2, UserPlus, WalletCards } from "lucide-react";
import { AnimatedDigits } from "../components/AnimatedDigits";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { useAppStore } from "../store/AppStore";
import type { Customer, Debt, Invoice } from "../types";
import { getCustomerDebtTotal } from "../utils/calculations";
import { formatCurrency, formatDate, formatNumber, normalizeDigits, toArabicDigits } from "../utils/formatCurrency";

type CustomerForm = {
  name: string;
  phone: string;
  initialDebt: string;
};

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
  initialDebt: "",
};

export function CustomersPage() {
  const {
    customers,
    customersLoading,
    customersError,
    customersQuery,
    customersTotal,
    invoices,
    setCustomersQuery,
    loadCustomerDetail,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    payCustomerDebt,
    payDebt,
    loadDebtDetail,
    loadInvoiceDetail,
  } = useAppStore();

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [detailsCustomerId, setDetailsCustomerId] = useState<string | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [showDebtPaymentForm, setShowDebtPaymentForm] = useState(false);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState("");
  const [debtPaymentNotes, setDebtPaymentNotes] = useState("");
  const [debtPaying, setDebtPaying] = useState(false);
  const [debtDetailLoading, setDebtDetailLoading] = useState(false);
  const [debtInvoiceDetail, setDebtInvoiceDetail] = useState<Invoice | null>(null);
  const [debtInvoiceLoading, setDebtInvoiceLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [debtMessage, setDebtMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (raw: string) => {
      const term = normalizeDigits(raw);
      setSearchInput(term);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        setCustomersQuery({ search: term, page: 1 });
      }, 300);
    },
    [setCustomersQuery],
  );

  useEffect(
    () => () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    },
    [],
  );

  const totalPages = Math.max(1, Math.ceil(customersTotal / customersQuery.limit));
  const currentPage = customersQuery.page;

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === detailsCustomerId) ?? null,
    [customers, detailsCustomerId],
  );

  const totalDebt = useMemo(
    () => customers.reduce((sum, c) => sum + getCustomerDebtTotal(c), 0),
    [customers],
  );

  const selectedDebtInvoice = useMemo(
    () => {
      if (!selectedDebt?.invoiceId) return null;
      if (debtInvoiceDetail?.id === selectedDebt.invoiceId) return debtInvoiceDetail;
      return invoices.find((inv) => inv.id === selectedDebt.invoiceId) ?? null;
    },
    [debtInvoiceDetail, invoices, selectedDebt],
  );
  const selectedDebtDisplayPaid = selectedDebtInvoice ? selectedDebtInvoice.paid : (selectedDebt?.paid ?? 0);

  const getDebtInvoiceNumber = useCallback(
    (debt: Debt) => {
      const invoiceNumber = debt.invoiceNumber ?? invoices.find((invoice) => invoice.id === debt.invoiceId)?.number;
      return invoiceNumber || "غير متوفر";
    },
    [invoices],
  );

  const openAddModal = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setMessage(null);
    setFormModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({ name: customer.name, phone: customer.phone, initialDebt: "" });
    setMessage(null);
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    setFormModalOpen(false);
    setEditingCustomer(null);
    setForm(emptyForm);
  };

  const openDetails = async (customer: Customer) => {
    setDetailsCustomerId(customer.id);
    setShowPaymentForm(false);
    setPaymentAmount("");
    setMessage(null);
    await loadCustomerDetail(customer.id);
  };

  const openDebtPayment = async (customer: Customer) => {
    setDetailsCustomerId(customer.id);
    setShowPaymentForm(true);
    setPaymentAmount("");
    setMessage(null);
    await loadCustomerDetail(customer.id);
  };

  const closeDetails = () => {
    setDetailsCustomerId(null);
    setSelectedDebt(null);
    setDebtInvoiceDetail(null);
    setDebtInvoiceLoading(false);
    setShowPaymentForm(false);
    setPaymentAmount("");
    setMessage(null);
  };

  const closeDebtDetail = () => {
    setSelectedDebt(null);
    setDebtInvoiceDetail(null);
    setDebtInvoiceLoading(false);
    setShowDebtPaymentForm(false);
    setDebtPaymentAmount("");
    setDebtPaymentNotes("");
    setDebtMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const result = editingCustomer
      ? await updateCustomer(editingCustomer.id, {
          name: form.name,
          phone: form.phone,
          initialDebt: undefined,
        })
      : await addCustomer({
          name: form.name,
          phone: form.phone,
          initialDebt: Number(normalizeDigits(form.initialDebt || "0")) || undefined,
        });

    setSubmitting(false);

    if (result.ok) {
      closeFormModal();
      setMessage({ type: "success", text: result.message });
    } else {
      setMessage({ type: "error", text: result.message });
    }
  };

  const handleDelete = async (customer: Customer) => {
    const confirmed = window.confirm(`هل تريد حذف العميل "${toArabicDigits(customer.name)}"؟`);
    if (!confirmed) return;

    const result = await deleteCustomer(customer.id);
    setMessage({ type: result.ok ? "success" : "error", text: result.message });
  };

  const handlePayDebt = async () => {
    if (!selectedCustomer) return;
    setPaying(true);
    const result = await payCustomerDebt(selectedCustomer.id, Number(normalizeDigits(paymentAmount)));
    setPaying(false);
    setMessage({ type: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      setPaymentAmount("");
      setShowPaymentForm(false);
    }
  };

  const openDebtDetail = async (debt: Debt) => {
    setSelectedDebt(debt);
    setDebtInvoiceDetail(null);
    setShowDebtPaymentForm(false);
    setDebtPaymentAmount("");
    setDebtPaymentNotes("");
    setDebtMessage(null);
    setDebtDetailLoading(true);

    const updated = await loadDebtDetail(debt.id);
    setDebtDetailLoading(false);
    if (updated) setSelectedDebt(updated);

    const debtForInvoice = updated ?? debt;
    if (!debtForInvoice.invoiceId) return;

    const existingInvoice = invoices.find((invoice) => invoice.id === debtForInvoice.invoiceId) ?? null;
    if (existingInvoice?.items.length) {
      setDebtInvoiceDetail(existingInvoice);
      return;
    }

    setDebtInvoiceLoading(true);
    const invoice = await loadInvoiceDetail(debtForInvoice.invoiceId);
    setDebtInvoiceDetail(invoice ?? existingInvoice);
    setDebtInvoiceLoading(false);
  };

  const handlePaySingleDebt = async () => {
    if (!selectedDebt) return;
    const amount = Number(normalizeDigits(debtPaymentAmount));
    setDebtPaying(true);
    const result = await payDebt(selectedDebt.id, amount, debtPaymentNotes || undefined);
    setDebtPaying(false);
    setDebtMessage({ type: result.ok ? "success" : "error", text: result.message });
    if (result.ok) {
      setDebtPaymentAmount("");
      setDebtPaymentNotes("");
      setShowDebtPaymentForm(false);
      // Refresh the selected debt with latest payments
      const updated = await loadDebtDetail(selectedDebt.id);
      if (updated) setSelectedDebt(updated);
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">عدد العملاء</p>
          <p className="mt-1 text-2xl font-medium text-zinc-950 sm:text-3xl">
            <AnimatedDigits value={formatNumber(customersTotal)} />
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">إجمالي الديون</p>
          <p className="text-xs font-normal text-zinc-400">للصفحة الحالية</p>
          <p className="mt-1 text-2xl font-medium text-red-700 sm:text-3xl">
            <AnimatedDigits value={formatCurrency(totalDebt)} />
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">عملاء عليهم دين</p>
          <p className="text-xs font-normal text-zinc-400">للصفحة الحالية</p>
          <p className="mt-1 text-2xl font-medium text-amber-700 sm:text-3xl">
            <AnimatedDigits
              value={formatNumber(customers.filter((c) => getCustomerDebtTotal(c) > 0).length)}
            />
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-medium text-zinc-950">قائمة العملاء</h3>
            <p className="text-sm font-normal text-zinc-500">إدارة العملاء والديون</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-80">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                value={toArabicDigits(searchInput)}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="ابحث باسم العميل أو رقم الهاتف"
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-10 pl-3 text-sm font-medium outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>
            <Button icon={<Plus className="h-5 w-5" />} onClick={openAddModal}>
              إضافة عميل
            </Button>
          </div>
        </div>

        {message ? (
          <div
            className={[
              "mx-4 mt-4 rounded-lg px-3 py-2 text-sm font-medium",
              message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
            ].join(" ")}
          >
            {message.text}
          </div>
        ) : null}

        {customersError ? (
          <div className="mx-4 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {customersError}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-right text-sm sm:min-w-[860px]">
            <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
              <tr>
                <th className="px-4 py-3">الاسم</th>
                <th className="px-4 py-3">رقم الهاتف</th>
                <th className="px-4 py-3">إجمالي الدين</th>
                <th className="px-4 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {customersLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center font-normal text-zinc-500">
                    جارٍ التحميل...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center font-normal text-zinc-500">
                    لا يوجد عملاء مطابقون للبحث
                  </td>
                </tr>
              ) : (
                customers.map((customer) => {
                  const debt = getCustomerDebtTotal(customer);
                  return (
                    <tr key={customer.id}>
                      <td className="font-features-normal px-4 py-3 font-medium text-zinc-950">
                        {toArabicDigits(customer.name)}
                      </td>
                      <td className="px-4 py-3 font-normal text-zinc-600">
                        {customer.phone || "غير مسجل"}
                      </td>
                      <td
                        className={
                          debt > 0
                            ? "px-4 py-3 text-lg font-semibold text-red-700 sm:text-xl"
                            : "px-4 py-3 text-lg font-semibold text-emerald-700 sm:text-xl"
                        }
                      >
                        <AnimatedDigits value={formatCurrency(debt)} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<WalletCards className="h-4 w-4" />}
                            disabled={debt <= 0}
                            onClick={() => void openDebtPayment(customer)}
                          >
                            تسديد الدين
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Pencil className="h-4 w-4" />}
                            onClick={() => openEditModal(customer)}
                          >
                            تعديل
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="حذف العميل"
                            onClick={() => void handleDelete(customer)}
                          >
                            <Trash2 className="h-5 w-5 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
            <p className="text-sm font-normal text-zinc-500">
              صفحة {toArabicDigits(currentPage)} من {toArabicDigits(totalPages)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<ChevronRight className="h-4 w-4" />}
                disabled={currentPage <= 1 || customersLoading}
                onClick={() => setCustomersQuery({ page: currentPage - 1 })}
              >
                السابق
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages || customersLoading}
                onClick={() => setCustomersQuery({ page: currentPage + 1 })}
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Add / Edit modal */}
      <Modal
        open={formModalOpen}
        title={editingCustomer ? "تعديل عميل" : "إضافة عميل"}
        onClose={closeFormModal}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeFormModal} disabled={submitting}>
              إلغاء
            </Button>
            <Button
              type="submit"
              form="customer-form"
              icon={<UserPlus className="h-5 w-5" />}
              disabled={submitting}
            >
              {submitting ? "جارٍ الحفظ..." : editingCustomer ? "حفظ التعديل" : "إضافة العميل"}
            </Button>
          </div>
        }
      >
        <form id="customer-form" className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-900">اسم العميل</span>
            <input
              value={toArabicDigits(form.name)}
              onChange={(e) => setForm((f) => ({ ...f, name: normalizeDigits(e.target.value) }))}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-900">رقم الهاتف</span>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: normalizeDigits(e.target.value) }))}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>

          {!editingCustomer ? (
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-900">الدين الحالي</span>
              <input
                type="text"
                inputMode="decimal"
                min="0"
                value={toArabicDigits(form.initialDebt)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, initialDebt: normalizeDigits(e.target.value) }))
                }
                placeholder="اختياري"
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
              />
            </label>
          ) : null}

          {message?.type === "error" ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {message.text}
            </div>
          ) : null}
        </form>
      </Modal>

      {/* Customer details modal */}
      <Modal
        open={Boolean(selectedCustomer)}
        title="تفاصيل العميل"
        onClose={closeDetails}
        size="lg"
        footer={
          selectedCustomer ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={closeDetails}>
                إغلاق
              </Button>
            </div>
          ) : null
        }
      >
        {selectedCustomer ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-medium text-zinc-500">الاسم</p>
                <p className="font-features-normal mt-1 font-medium text-zinc-950">
                  {toArabicDigits(selectedCustomer.name)}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-medium text-zinc-500">رقم الهاتف</p>
                <p className="mt-1 font-medium text-zinc-950">{selectedCustomer.phone || "غير مسجل"}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-xs font-medium text-red-500">إجمالي الدين</p>
                <p className="mt-1 font-medium text-red-700">
                  <AnimatedDigits value={formatCurrency(getCustomerDebtTotal(selectedCustomer))} />
                </p>
              </div>
            </div>

            {showPaymentForm ? (
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-900">مبلغ الدفع</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    min="0"
                    value={toArabicDigits(paymentAmount)}
                    onChange={(e) => setPaymentAmount(normalizeDigits(e.target.value))}
                    className="h-11 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm font-medium outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
                  />
                </label>
                <Button className="mt-3" onClick={() => void handlePayDebt()} disabled={paying}>
                  {paying ? "جارٍ التسديد..." : "تسجيل التسديد"}
                </Button>
              </div>
            ) : null}

            {message ? (
              <div
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                ].join(" ")}
              >
                {message.text}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full min-w-[720px] text-right text-sm sm:min-w-[780px]">
                <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">رقم الفاتورة</th>
                    <th className="px-4 py-3">التاريخ</th>
                    <th className="px-4 py-3">أصل الدين</th>
                    <th className="px-4 py-3">المدفوع</th>
                    <th className="px-4 py-3">المتبقي</th>
                    <th className="px-4 py-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {selectedCustomer.debts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center font-normal text-zinc-500">
                        لا توجد ديون مسجلة على هذا العميل
                      </td>
                    </tr>
                  ) : (
                    selectedCustomer.debts.map((debt) => (
                      <tr key={debt.id}>
                        <td className="px-4 py-3 font-medium text-zinc-950">{getDebtInvoiceNumber(debt)}</td>
                        <td className="px-4 py-3 font-normal text-zinc-600">{formatDate(debt.date)}</td>
                        <td className="px-4 py-3 font-medium">
                          <AnimatedDigits value={formatCurrency(debt.amount)} />
                        </td>
                        <td className="px-4 py-3 font-medium text-emerald-700">
                          <AnimatedDigits value={formatCurrency(debt.paid)} />
                        </td>
                        <td className="px-4 py-3 font-medium text-red-700">
                          <AnimatedDigits value={formatCurrency(debt.remaining)} />
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<ReceiptText className="h-4 w-4" />}
                            onClick={() => void openDebtDetail(debt)}
                          >
                            عرض التفاصيل
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Debt detail modal */}
      <Modal
        open={Boolean(selectedDebt)}
        title={
          selectedDebtInvoice
            ? `تفاصيل الفاتورة ${selectedDebtInvoice.number}`
            : "تفاصيل الدين"
        }
        onClose={closeDebtDetail}
        size="lg"
        footer={
          selectedDebt ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={closeDebtDetail}>
                إغلاق
              </Button>
              {selectedDebt.remaining > 0 ? (
                <Button
                  icon={<WalletCards className="h-5 w-5" />}
                  onClick={() => setShowDebtPaymentForm((v) => !v)}
                >
                  تسديد دفعة
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {selectedDebt ? (
          <div className="space-y-5">
            {debtDetailLoading ? (
              <p className="text-center text-sm font-normal text-zinc-500">جارٍ تحميل التفاصيل...</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-medium text-zinc-500">الوصف</p>
                <p className="mt-1 font-medium text-zinc-950">{selectedDebt.description}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-medium text-zinc-500">التاريخ</p>
                <p className="mt-1 font-medium text-zinc-950">{formatDate(selectedDebt.date)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-xs font-medium text-emerald-700">المدفوع</p>
                <p className="mt-1 font-medium text-emerald-700">
                  <AnimatedDigits value={formatCurrency(selectedDebtDisplayPaid)} />
                </p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-xs font-medium text-red-700">المتبقي</p>
                <p className="mt-1 font-medium text-red-700">
                  <AnimatedDigits value={formatCurrency(selectedDebt.remaining)} />
                </p>
              </div>
            </div>

            {showDebtPaymentForm ? (
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
                <p className="mb-3 text-sm font-medium text-zinc-900">تسديد دفعة على هذا الدين</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-700">المبلغ</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={toArabicDigits(debtPaymentAmount)}
                      onChange={(e) => setDebtPaymentAmount(normalizeDigits(e.target.value))}
                      className="h-10 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm font-medium outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-700">ملاحظات (اختياري)</span>
                    <input
                      type="text"
                      value={debtPaymentNotes}
                      onChange={(e) => setDebtPaymentNotes(e.target.value)}
                      className="h-10 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm font-medium outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
                    />
                  </label>
                </div>
                <Button className="mt-3" onClick={() => void handlePaySingleDebt()} disabled={debtPaying}>
                  {debtPaying ? "جارٍ التسجيل..." : "تسجيل الدفعة"}
                </Button>
              </div>
            ) : null}

            {debtMessage ? (
              <div
                className={[
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  debtMessage.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                ].join(" ")}
              >
                {debtMessage.text}
              </div>
            ) : null}

            {selectedDebt.payments && selectedDebt.payments.length > 0 ? (
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-700">سجل الدفعات</p>
                <div className="overflow-x-auto rounded-lg border border-zinc-200">
                  <table className="w-full min-w-[480px] text-right text-sm">
                    <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">تاريخ الدفعة</th>
                        <th className="px-4 py-3">المبلغ</th>
                        <th className="px-4 py-3">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {selectedDebt.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="px-4 py-3 font-normal text-zinc-600">{formatDate(payment.date)}</td>
                          <td className="px-4 py-3 font-medium text-emerald-700">
                            <AnimatedDigits value={formatCurrency(payment.amount)} />
                          </td>
                          <td className="px-4 py-3 font-normal text-zinc-500">{payment.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {debtInvoiceLoading ? (
              <div className="rounded-lg bg-zinc-50 px-4 py-8 text-center text-sm font-normal text-zinc-500">
                جارٍ تحميل تفاصيل الفاتورة...
              </div>
            ) : selectedDebtInvoice ? (
              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="w-full min-w-[620px] text-right text-sm sm:min-w-[680px]">
                  <thead className="bg-zinc-50 text-xs font-medium text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">اسم المنتج</th>
                      <th className="px-4 py-3">السعر</th>
                      <th className="px-4 py-3">الكمية</th>
                      <th className="px-4 py-3">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {selectedDebtInvoice.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center font-normal text-zinc-500">
                          لا توجد منتجات مسجلة في هذه الفاتورة
                        </td>
                      </tr>
                    ) : (
                      selectedDebtInvoice.items.map((item, idx) => (
                        <tr key={`${selectedDebtInvoice.id}-${item.productId || idx}`}>
                          <td className="px-4 py-3 font-normal text-zinc-950">
                            {toArabicDigits(item.productName)}
                          </td>
                          <td className="px-4 py-3 font-normal">
                            <AnimatedDigits value={formatCurrency(item.price)} />
                          </td>
                          <td className="px-4 py-3 font-medium">
                            <AnimatedDigits value={formatNumber(item.quantity)} />
                          </td>
                          <td className="px-4 py-3 font-medium text-brand-700">
                            <AnimatedDigits value={formatCurrency(item.total)} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : !debtDetailLoading && !(selectedDebt.payments && selectedDebt.payments.length > 0) ? (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                لا توجد دفعات أو تفاصيل فاتورة متاحة لهذا الدين.
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
