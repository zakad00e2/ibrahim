import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="min-h-dvh bg-[#f7f8f6] lg:flex">
      <Sidebar />
      <div className="min-w-0 flex-1 overflow-x-hidden">
        <Header />
        <main className="px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6 xl:px-8 xl:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
