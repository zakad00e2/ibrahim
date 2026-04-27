import { CalendarClock } from "lucide-react";
import { useLocation } from "react-router-dom";

const pageTitles: Record<string, string> = {
  "/cashier": "شاشة الكاشير",
  "/products": "إدارة المنتجات",
  "/customers": "إدارة العملاء",
  "/invoices": "الفواتير",
  "/reports": "التقارير",
};

export function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "ابراهيم ماركت";
  const today = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <header className="border-b border-zinc-200 bg-white px-4 py-4 lg:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-700">ابراهيم ماركت</p>
          <h2 className="text-2xl font-extrabold text-zinc-950">{title}</h2>
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600">
          <CalendarClock className="h-5 w-5 text-brand-600" />
          {today}
        </div>
      </div>
    </header>
  );
}
