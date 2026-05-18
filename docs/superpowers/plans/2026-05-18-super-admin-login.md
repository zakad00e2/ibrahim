# Super Admin Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate `/super-admin-login` route that authenticates a super admin with username and password only.

**Architecture:** Keep store login unchanged. Add a super-admin auth API helper, extend the auth session model to preserve `role` and `storeId`, expose a matching `AuthStore.superAdminLogin` method, and create a standalone page wired through `App.tsx`.

**Tech Stack:** React 18, React Router, TypeScript, Vite, Vitest, Tailwind CSS, existing `fetch` auth helpers.

---

## File Structure

- Modify: `src/types/index.ts`
  - Add `SuperAdminLoginRequest`.
  - Add `role` and `storeId` to `AuthUser`.
- Modify: `src/services/authApi.ts`
  - Teach user parsing to read `userData`.
  - Add `superAdminLoginRequest`.
- Modify: `src/services/authApi.test.ts`
  - Add focused tests for the super-admin endpoint and response mapping.
- Modify: `src/store/AuthStore.tsx`
  - Expose `superAdminLogin` with the same session persistence behavior as `login`.
- Create: `src/pages/SuperAdminLoginPage.tsx`
  - Standalone username/password page for super-admin login.
- Create: `src/pages/SuperAdminLoginPage.test.tsx`
  - Render-level test that verifies no store subdomain field appears.
- Modify: `src/App.tsx`
  - Register `/super-admin-login` as a public route.

Do not modify `src/pages/LoginPage.tsx` for this feature. That file currently has unrelated working-tree edits, and the approved spec only requires the separate super-admin page plus a link from the new page back to `/login`.

---

### Task 1: Super-Admin Auth API

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/authApi.ts`
- Modify: `src/services/authApi.test.ts`

- [ ] **Step 1: Write the failing service tests**

Append these tests inside the existing `describe("authApi", () => { ... })` block in `src/services/authApi.test.ts`, and update the import to include `superAdminLoginRequest`.

```ts
import { forgotPasswordRequest, resetPasswordRequest, superAdminLoginRequest } from "./authApi";
```

```ts
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
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm.cmd test -- src/services/authApi.test.ts
```

Expected: FAIL because `superAdminLoginRequest` and `SuperAdminLoginRequest` do not exist yet.

- [ ] **Step 3: Add the auth types**

In `src/types/index.ts`, add this type after `LoginRequest`:

```ts
export type SuperAdminLoginRequest = {
  username: string;
  password: string;
};
```

Update `AuthUser` to include `role` and `storeId`:

```ts
export type AuthUser = {
  id?: string;
  name?: string;
  username?: string;
  email?: string;
  subdomain?: string;
  role?: string;
  storeId?: string | null;
};
```

- [ ] **Step 4: Update auth response parsing and add the helper**

In `src/services/authApi.ts`, update the type import list:

```ts
import type {
  AuthSession,
  AuthUser,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SuperAdminLoginRequest,
  VerifyEmailRequest,
} from "../types";
```

Replace the current `findUser` implementation with this version:

```ts
const getNestedUser = (payload: Record<string, unknown>) => {
  if (isRecord(payload.user)) {
    return payload.user;
  }

  if (isRecord(payload.data) && isRecord(payload.data.user)) {
    return payload.data.user;
  }

  if (isRecord(payload.userData)) {
    return payload.userData;
  }

  return undefined;
};

