import { useMemo } from "react";
import { BadgeDollarSign, BarChart3, Boxes, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { AnimatedDigits } from "../components/AnimatedDigits";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store/AppStore";
import { calculateCustomerDebt, calculateItemsProfit, getStockStatus, getTopSellingProducts } from "../utils/calculations";
import { formatCurrency, formatNumber, toArabicDigits } from "../utils/formatCurrency";

const isToday = (value: string) => new Date(value).toDateString() === new Date().toDateString();

export function ReportsPage() {
  const { products, customers, invoices } = useAppStore();

  const stats = useMemo(() => {
    const todayInvoices = invoices.filter((invoice) => isToday(invoice.date));
    const totalDebt = customers.reduce((sum, customer) => sum + calculateCustomerDebt(customer.debts), 0);
    const lowStockProducts = products.filter((product) => product.stock < 5);
    const dailyProductProfits = new Map<
      string,
      { name: string; quantity: number; sales: number; cost: number; profit: number }
    >();

    todayInvoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        const current = dailyProductProfits.get(item.productId) ?? {
          name: item.productName,
          quantity: 0,
          sales: 0,
          cost: 0,
          profit: 0,
        };
        const sales = item.total;
        const cost = item.wholesalePrice * item.quantity;

        dailyProductProfits.set(item.productId, {
          name: item.productName,
          quantity: current.quantity + item.quantity,
          sales: current.sales + sales,
          cost: current.cost + cost,
          profit: current.profit + sales - cost,
        });
      });
    });

    return {
      salesToday: todayInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
      profitToday: todayInvoices.reduce((sum, invoice) => sum + calculateItemsProfit(invoice.items), 0),
      invoicesToday: todayInvoices.length,
      totalDebt,
      lowStockProducts,
      topSellingProducts: getTopSellingProducts(invoices),
      dailyProductProfits: Array.from(dailyProductProfits.values()).sort((a, b) => b.profit - a.profit),
    };
  }, [products, customers, invoices]);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 min-[460px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">مبيعات اليوم</p>
            <TrendingUp className="h-5 w-5 text-brand-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-zinc-950 sm:text-3xl"><AnimatedDigits value={formatCurrency(stats.salesToday)} /></p>
        </div>

        <div className="flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">ربح اليوم</p>
            <BadgeDollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-emerald-700 sm:text-3xl"><AnimatedDigits value={formatCurrency(stats.profitToday)} /></p>
        </div>

        <div className="flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">عدد فواتير اليوم</p>
            <ReceiptText className="h-5 w-5 text-sky-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-zinc-950 sm:text-3xl"><AnimatedDigits value={formatNumber(stats.invoicesToday)} /></p>
        </div>

        <div className="flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">إجمالي الديون</p>
            <WalletCards className="h-5 w-5 text-red-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-red-700 sm:text-3xl"><AnimatedDigits value={formatCurrency(stats.totalDebt)} /></p>
        </div>

        <div className="flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">عدد المنتجات قليلة الكمية</p>
            <Boxes className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-amber-700 sm:text-3xl"><AnimatedDigits value={formatNumber(stats.lowStockProducts.length)} /></p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
            <BadgeDollarSign className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="text-lg font-extrabold text-zinc-950">أرباح منتجات اليوم</h3>
              <p className="text-sm font-normal text-zinc-500">الربح محسوب من كل فواتير اليوم كاش أو دين</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-right text-sm sm:min-w-[820px]">
              <thead className="bg-zinc-50 text-xs font-extrabold text-zinc-500">
                <tr>
                  <th className="px-4 py-3">المنتج</th>
                  <th className="px-4 py-3">الكمية</th>
                  <th className="px-4 py-3">المبيعات</th>
                  <th className="px-4 py-3">التكلفة</th>
                  <th className="px-4 py-3">الربح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {stats.dailyProductProfits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center font-normal text-zinc-500">
                      لا توجد مبيعات اليوم بعد
                    </td>
                  </tr>
                ) : (
                  stats.dailyProductProfits.map((product) => (
                    <tr key={product.name}>
                      <td className="px-4 py-3 font-normal text-zinc-950">{toArabicDigits(product.name)}</td>
                      <td className="px-4 py-3 font-medium"><AnimatedDigits value={formatNumber(product.quantity)} /></td>
                      <td className="px-4 py-3 font-medium text-brand-700"><AnimatedDigits value={formatCurrency(product.sales)} /></td>
                      <td className="px-4 py-3 font-medium text-zinc-700"><AnimatedDigits value={formatCurrency(product.cost)} /></td>
                      <td className="px-4 py-3 font-medium text-emerald-700"><AnimatedDigits value={formatCurrency(product.profit)} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-zinc-100 p-4">
            <Boxes className="h-5 w-5 text-amber-600" />
            <div>
              <h3 className="text-lg font-extrabold text-zinc-950">المنتجات قليلة الكمية</h3>
              <p className="text-sm font-normal text-zinc-500">المنتجات التي تحتاج متابعة مخزون</p>
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
                      <td className="px-4 py-3 font-normal text-zinc-950">{toArabicDigits(product.name)}</td>
                      <td className="px-4 py-3 font-semibold text-zinc-600">{product.barcode}</td>
                      <td className="px-4 py-3 font-bold"><AnimatedDigits value={formatNumber(product.stock)} /></td>
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
              <p className="text-sm font-normal text-zinc-500">تجميع من بيانات الفواتير التجريبية والحالية</p>
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
                    <td className="px-4 py-3 font-normal text-zinc-950">{toArabicDigits(product.name)}</td>
                    <td className="px-4 py-3 font-bold"><AnimatedDigits value={formatNumber(product.quantity)} /></td>
                    <td className="px-4 py-3 font-extrabold text-brand-700"><AnimatedDigits value={formatCurrency(product.total)} /></td>
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
