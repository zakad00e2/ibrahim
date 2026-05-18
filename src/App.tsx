import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AppStoreProvider } from "./store/AppStore";
import { AuthStoreProvider, useAuthStore } from "./store/AuthStore";
import { CashierPage } from "./pages/CashierPage";
import { ProductsPage } from "./pages/ProductsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SuperAdminLoginPage } from "./pages/SuperAdminLoginPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

function ProtectedLayout() {
  const location = useLocation();
  const { session } = useAuthStore();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Layout />;
}

function PublicAuthRoute({ children }: { children: ReactElement }) {
  const { session } = useAuthStore();

  if (session) {
    return <Navigate to="/cashier" replace />;
  }

  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthStoreProvider>
        <AppStoreProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicAuthRoute>
                  <LoginPage />
                </PublicAuthRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicAuthRoute>
                  <RegisterPage />
                </PublicAuthRoute>
              }
            />
            <Route
              path="/verify-email"
              element={
                <PublicAuthRoute>
                  <VerifyEmailPage />
                </PublicAuthRoute>
              }
            />
            <Route
              path="/super-admin-login"
              element={
                <PublicAuthRoute>
                  <SuperAdminLoginPage />
                </PublicAuthRoute>
              }
            />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<ProtectedLayout />}>
              <Route index element={<Navigate to="/cashier" replace />} />
              <Route path="/cashier" element={<CashierPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="*" element={<Navigate to="/cashier" replace />} />
            </Route>
          </Routes>
        </AppStoreProvider>
      </AuthStoreProvider>
    </BrowserRouter>
  );
}
