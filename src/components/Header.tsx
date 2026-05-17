import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useLocation } from "react-router-dom";
import { DEFAULT_STORE_NAME, getStoreInfo } from "../services/storeApi";
import { toArabicDigits } from "../utils/formatCurrency";

const pageTitles: Record<string, string> = {
  "/products": "إدارة المنتجات",
  "/customers": "إدارة العملاء",
  "/invoices": "الفواتير",
  "/reports": "التقارير",
};

export function Header() {
  const location = useLocation();
  const [storeName, setStoreName] = useState(DEFAULT_STORE_NAME);
  const title = location.pathname === "/cashier" ? storeName : (pageTitles[location.pathname] ?? DEFAULT_STORE_NAME);

  useEffect(() => {
    if (location.pathname !== "/cashier") {
      return;
    }

    let shouldIgnore = false;

    const loadStoreName = async () => {
      try {
        const store = await getStoreInfo();

        if (!shouldIgnore) {
          setStoreName(store.name);
        }
      } catch {
        if (!shouldIgnore) {
          setStoreName(DEFAULT_STORE_NAME);
        }
      }
    };

    void loadStoreName();

    return () => {
      shouldIgnore = true;
    };
  }, [location.pathname]);

  const today = toArabicDigits(
    new Intl.DateTimeFormat("ar-EG-u-nu-arab", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date()),
  );

  return (
    <header className="border-b border-zinc-200 bg-white px-3 py-3 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-medium text-zinc-950 sm:text-2xl">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm font-normal text-zinc-600">
          <div className="inline-flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-brand-600" />
            {today}
          </div>
        </div>
      </div>
    </header>
  );
}
