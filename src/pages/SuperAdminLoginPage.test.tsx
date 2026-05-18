import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, type Location } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthStoreProvider } from "../store/AuthStore";
import {
  getSuperAdminLoginRedirectTo,
  getSuperAdminLoginRequest,
  SuperAdminLoginPage,
} from "./SuperAdminLoginPage";

const makeLocation = (pathname: string, search = "", hash = ""): Location => ({
  pathname,
  search,
  hash,
  state: null,
  key: "test",
});

describe("SuperAdminLoginPage", () => {
  it("renders a focused super-admin login form without store fields", () => {
    const markup = renderToStaticMarkup(
      <AuthStoreProvider>
        <MemoryRouter initialEntries={["/super-admin-login"]}>
          <Routes>
            <Route path="/super-admin-login" element={<SuperAdminLoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthStoreProvider>,
    );

    expect(markup).toContain("دخول المشرف العام");
    expect(markup).toContain("اسم المستخدم");
    expect(markup).toContain("كلمة المرور");
    expect(markup).toContain('href="/login"');
    expect(markup).not.toContain("اسم المتجر");
    expect(markup).not.toContain("store-subdomain");
  });

  it("normalizes submit values without adding a store subdomain", () => {
    const { request, error } = getSuperAdminLoginRequest({
      username: "  admin-user  ",
      password: "  exact password  ",
    });

    expect(error).toBeNull();
    expect(request).toEqual({
      username: "admin-user",
      password: "  exact password  ",
    });
    expect("subdomain" in request).toBe(false);
  });

  it("returns the empty-field validation error when username or password is missing", () => {
    expect(
      getSuperAdminLoginRequest({
        username: "   ",
        password: "password",
      }),
    ).toEqual({
      request: {
        username: "",
        password: "password",
      },
      error: "أدخل اسم المستخدم وكلمة المرور.",
    });

    expect(
      getSuperAdminLoginRequest({
        username: "admin-user",
        password: "",
      }).error,
    ).toBe("أدخل اسم المستخدم وكلمة المرور.");
  });

  it("falls back to cashier for auth entry redirects", () => {
    expect(getSuperAdminLoginRedirectTo()).toBe("/cashier");
    expect(getSuperAdminLoginRedirectTo(makeLocation("/login"))).toBe("/cashier");
    expect(getSuperAdminLoginRedirectTo(makeLocation("/register"))).toBe("/cashier");
    expect(getSuperAdminLoginRedirectTo(makeLocation("/super-admin-login"))).toBe("/cashier");
  });

  it("preserves protected redirect pathname search and hash", () => {
    expect(getSuperAdminLoginRedirectTo(makeLocation("/reports", "?period=today", "#summary"))).toBe(
      "/reports?period=today#summary",
    );
  });
});
