import { useState } from "react";
import { BarChart3, Boxes, Menu, ReceiptText, ScanBarcode, UsersRound, X } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/cashier", label: "الكاشير", icon: ScanBarcode },
  { to: "/products", label: "المنتجات", icon: Boxes },
  { to: "/customers", label: "العملاء", icon: UsersRound },
  { to: "/invoices", label: "الفواتير", icon: ReceiptText },
  { to: "/reports", label: "التقارير", icon: BarChart3 },
];

export function Sidebar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "flex min-w-fit shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition lg:w-full lg:py-3",
      isActive ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/10 hover:text-white",
    ].join(" ");

  return (
    <>
      <aside className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-950 text-white lg:h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-l xl:w-72">
        <div className="flex items-center justify-between px-3 py-3 sm:px-4 sm:py-4 lg:block lg:px-5 lg:py-6 xl:px-6 xl:py-7">
          <h1 className="text-xl font-extrabold xl:text-2xl">ابراهيم ماركت</h1>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/15 lg:hidden"
            aria-label="فتح القائمة"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>

        <nav className="hidden gap-2 overflow-x-auto px-3 pb-3 lg:flex lg:flex-col lg:overflow-y-auto lg:px-4 lg:pb-0">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass}>
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/55"
            aria-label="إغلاق القائمة"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <aside className="absolute right-0 top-0 flex h-full w-[min(84vw,20rem)] flex-col bg-zinc-950 text-white shadow-panel">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <h2 className="text-xl font-extrabold">ابراهيم ماركت</h2>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 transition hover:bg-white/15"
                aria-label="إغلاق القائمة"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-2 overflow-y-auto p-4">
              {items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={navLinkClass}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
