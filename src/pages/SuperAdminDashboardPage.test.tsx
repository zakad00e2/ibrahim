import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthStoreProvider } from "../store/AuthStore";
import {
  getAdminStoreStatusMeta,
  getSuperAdminStoreStats,
  SuperAdminDashboardPage,
} from "./SuperAdminDashboardPage";
import type { AdminStore } from "../types";

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
