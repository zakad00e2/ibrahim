import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthStoreProvider } from "../store/AuthStore";
import { SuperAdminLoginPage } from "./SuperAdminLoginPage";

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
});
