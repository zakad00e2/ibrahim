import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "../store/AppStore";

export function Layout() {
  const { isOffline } = useAppStore();

  return (
    <div className="min-h-dvh bg-[#f7f8f6] lg:flex">
      <Sidebar />
      <div className="min-w-0 flex-1 overflow-x-hidden">
        {isOffline ? (
          <div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950 ring-1 ring-inset ring-amber-300">
            أنت غير متصل بالإنترنت — يتم عرض البيانات المحفوظة
          </div>
        ) : null}
        <Header />
        <main className="px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 xl:px-8 xl:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
