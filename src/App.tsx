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
import { SuperAdminDashboardPage } from "./pages/SuperAdminDashboardPage";
import { SuperAdminLoginPage } from "./pages/SuperAdminLoginPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import type { AuthSession } from "./types";

export const normalizeLeadingSlashPathname = (pathname: string) => pathname.replace(/^\/{2,}/, "/");

export const isSuperAdminSession = (session: AuthSession | null): boolean =>
  session?.user.role === "SUPER_ADMIN";

export const getAuthenticatedHomePath = (session: AuthSession | null): string =>
  isSuperAdminSession(session) ? "/super-admin" : "/cashier";

function ProtectedLayout() {
  const location = useLocation();
  const { session } = useAuthStore();
  const normalizedPathname = normalizeLeadingSlashPathname(location.pathname);

  if (normalizedPathname !== location.pathname) {
    return <Navigate to={`${normalizedPathname}${location.search}${location.hash}`} replace />;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (isSuperAdminSession(session)) {
    return <Navigate to="/super-admin" replace />;
  }

  return <Layout />;
}

function SuperAdminRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const { session } = useAuthStore();

  if (!session) {
    return <Navigate to="/super-admin-login" replace state={{ from: location }} />;
  }

  if (!isSuperAdminSession(session)) {
    return <Navigate to="/cashier" replace />;
  }

  return children;
}

function PublicAuthRoute({ children }: { children: ReactElement }) {
  const { session } = useAuthStore();

  if (session) {
    return <Navigate to={getAuthenticatedHomePath(session)} replace />;
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
            <Route
              path="/super-admin"
              element={
                <SuperAdminRoute>
                  <SuperAdminDashboardPage />
                </SuperAdminRoute>
              }
            />
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
