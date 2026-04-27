import { useMemo, useState, type FormEvent } from "react";
import { Eye, Pencil, Plus, ReceiptText, Search, Trash2, UserPlus, WalletCards } from "lucide-react";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { useAppStore } from "../store/AppStore";
import type { Customer, Debt } from "../types";
import { calculateCustomerDebt } from "../utils/calculations";
import { formatCurrency, formatDate, formatNumber, normalizeDigits, toArabicDigits } from "../utils/formatCurrency";

type CustomerForm = {
  name: string;
  phone: string;
};

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
};

export function CustomersPage() {
  const { customers, invoices, addCustomer, updateCustomer, deleteCustomer, payCustomerDebt } = useAppStore();
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [detailsCustomerId, setDetailsCustomerId] = useState<string | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === detailsCustomerId) ?? null,
    [customers, detailsCustomerId],
  );

  const totalDebt = useMemo(
    () => customers.reduce((sum, customer) => sum + calculateCustomerDebt(customer.debts), 0),
    [customers],
  );

  const selectedDebtInvoice = useMemo(
    () => (selectedDebt ? invoices.find((invoice) => invoice.id === selectedDebt.invoiceId) ?? null : null),
    [invoices, selectedDebt],
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

  const openAddModal = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setMessage(null);
    setFormModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({ name: customer.name, phone: customer.phone });
    setMessage(null);
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    setFormModalOpen(false);
    setEditingCustomer(null);
    setForm(emptyForm);
  };

  const openDetails = (customer: Customer) => {
    setDetailsCustomerId(customer.id);
    setShowPaymentForm(false);
    setPaymentAmount("");
    setMessage(null);
  };

  const closeDetails = () => {
    setDetailsCustomerId(null);
    setSelectedDebt(null);
    setShowPaymentForm(false);
    setPaymentAmount("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = editingCustomer
      ? updateCustomer(editingCustomer.id, form)
      : addCustomer(form);

    setMessage({ type: result.ok ? "success" : "error", text: result.message });

    if (result.ok) {
      closeFormModal();
      setMessage({ type: "success", text: result.message });
    }
  };

  const handleDelete = (customer: Customer) => {
    const confirmed = window.confirm(`هل تريد حذف العميل "${toArabicDigits(customer.name)}"؟`);

    if (!confirmed) {
      return;
    }

    deleteCustomer(customer.id);
    setMessage({ type: "success", text: "تم حذف العميل بنجاح" });
  };

  const handlePayDebt = () => {
    if (!selectedCustomer) {
      return;
    }

    const result = payCustomerDebt(selectedCustomer.id, Number(normalizeDigits(paymentAmount)));
    setMessage({ type: result.ok ? "success" : "error", text: result.message });

    if (result.ok) {
      setPaymentAmount("");
      setShowPaymentForm(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-500">عدد العملاء</p>
          <p className="mt-1 text-2xl font-extrabold text-zinc-950 sm:text-3xl">{formatNumber(customers.length)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-500">إجمالي الديون</p>
          <p className="mt-1 text-2xl font-extrabold text-red-700 sm:text-3xl">{formatCurrency(totalDebt)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-500">عملاء عليهم دين</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-700 sm:text-3xl">
            {formatNumber(customers.filter((customer) => calculateCustomerDebt(customer.debts) > 0).length)}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-zinc-950">قائمة العملاء</h3>
            <p className="text-sm font-semibold text-zinc-500">إدارة العملاء والديون محليًا داخل الواجهة</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block sm:w-80">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
              <input
                value={toArabicDigits(customerSearch)}
                onChange={(event) => setCustomerSearch(normalizeDigits(event.target.value))}
                placeholder="ابحث باسم العميل أو رقم الهاتف"
                className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-10 pl-3 text-sm font-bold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
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
              "mx-4 mt-4 rounded-lg px-3 py-2 text-sm font-bold",
              message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
            ].join(" ")}
          >
            {message.text}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-right text-sm sm:min-w-[760px]">
            <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
              <tr>
                <th className="px-4 py-3">الاسم</th>
                <th className="px-4 py-3">رقم الهاتف</th>
                <th className="px-4 py-3">إجمالي الدين</th>
                <th className="px-4 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center font-semibold text-zinc-500">
                    لا يوجد عملاء مطابقون للبحث
                  </td>
                </tr>
              ) : (
              filteredCustomers.map((customer) => {
                const debt = calculateCustomerDebt(customer.debts);

                return (
                  <tr key={customer.id}>
                    <td className="font-features-normal px-4 py-3 font-extrabold text-zinc-950">{toArabicDigits(customer.name)}</td>
                    <td className="px-4 py-3 font-semibold text-zinc-600">{customer.phone || "غير مسجل"}</td>
                    <td className={debt > 0 ? "px-4 py-3 font-extrabold text-red-700" : "px-4 py-3 font-bold text-emerald-700"}>
                      {formatCurrency(debt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => openDetails(customer)}>
                          التفاصيل
                        </Button>
                        <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => openEditModal(customer)}>
                          تعديل
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="حذف العميل" onClick={() => handleDelete(customer)}>
                          <Trash2 className="h-5 w-5 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={formModalOpen}
        title={editingCustomer ? "تعديل عميل" : "إضافة عميل"}
        onClose={closeFormModal}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeFormModal}>
              إلغاء
            </Button>
            <Button type="submit" form="customer-form" icon={<UserPlus className="h-5 w-5" />}>
              {editingCustomer ? "حفظ التعديل" : "إضافة العميل"}
            </Button>
          </div>
        }
      >
        <form id="customer-form" className="grid gap-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-zinc-900">اسم العميل</span>
            <input
              value={toArabicDigits(form.name)}
              onChange={(event) => setForm((current) => ({ ...current, name: normalizeDigits(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-zinc-900">رقم الهاتف</span>
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: normalizeDigits(event.target.value) }))}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>

          {message?.type === "error" ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{message.text}</div>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(selectedCustomer)}
        title="تفاصيل العميل"
        onClose={closeDetails}
        size="lg"
        footer={
          selectedCustomer ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={closeDetails}>
                إغلاق
              </Button>
              <Button
                icon={<WalletCards className="h-5 w-5" />}
                disabled={calculateCustomerDebt(selectedCustomer.debts) === 0}
                onClick={() => setShowPaymentForm((current) => !current)}
              >
                تسديد دين
              </Button>
            </div>
          ) : null
        }
      >
        {selectedCustomer ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">الاسم</p>
                <p className="font-features-normal mt-1 font-extrabold text-zinc-950">{toArabicDigits(selectedCustomer.name)}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">رقم الهاتف</p>
                <p className="mt-1 font-extrabold text-zinc-950">{selectedCustomer.phone || "غير مسجل"}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-xs font-bold text-red-500">إجمالي الدين</p>
                <p className="mt-1 font-extrabold text-red-700">
                  {formatCurrency(calculateCustomerDebt(selectedCustomer.debts))}
                </p>
              </div>
            </div>

            {showPaymentForm ? (
              <div className="rounded-lg border border-brand-100 bg-brand-50 p-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-zinc-900">مبلغ الدفع</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    min="0"
                    value={toArabicDigits(paymentAmount)}
                    onChange={(event) => setPaymentAmount(normalizeDigits(event.target.value))}
                    className="h-11 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm font-bold outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
                  />
                </label>
                <Button className="mt-3" onClick={handlePayDebt}>
                  تسجيل التسديد
                </Button>
              </div>
            ) : null}

            {message ? (
              <div
                className={[
                  "rounded-lg px-3 py-2 text-sm font-bold",
                  message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                ].join(" ")}
              >
                {message.text}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full min-w-[720px] text-right text-sm sm:min-w-[780px]">
                <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">الوصف</th>
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
                      <td colSpan={6} className="px-4 py-8 text-center font-semibold text-zinc-500">
                        لا توجد ديون مسجلة على هذا العميل
                      </td>
                    </tr>
                  ) : (
                    selectedCustomer.debts.map((debt) => (
                      <tr key={debt.id}>
                        <td className="px-4 py-3 font-bold text-zinc-950">{debt.description}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-600">{formatDate(debt.date)}</td>
                        <td className="px-4 py-3 font-bold">{formatCurrency(debt.amount)}</td>
                        <td className="px-4 py-3 font-bold text-emerald-700">{formatCurrency(debt.paid)}</td>
                        <td className="px-4 py-3 font-extrabold text-red-700">{formatCurrency(debt.remaining)}</td>
                        <td className="px-4 py-3">
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<ReceiptText className="h-4 w-4" />}
                            onClick={() => setSelectedDebt(debt)}
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

      <Modal
        open={Boolean(selectedDebt)}
        title={selectedDebtInvoice ? `تفاصيل الفاتورة ${selectedDebtInvoice.number}` : "تفاصيل الفاتورة"}
        onClose={() => setSelectedDebt(null)}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setSelectedDebt(null)}>
              إغلاق
            </Button>
          </div>
        }
      >
        {selectedDebt ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">الوصف</p>
                <p className="mt-1 font-extrabold text-zinc-950">{selectedDebt.description}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">التاريخ</p>
                <p className="mt-1 font-extrabold text-zinc-950">{formatDate(selectedDebt.date)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-700">المدفوع</p>
                <p className="mt-1 font-extrabold text-emerald-700">{formatCurrency(selectedDebt.paid)}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-xs font-bold text-red-700">المتبقي</p>
                <p className="mt-1 font-extrabold text-red-700">{formatCurrency(selectedDebt.remaining)}</p>
              </div>
            </div>

            {selectedDebtInvoice ? (
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
                    {selectedDebtInvoice.items.map((item) => (
                      <tr key={`${selectedDebtInvoice.id}-${item.productId}`}>
                        <td className="px-4 py-3 font-normal text-zinc-950">{toArabicDigits(item.productName)}</td>
                        <td className="px-4 py-3 font-semibold">{formatCurrency(item.price)}</td>
                        <td className="px-4 py-3 font-bold">{formatNumber(item.quantity)}</td>
                        <td className="px-4 py-3 font-extrabold text-brand-700">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                تفاصيل المنتجات غير متوفرة لهذه الفاتورة التجريبية، لكن بيانات الدين الأساسية ظاهرة بالأعلى.
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
