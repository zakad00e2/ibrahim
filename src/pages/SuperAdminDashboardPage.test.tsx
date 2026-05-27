import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthStoreProvider } from "../store/AuthStore";
import {
  AdminInlineStoreUsersPanel,
  adminInlineUsersCellClass,
  adminStoreActionHeaderClass,
  getAdminStoreApproveActionLabel,
  getAdminStoreActionCellClass,
  getAdminStoreStatusActionMeta,
  getAdminStoreStatusMeta,
  getNextSelectedAdminStoreId,
  getSuperAdminStoreStats,
  SuperAdminDashboardPage,
} from "./SuperAdminDashboardPage";
import type { AdminStore, AdminUser } from "../types";

const makeStore = (overrides: Partial<AdminStore>): AdminStore => ({
  id: "store-id",
  name: "Store",
  subdomain: "store",
  plan: "FREE",
  status: "PENDING",
  createdAt: "2026-05-18T08:10:08.774Z",
  updatedAt: "2026-05-18T08:10:08.774Z",
  counts: {
    users: 0,
    products: 0,
    customers: 0,
  },
  ...overrides,
});

const makeUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  id: "user-id",
  username: "admin-user",
  email: "admin@example.com",
  role: "ADMIN",
  isActive: true,
  isEmailVerified: true,
  createdAt: "2026-05-18T08:10:08.774Z",
  updatedAt: "2026-05-18T08:10:08.774Z",
  storeId: "store-id",
  store: {
    id: "store-id",
    name: "Store",
    subdomain: "store",
    status: "APPROVED",
  },
  ...overrides,
});

describe("SuperAdminDashboardPage", () => {
  it("summarizes platform store counts", () => {
    expect(
      getSuperAdminStoreStats([
        makeStore({ id: "pending", status: "PENDING", counts: { users: 1, products: 0, customers: 0 } }),
        makeStore({ id: "approved", status: "APPROVED", counts: { users: 2, products: 5, customers: 3 } }),
      ]),
    ).toEqual({
      totalStores: 2,
      pendingStores: 1,
      approvedStores: 1,
      totalUsers: 3,
      totalProducts: 5,
      totalCustomers: 3,
    });
  });

  it("maps store statuses to Arabic labels and badge tones", () => {
    expect(getAdminStoreStatusMeta("PENDING")).toEqual({
      label: "قيد الانتظار",
      tone: "warning",
    });
    expect(getAdminStoreStatusMeta("APPROVED")).toEqual({
      label: "موافق عليه",
      tone: "success",
    });
  });

  it("uses one store status action that toggles between suspend and reactivate", () => {
    expect(getAdminStoreStatusActionMeta("APPROVED")).toEqual({
      kind: "suspend",
      label: "تعليق",
      pendingLabel: "جار التعليق",
      buttonVariant: "danger",
      errorFallback: "تعذر تعليق المتجر.",
    });

    expect(getAdminStoreStatusActionMeta("SUSPENDED")).toEqual({
      kind: "reactivate",
      label: "إعادة تفعيل",
      pendingLabel: "جار التفعيل",
      buttonVariant: "success",
      errorFallback: "تعذر إعادة تفعيل المتجر.",
    });
  });

  it("labels disabled approve buttons with the current store status", () => {
    expect(getAdminStoreApproveActionLabel("PENDING", false)).toBe("موافقة");
    expect(getAdminStoreApproveActionLabel("PENDING", true)).toBe("جار الموافقة");
    expect(getAdminStoreApproveActionLabel("APPROVED", false)).toBe("معتمد");
    expect(getAdminStoreApproveActionLabel("SUSPENDED", false)).toBe("موقوف");
  });

  it("keeps the store action column visible inside the horizontal table scroll", () => {
    expect(adminStoreActionHeaderClass).toContain("sticky left-0");
    expect(adminStoreActionHeaderClass).toContain("min-w-[20rem]");
    expect(getAdminStoreActionCellClass(false)).toContain("sticky left-0");
    expect(getAdminStoreActionCellClass(false)).toContain("bg-white");
    expect(getAdminStoreActionCellClass(true)).toContain("bg-emerald-50");
  });

  it("does not auto-expand users until a store is selected", () => {
    const stores = [
      makeStore({ id: "store-a", status: "APPROVED" }),
      makeStore({ id: "store-b", status: "PENDING" }),
    ];

    expect(getNextSelectedAdminStoreId("", stores)).toBe("");
    expect(getNextSelectedAdminStoreId("store-a", stores)).toBe("store-a");
    expect(getNextSelectedAdminStoreId("missing-store", stores)).toBe("");
  });

  it("renders selected store users inside an inline table panel", () => {
    const markup = renderToStaticMarkup(
      <AdminInlineStoreUsersPanel
        store={makeStore({ name: "Ibrahim Market" })}
        users={[makeUser()]}
        usersError={null}
        usersLoading={false}
      />,
    );

    expect(adminInlineUsersCellClass).toContain("bg-emerald-50/35");
    expect(markup).toContain("مستخدمو المتجر");
    expect(markup).toContain("Ibrahim Market");
    expect(markup).toContain("admin-user");
    expect(markup).toContain("admin@example.com");
    expect(markup).toContain("نشط");
  });

  it("renders the super-admin dashboard shell", () => {
    const markup = renderToStaticMarkup(
      <AuthStoreProvider>
        <MemoryRouter initialEntries={["/super-admin"]}>
          <Routes>
            <Route path="/super-admin" element={<SuperAdminDashboardPage />} />
          </Routes>
        </MemoryRouter>
      </AuthStoreProvider>,
    );

    expect(markup).toContain("لوحة المشرف العام");
    expect(markup).toContain("المتاجر");
    expect(markup).toContain("المستخدمون");
  });
});
