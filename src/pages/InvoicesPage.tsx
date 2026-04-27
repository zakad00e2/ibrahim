import { useState } from "react";
import { Eye, ReceiptText } from "lucide-react";
import { AnimatedDigits } from "../components/AnimatedDigits";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store/AppStore";
import type { Invoice } from "../types";
import { getPaymentMethodLabel } from "../utils/calculations";
import { formatCurrency, formatDate, formatNumber, toArabicDigits } from "../utils/formatCurrency";

const paymentTone = {
  cash: "success",
  debt: "danger",
  partial: "warning",
} as const;

export function InvoicesPage() {
  const { invoices } = useAppStore();
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

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
                    <Button variant="secondary" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => setSelectedInvoice(invoice)}>
                      عرض التفاصيل
                    </Button>
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
          <div className="flex justify-end">
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
    </div>
  );
}
