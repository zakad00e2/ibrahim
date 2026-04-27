import { useMemo, useState, type FormEvent } from "react";
import { Eye, Pencil, Plus, Trash2, UserPlus, WalletCards } from "lucide-react";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { useAppStore } from "../store/AppStore";
import type { Customer } from "../types";
import { calculateCustomerDebt } from "../utils/calculations";
import { formatCurrency, formatDate } from "../utils/formatCurrency";

type CustomerForm = {
  name: string;
  phone: string;
};

const emptyForm: CustomerForm = {
  name: "",
  phone: "",
};

export function CustomersPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, payCustomerDebt } = useAppStore();
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [detailsCustomerId, setDetailsCustomerId] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === detailsCustomerId) ?? null,
    [customers, detailsCustomerId],
  );

  const totalDebt = useMemo(
    () => customers.reduce((sum, customer) => sum + calculateCustomerDebt(customer.debts), 0),
    [customers],
  );

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
    const confirmed = window.confirm(`هل تريد حذف العميل "${customer.name}"؟`);

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

    const result = payCustomerDebt(selectedCustomer.id, Number(paymentAmount));
    setMessage({ type: result.ok ? "success" : "error", text: result.message });

    if (result.ok) {
      setPaymentAmount("");
      setShowPaymentForm(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-500">عدد العملاء</p>
          <p className="mt-1 text-3xl font-extrabold text-zinc-950">{customers.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-500">إجمالي الديون</p>
          <p className="mt-1 text-3xl font-extrabold text-red-700">{formatCurrency(totalDebt)}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-zinc-500">عملاء عليهم دين</p>
          <p className="mt-1 text-3xl font-extrabold text-amber-700">
            {customers.filter((customer) => calculateCustomerDebt(customer.debts) > 0).length}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-zinc-950">قائمة العملاء</h3>
            <p className="text-sm font-semibold text-zinc-500">إدارة العملاء والديون محليًا داخل الواجهة</p>
          </div>
          <Button icon={<Plus className="h-5 w-5" />} onClick={openAddModal}>
            إضافة عميل
          </Button>
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
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
              <tr>
                <th className="px-4 py-3">الاسم</th>
                <th className="px-4 py-3">رقم الهاتف</th>
                <th className="px-4 py-3">إجمالي الدين</th>
                <th className="px-4 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {customers.map((customer) => {
                const debt = calculateCustomerDebt(customer.debts);

                return (
                  <tr key={customer.id}>
                    <td className="px-4 py-3 font-extrabold text-zinc-950">{customer.name}</td>
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
              })}
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
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold outline-none focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-zinc-900">رقم الهاتف</span>
            <input
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
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
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">الاسم</p>
                <p className="mt-1 font-extrabold text-zinc-950">{selectedCustomer.name}</p>
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
                    type="number"
                    min="0"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
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
              <table className="w-full min-w-[680px] text-right text-sm">
                <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">الوصف</th>
                    <th className="px-4 py-3">التاريخ</th>
                    <th className="px-4 py-3">أصل الدين</th>
                    <th className="px-4 py-3">المدفوع</th>
                    <th className="px-4 py-3">المتبقي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {selectedCustomer.debts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center font-semibold text-zinc-500">
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
