import { CalendarClock } from "lucide-react";
import { useLocation } from "react-router-dom";
import { toArabicDigits } from "../utils/formatCurrency";

const pageTitles: Record<string, string> = {
  "/cashier": "شاشـــة الكاشير",
  "/products": "إدارة المنتجات",
  "/customers": "إدارة العملاء",
  "/invoices": "الفواتير",
  "/reports": "التقارير",
};

export function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "ابراهيم ماركت";
  const today = toArabicDigits(new Intl.DateTimeFormat("ar-EG-u-nu-arab", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date()));

  return (
    <header className="border-b border-zinc-200 bg-white px-3 py-3 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-medium text-zinc-950 sm:text-2xl">{title}</h2>
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-normal text-zinc-600">
          <CalendarClock className="h-5 w-5 text-brand-600" />
          {today}
        </div>
      </div>
    </header>
  );
}
