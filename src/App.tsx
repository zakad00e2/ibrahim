import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AppStoreProvider } from "./store/AppStore";
import { CashierPage } from "./pages/CashierPage";
import { ProductsPage } from "./pages/ProductsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { ReportsPage } from "./pages/ReportsPage";

export function App() {
  return (
    <BrowserRouter>
      <AppStoreProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/cashier" replace />} />
            <Route path="/cashier" element={<CashierPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
        </Routes>
      </AppStoreProvider>
    </BrowserRouter>
  );
}
