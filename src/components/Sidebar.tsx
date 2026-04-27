import { BarChart3, Boxes, ReceiptText, ScanBarcode, UsersRound } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/cashier", label: "الكاشير", icon: ScanBarcode },
  { to: "/products", label: "المنتجات", icon: Boxes },
  { to: "/customers", label: "العملاء", icon: UsersRound },
  { to: "/invoices", label: "الفواتير", icon: ReceiptText },
  { to: "/reports", label: "التقارير", icon: BarChart3 },
];

export function Sidebar() {
  return (
    <aside className="border-b border-zinc-200 bg-zinc-950 text-white lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-l">
      <div className="flex items-center justify-between px-4 py-4 lg:block lg:px-6 lg:py-7">
        <div>
          <p className="text-xs font-semibold text-brand-100">نظام نقاط بيع</p>
          <h1 className="mt-1 text-2xl font-extrabold">ابراهيم ماركت</h1>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto px-3 pb-4 lg:flex-col lg:px-4 lg:pb-0">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                "flex min-w-fit items-center gap-2 rounded-lg px-3 py-3 text-sm font-bold transition lg:w-full",
                isActive ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10 hover:text-white",
              ].join(" ")
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
