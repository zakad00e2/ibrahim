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

    const session = await superAdminLoginRequest({
      username: "superadmin",
      password: "SuperAdmin@123",
    });

    expect(session).toEqual({
      token: "super-admin-token",
      user: {
        id: "b040893a-a1d1-40c3-8c1b-7bbcde30c514",
        username: "superadmin",
        email: "superadmin@safi-pos.com",
        role: "SUPER_ADMIN",
        storeId: null,
      },
    });
    expect(session).not.toHaveProperty("raw");

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

  it("translates invalid credentials into a specific Arabic login error", async () => {
    mockFetch(
      new Response(JSON.stringify({ message: "Invalid credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      superAdminLoginRequest({
        username: "superadmin",
        password: "wrong-password",
      }),
    ).rejects.toThrow("اسم المستخدم أو كلمة المرور غير صحيحة.");
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

  it("shows a retry delay when public auth endpoints are throttled", async () => {
    mockFetch(
      new Response(JSON.stringify({ statusCode: 429, message: "ThrottlerException: Too Many Requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "30",
        },
      }),
    );

    await expect(
      superAdminLoginRequest({
        username: "superadmin",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject({
      message: "تجاوزت عدد المحاولات. حاول بعد 30 ثانية.",
      statusCode: 429,
      retryAfterSeconds: 30,
    });
  });
});
