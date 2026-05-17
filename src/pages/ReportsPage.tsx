import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeDollarSign, BarChart3, Boxes, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { AnimatedDigits } from "../components/AnimatedDigits";
import { StatusBadge } from "../components/StatusBadge";
import { useAppStore } from "../store/AppStore";
import { getCustomerDebtTotal, getStockStatus, getTopSellingProducts } from "../utils/calculations";
import { formatCurrency, formatNumber, toArabicDigits } from "../utils/formatCurrency";
import { getDailyProfit, type DailyProfit } from "../services/reportsApi";
import { getInvoiceById } from "../services/invoicesApi";
import type { Invoice } from "../types";

const toLocalDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayString = toLocalDateString(new Date());

const isSameDay = (isoString: string, dateString: string): boolean => {
  try {
    return toLocalDateString(new Date(isoString)) === dateString;
  } catch {
    return false;
  }
};

export function ReportsPage() {
  const { products, customers, invoices } = useAppStore();

  const [selectedDate, setSelectedDate] = useState<string>(todayString);
  const [dailyProfit, setDailyProfit] = useState<DailyProfit | null>(null);
  const [reportInvoices, setReportInvoices] = useState<Invoice[]>([]);
  const [topProductsLoading, setTopProductsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    getDailyProfit(selectedDate)
      .then((data) => {
        if (!controller.signal.aborted) {
          setDailyProfit(data);
        }
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "تعذر تحميل بيانات التقرير.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedDate]);

  useEffect(() => {
    let cancelled = false;
    const invoicesWithoutItems = invoices.filter((invoice) => invoice.id && invoice.items.length === 0);

    if (invoicesWithoutItems.length === 0) {
      setReportInvoices(invoices);
      setTopProductsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setTopProductsLoading(true);

    Promise.allSettled(invoicesWithoutItems.map((invoice) => getInvoiceById(invoice.id)))
      .then((results) => {
        if (cancelled) return;

        const detailsById = new Map<string, Invoice>();
        results.forEach((result) => {
          if (result.status === "fulfilled") {
            detailsById.set(result.value.id, result.value);
          }
        });

        setReportInvoices(
          invoices.map((invoice) => detailsById.get(invoice.id) ?? invoice),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setTopProductsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [invoices]);

  const invoicesForTopProducts = reportInvoices.length > 0 || invoices.length === 0 ? reportInvoices : invoices;

  const stats = useMemo(() => {
    const totalDebt = customers.reduce((sum, customer) => sum + getCustomerDebtTotal(customer), 0);
    const lowStockProducts = products.filter((product) => product.stock < 5);
    const selectedInvoices = invoices.filter((invoice) => isSameDay(invoice.date, selectedDate));

    return {
      invoicesCount: selectedInvoices.length,
      totalDebt,
      lowStockProducts,
      topSellingProducts: getTopSellingProducts(invoicesForTopProducts),
    };
  }, [products, customers, invoices, invoicesForTopProducts, selectedDate]);

  const isToday = selectedDate === todayString;

  const revenue = dailyProfit?.totalRevenue ?? null;
  const profit = dailyProfit?.netProfit ?? null;

  const displayValue = (val: number | null): string =>
    val === null ? "—" : formatCurrency(val);

  return (
    <div className="space-y-5">
      {/* Date selector bar */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="report-date" className="text-sm font-medium text-zinc-600">
          تاريخ التقرير
        </label>
        <input
          id="report-date"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        {loading && (
          <span className="text-xs text-zinc-400">جاري التحميل…</span>
        )}
        {!loading && error && (
          <span className="text-xs text-red-500">{error}</span>
        )}
      </div>

      {/* KPI cards */}
      <section className="grid gap-3 min-[460px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className={`flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-opacity ${loading ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">مبيعات {isToday ? "اليوم" : "اليوم المختار"}</p>
            <TrendingUp className="h-5 w-5 text-brand-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-zinc-950 sm:text-3xl">
            <AnimatedDigits value={displayValue(revenue)} />
          </p>
        </div>

        <div className={`flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-opacity ${loading ? "opacity-50" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">ربح {isToday ? "اليوم" : "اليوم المختار"}</p>
            <BadgeDollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-emerald-700 sm:text-3xl">
            <AnimatedDigits value={displayValue(profit)} />
          </p>
        </div>

        <div className="flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">
              {isToday ? "عدد فواتير اليوم" : "عدد فواتير اليوم المختار"}
            </p>
            <ReceiptText className="h-5 w-5 text-sky-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-zinc-950 sm:text-3xl">
            <AnimatedDigits value={formatNumber(stats.invoicesCount)} />
          </p>
        </div>

        <div className="flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">إجمالي الديون</p>
            <WalletCards className="h-5 w-5 text-red-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-red-700 sm:text-3xl">
            <AnimatedDigits value={formatCurrency(stats.totalDebt)} />
          </p>
        </div>

        <div className="flex min-h-28 flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-normal text-zinc-500">عدد المنتجات قليلة الكمية</p>
            <Boxes className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-auto pt-4 text-2xl font-extrabold text-amber-700 sm:text-3xl">
            <AnimatedDigits value={formatNumber(stats.lowStockProducts.length)} />
          </p>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
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
                {stats.lowStockProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center font-normal text-zinc-500">
                      لا توجد منتجات بكمية منخفضة
                    </td>
                  </tr>
                ) : (
                  stats.lowStockProducts.map((product) => {
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
                  })
                )}
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
                {topProductsLoading ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center font-normal text-zinc-500">
                      جاري تحميل تفاصيل المنتجات...
                    </td>
                  </tr>
                ) : stats.topSellingProducts.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center font-normal text-zinc-500">
                      لا توجد منتجات مباعة بعد
                    </td>
                  </tr>
                ) : (
                  stats.topSellingProducts.map((product) => (
                    <tr key={product.name}>
                      <td className="px-4 py-3 font-normal text-zinc-950">{toArabicDigits(product.name)}</td>
                      <td className="px-4 py-3 font-bold"><AnimatedDigits value={formatNumber(product.quantity)} /></td>
                      <td className="px-4 py-3 font-extrabold text-brand-700"><AnimatedDigits value={formatCurrency(product.total)} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
