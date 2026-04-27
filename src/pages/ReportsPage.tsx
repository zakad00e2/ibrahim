import { useMemo } from "react";
import { BarChart3, Boxes, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store/AppStore";
import { calculateCustomerDebt, getStockStatus, getTopSellingProducts } from "../utils/calculations";
import { formatCurrency, formatNumber, toArabicDigits } from "../utils/formatCurrency";

const isToday = (value: string) => new Date(value).toDateString() === new Date().toDateString();

export function ReportsPage() {
  const { products, customers, invoices } = useAppStore();

  const stats = useMemo(() => {
    const todayInvoices = invoices.filter((invoice) => isToday(invoice.date));
    const totalDebt = customers.reduce((sum, customer) => sum + calculateCustomerDebt(customer.debts), 0);
    const lowStockProducts = products.filter((product) => product.stock < 5);

    return {
      salesToday: todayInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
      invoicesToday: todayInvoices.length,
      totalDebt,
      lowStockProducts,
      topSellingProducts: getTopSellingProducts(invoices),
    };
  }, [products, customers, invoices]);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 min-[460px]:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-zinc-500">مبيعات اليوم</p>
            <TrendingUp className="h-5 w-5 text-brand-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-zinc-950 sm:text-3xl">{formatCurrency(stats.salesToday)}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-zinc-500">عدد فواتير اليوم</p>
            <ReceiptText className="h-5 w-5 text-sky-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-zinc-950 sm:text-3xl">{formatNumber(stats.invoicesToday)}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-zinc-500">إجمالي الديون</p>
            <WalletCards className="h-5 w-5 text-red-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-red-700 sm:text-3xl">{formatCurrency(stats.totalDebt)}</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-zinc-500">عدد المنتجات قليلة الكمية</p>
            <Boxes className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-amber-700 sm:text-3xl">{formatNumber(stats.lowStockProducts.length)}</p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
            <Boxes className="h-5 w-5 text-amber-600" />
            <div>
              <h3 className="text-lg font-extrabold text-zinc-950">المنتجات قليلة الكمية</h3>
              <p className="text-sm font-semibold text-zinc-500">المنتجات التي تحتاج متابعة مخزون</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-right text-sm sm:min-w-[560px]">
              <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
                <tr>
                  <th className="px-4 py-3">المنتج</th>
                  <th className="px-4 py-3">الباركود</th>
                  <th className="px-4 py-3">المخزون</th>
                  <th className="px-4 py-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {stats.lowStockProducts.map((product) => {
                  const status = getStockStatus(product.stock);

                  return (
                    <tr key={product.id}>
                      <td className="px-4 py-3 font-extrabold text-zinc-950">{toArabicDigits(product.name)}</td>
                      <td className="px-4 py-3 font-semibold text-zinc-600">{product.barcode}</td>
                      <td className="px-4 py-3 font-bold">{formatNumber(product.stock)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            <div>
              <h3 className="text-lg font-extrabold text-zinc-950">أكثر المنتجات مبيعًا</h3>
              <p className="text-sm font-semibold text-zinc-500">تجميع من بيانات الفواتير التجريبية والحالية</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-right text-sm sm:min-w-[560px]">
              <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
                <tr>
                  <th className="px-4 py-3">المنتج</th>
                  <th className="px-4 py-3">الكمية المباعة</th>
                  <th className="px-4 py-3">إجمالي المبيعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {stats.topSellingProducts.map((product) => (
                  <tr key={product.name}>
                    <td className="px-4 py-3 font-extrabold text-zinc-950">{toArabicDigits(product.name)}</td>
                    <td className="px-4 py-3 font-bold">{formatNumber(product.quantity)}</td>
                    <td className="px-4 py-3 font-extrabold text-brand-700">{formatCurrency(product.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
