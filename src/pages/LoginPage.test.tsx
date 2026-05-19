import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthStoreProvider } from "../store/AuthStore";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  it("shows WhatsApp activation instructions after registration", () => {
    const markup = renderToStaticMarkup(
      <AuthStoreProvider>
        <MemoryRouter initialEntries={[{ pathname: "/login", state: { registered: true } }]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthStoreProvider>,
    );

    expect(markup).toContain("تم إنشاء الحساب بنجاح. لتفعيل الدخول، يرجى التواصل عبر");
    expect(markup).toContain(">الواتساب</a>");
    expect(markup).toContain('href="https://wa.me/972597986160"');
    expect(markup).toContain("whitespace-nowrap");
    expect(markup).not.toContain("+972 59-798-6160");
  });
});