const findUser = (payload: unknown, fallback: Partial<AuthUser>): AuthUser => {
  if (isRecord(payload)) {
    const nestedUser = getNestedUser(payload);

    if (isRecord(nestedUser)) {
      return {
        id: typeof nestedUser.id === "string" ? nestedUser.id : undefined,
        name: typeof nestedUser.name === "string" ? nestedUser.name : undefined,
        username: typeof nestedUser.username === "string" ? nestedUser.username : fallback.username,
        email: typeof nestedUser.email === "string" ? nestedUser.email : undefined,
        subdomain: typeof nestedUser.subdomain === "string" ? nestedUser.subdomain : fallback.subdomain,
        role: typeof nestedUser.role === "string" ? nestedUser.role : undefined,
        storeId: typeof nestedUser.storeId === "string" || nestedUser.storeId === null ? nestedUser.storeId : undefined,
      };
    }
  }

  return {
    username: fallback.username,
    subdomain: fallback.subdomain,
  };
};
```

Update `loginRequest` so it passes an `AuthUser`-shaped fallback:

```ts
export const loginRequest = async (request: LoginRequest): Promise<AuthSession> => {
  const payload = await postPublicJson("/api/auth/login", request);

  return {
    token: findToken(payload),
    user: findUser(payload, {
      username: request.username,
      subdomain: request.subdomain,
    }),
    raw: payload,
  };
};
```

Add `superAdminLoginRequest` below `loginRequest`:

```ts
export const superAdminLoginRequest = async (request: SuperAdminLoginRequest): Promise<AuthSession> => {
  const payload = await postPublicJson("/api/auth/super-admin/login", request);

  return {
    token: findToken(payload),
    user: findUser(payload, {
      username: request.username,
    }),
    raw: payload,
  };
};
```

- [ ] **Step 5: Run the focused service test to verify it passes**

Run:

```powershell
npm.cmd test -- src/services/authApi.test.ts
```

Expected: PASS for the existing auth API tests and the new super-admin tests.

- [ ] **Step 6: Commit Task 1**

Run:

```powershell
git add src/types/index.ts src/services/authApi.ts src/services/authApi.test.ts
git commit -m "Add super admin auth API"
```

Expected: commit succeeds with only the type, auth service, and auth service test changes.

---

### Task 2: AuthStore Super-Admin Login Method

**Files:**
- Modify: `src/store/AuthStore.tsx`

- [ ] **Step 1: Update AuthStore imports and value type**

In `src/store/AuthStore.tsx`, replace the auth API import with:

```ts
import { loginRequest, registerRequest, superAdminLoginRequest } from "../services/authApi";
```

Replace the type import with:

```ts
import type { AuthSession, LoginRequest, RegisterRequest, SuperAdminLoginRequest } from "../types";
```

Add this method to `AuthStoreValue` after `login`:

```ts
  superAdminLogin: (request: SuperAdminLoginRequest) => Promise<AuthSession>;
```

- [ ] **Step 2: Add the store method**

Add this callback after the existing `login` callback:

```ts
  const superAdminLogin = useCallback(async (request: SuperAdminLoginRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSession = await superAdminLoginRequest(request);
      setSession(nextSession);
      saveSession(nextSession);
      return nextSession;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "تعذر تسجيل دخول المشرف العام.";
      setError(message);
      throw nextError;
    } finally {
      setIsLoading(false);
    }
  }, []);
```

Add `superAdminLogin` to the provider value:

```ts
      superAdminLogin,
```

Update the `useMemo` dependency list:

```ts
    [clearError, error, isLoading, login, logout, register, session, superAdminLogin],
```

- [ ] **Step 3: Run TypeScript build to catch integration errors**

Run:

```powershell
npm.cmd run build
```

Expected: PASS. If it fails, the error should point to a missing import, missing value property, or dependency-list mismatch in `AuthStore.tsx`.

- [ ] **Step 4: Commit Task 2**

Run:

```powershell
git add src/store/AuthStore.tsx
git commit -m "Add super admin auth store login"
```

Expected: commit succeeds with only `src/store/AuthStore.tsx`.

---

### Task 3: Super-Admin Login Page

**Files:**
- Create: `src/pages/SuperAdminLoginPage.tsx`
- Create: `src/pages/SuperAdminLoginPage.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `src/pages/SuperAdminLoginPage.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthStoreProvider } from "../store/AuthStore";
import { SuperAdminLoginPage } from "./SuperAdminLoginPage";

describe("SuperAdminLoginPage", () => {
  it("renders super admin credentials without a store subdomain field", () => {
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
```

- [ ] **Step 2: Run the page test to verify it fails**

Run:

```powershell
npm.cmd test -- src/pages/SuperAdminLoginPage.test.tsx
```

Expected: FAIL because `src/pages/SuperAdminLoginPage.tsx` does not exist yet.

- [ ] **Step 3: Create the page**

Create `src/pages/SuperAdminLoginPage.tsx`:

```tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, LockKeyhole, ShieldCheck, Store, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";
import { Button } from "../components/Button";
import { useAuthStore } from "../store/AuthStore";

type SuperAdminLoginLocationState = {
  from?: Location;
};

type SuperAdminLoginForm = {
  username: string;
  password: string;
};

const emptyForm: SuperAdminLoginForm = {
  username: "",
  password: "",
};

export function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { superAdminLogin, isLoading, error, clearError } = useAuthStore();
  const state = location.state as SuperAdminLoginLocationState | null;
  const [form, setForm] = useState<SuperAdminLoginForm>(emptyForm);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const redirectTo = useMemo(() => {
    const from = state?.from;

    if (!from || from.pathname === "/login" || from.pathname === "/register" || from.pathname === "/super-admin-login") {
      return "/cashier";
    }

    return `${from.pathname}${from.search}${from.hash}`;
  }, [state?.from]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextForm = {
      username: form.username.trim(),
      password: form.password,
    };

    if (!nextForm.username || !nextForm.password) {
      setLocalError("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }

    setLocalError(null);

    try {
      await superAdminLogin(nextForm);
      navigate(redirectTo, { replace: true });
    } catch {
      // The store exposes the API error for display.
    }
  };

  const message = localError ?? error;

  return (
    <main className="min-h-dvh bg-[#f7f8f6] px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_28rem]">
        <section className="order-2 hidden min-h-[32rem] overflow-hidden rounded-2xl bg-zinc-950 text-white shadow-panel lg:order-1 lg:block">
          <div className="flex h-full flex-col justify-between p-8">
            <div>
              <p className="text-sm font-normal text-emerald-400">إدارة النظام</p>
              <h1 className="sidebar-brand mt-4 text-5xl leading-tight mb-2">صافي كاشير</h1>
            </div>

            <div className="max-w-md">
              <p className="text-2xl font-medium leading-relaxed text-zinc-300">
                دخول منفصل للمشرف العام لإدارة النظام خارج نطاق المتاجر.
              </p>
            </div>

            <div className="flex items-center gap-3 text-sm text-zinc-300">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10">
                <ShieldCheck className="h-6 w-6 text-emerald-400" strokeWidth={1.5} />
              </span>
              <span>صلاحيات مركزية بدون نطاق فرعي</span>
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-light text-emerald-600">إدارة النظام</p>
            <h1 className="sidebar-brand mt-2 text-3xl text-zinc-950">صافي كاشير</h1>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-panel sm:p-7">
            <div className="mb-6">
              <h2 className="text-2xl font-medium text-zinc-950">دخول المشرف العام</h2>
              <p className="mt-2 text-sm font-normal leading-6 text-zinc-500">
                أدخل بيانات المشرف العام للمتابعة بدون اسم متجر.
              </p>
            </div>

            {message ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            ) : null}

            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-900">اسم المستخدم</span>
                <span className="relative block">
                  <UserRound className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    value={form.username}
                    onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                    placeholder="superadmin"
                    autoComplete="username"
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-900">كلمة المرور</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

              <Button
                type="submit"
                fullWidth
                disabled={isLoading}
                icon={<ShieldCheck className="h-5 w-5" />}
                className="mt-2"
              >
                {isLoading ? "جار تسجيل دخول المشرف..." : "دخول المشرف العام"}
              </Button>
            </form>

            <p className="mt-5 flex items-center justify-center gap-2 text-center text-sm font-normal text-zinc-500">
              <Store className="h-4 w-4" />
              <span>تريد دخول متجر؟</span>
              <Link className="font-medium text-brand-700 transition hover:text-brand-600" to="/login">
                تسجيل دخول المتجر
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run the page test to verify it passes**

Run:

```powershell
npm.cmd test -- src/pages/SuperAdminLoginPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add src/pages/SuperAdminLoginPage.tsx src/pages/SuperAdminLoginPage.test.tsx
git commit -m "Add super admin login page"
```

Expected: commit succeeds with the new page and test.

---

### Task 4: Route Registration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the page**

In `src/App.tsx`, add:

```ts
import { SuperAdminLoginPage } from "./pages/SuperAdminLoginPage";
```

- [ ] **Step 2: Register the public route**

Add this route inside `<Routes>`, near the other public auth routes:

```tsx
            <Route
              path="/super-admin-login"
              element={
                <PublicAuthRoute>
                  <SuperAdminLoginPage />
                </PublicAuthRoute>
              }
            />
```

- [ ] **Step 3: Run route-adjacent tests and build**

Run:

```powershell
npm.cmd test -- src/pages/SuperAdminLoginPage.test.tsx src/services/authApi.test.ts
npm.cmd run build
```

Expected: both commands PASS.

- [ ] **Step 4: Commit Task 4**

Run:

```powershell
git add src/App.tsx
git commit -m "Register super admin login route"
```

Expected: commit succeeds with only `src/App.tsx`.

---

### Task 5: Final Verification

**Files:**
- Verify: `src/types/index.ts`
- Verify: `src/services/authApi.ts`
- Verify: `src/services/authApi.test.ts`
- Verify: `src/store/AuthStore.tsx`
- Verify: `src/pages/SuperAdminLoginPage.tsx`
- Verify: `src/pages/SuperAdminLoginPage.test.tsx`
- Verify: `src/App.tsx`

- [ ] **Step 1: Run all tests**

Run:

```powershell
npm.cmd test
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run production build**

Run:

```powershell
npm.cmd run build
```

Expected: TypeScript and Vite build exit 0.

- [ ] **Step 3: Review the diff from the plan base**

Run:

```powershell
git diff --stat HEAD~4..HEAD
git diff -- src/pages/LoginPage.tsx
```

Expected:

- The recent implementation commits contain only super-admin login files and route wiring.
- `src/pages/LoginPage.tsx` still contains only the pre-existing unrelated working-tree edits, with no super-admin feature changes.

- [ ] **Step 4: Report completion**

Report:

- The new route is `/super-admin-login`.
- The API endpoint used is `/api/auth/super-admin/login`.
- The request body contains only `username` and `password`.
- Tests and build status.
