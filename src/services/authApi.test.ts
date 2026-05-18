import { afterEach, describe, expect, it, vi } from "vitest";
import { forgotPasswordRequest, resetPasswordRequest, superAdminLoginRequest } from "./authApi";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("authApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs in a super admin without a store subdomain", async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify({
          token: "super-admin-token",
          userData: {
            id: "b040893a-a1d1-40c3-8c1b-7bbcde30c514",
            username: "superadmin",
            email: "superadmin@safi-pos.com",
            role: "SUPER_ADMIN",
            isActive: true,
            storeId: null,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      superAdminLoginRequest({
        username: "superadmin",
        password: "SuperAdmin@123",
      }),
    ).resolves.toEqual({
      token: "super-admin-token",
      user: {
        id: "b040893a-a1d1-40c3-8c1b-7bbcde30c514",
        username: "superadmin",
        email: "superadmin@safi-pos.com",
        role: "SUPER_ADMIN",
        storeId: null,
      },
      raw: {
        token: "super-admin-token",
        userData: {
          id: "b040893a-a1d1-40c3-8c1b-7bbcde30c514",
          username: "superadmin",
          email: "superadmin@safi-pos.com",
          role: "SUPER_ADMIN",
          isActive: true,
          storeId: null,
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/super-admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "superadmin",
        password: "SuperAdmin@123",
      }),
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("subdomain");
  });

  it("throws the backend message when super admin login fails", async () => {
    mockFetch(
      new Response(JSON.stringify({ message: "بيانات الدخول غير صحيحة أو الحساب معطّل" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      superAdminLoginRequest({
        username: "superadmin",
        password: "wrong-password",
      }),
    ).rejects.toThrow("بيانات الدخول غير صحيحة أو الحساب معطّل");
  });

  it("requests a password reset link by email", async () => {
    const fetchMock = mockFetch(
      new Response(JSON.stringify({ message: "If this email exists, a reset link has been sent." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(forgotPasswordRequest("admin@ibrahim-market.com")).resolves.toEqual({
      message: "If this email exists, a reset link has been sent.",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@ibrahim-market.com" }),
    });
  });

  it("throws the backend message when password reset request fails", async () => {
    mockFetch(
      new Response(JSON.stringify({ message: "Invalid email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(forgotPasswordRequest("bad-email")).rejects.toThrow("Invalid email");
  });

  it("resets a password with the email token", async () => {
    const fetchMock = mockFetch(
      new Response(JSON.stringify({ message: "تم تغيير كلمة المرور بنجاح" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      resetPasswordRequest({
        token: "reset-token",
        newPassword: "newStrongPassword123",
      }),
    ).resolves.toEqual({
      message: "تم تغيير كلمة المرور بنجاح",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "reset-token",
        newPassword: "newStrongPassword123",
      }),
    });
  });

  it("throws the backend message when the reset token is invalid", async () => {
    mockFetch(
      new Response(JSON.stringify({ message: "Invalid or expired reset token" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      resetPasswordRequest({
        token: "expired-token",
        newPassword: "newStrongPassword123",
      }),
    ).rejects.toThrow("Invalid or expired reset token");
  });
});
