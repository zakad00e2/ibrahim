# Forgot Password Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-card "نسيت كلمة المرور؟" flow to request a reset link by email from the login page.

**Architecture:** Keep the flow local to `LoginPage` with no new route and no auth-store changes. Add a small public auth API helper for `POST /api/auth/forgot-password`, then wire the login card to switch between login mode and forgot-password mode.

**Tech Stack:** React 18, React Router, TypeScript, Vite, Vitest, Tailwind CSS, existing `fetch` auth helpers.

---

## File Structure

- Modify: `src/services/authApi.ts`
  - Add `forgotPasswordRequest(email: string)` using the existing `postPublicJson` helper.
- Create: `src/services/authApi.test.ts`
  - Unit test the forgot-password public request behavior with a mocked `fetch`.
- Modify: `src/pages/LoginPage.tsx`
  - Add in-card mode switching, email input, submit handler, loading, success, and error states.

---

### Task 1: Public Auth API Helper

**Files:**
- Create: `src/services/authApi.test.ts`
- Modify: `src/services/authApi.ts`

- [ ] **Step 1: Write the failing service test**

Create `src/services/authApi.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgotPasswordRequest } from "./authApi";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("authApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
});
```

- [ ] **Step 2: Run the service test to verify it fails**

Run: `npm.cmd test -- src/services/authApi.test.ts`

Expected: FAIL because `forgotPasswordRequest` is not exported.

- [ ] **Step 3: Add the minimal API helper**

In `src/services/authApi.ts`, add:

```ts
export const forgotPasswordRequest = async (email: string) => {
  return postPublicJson("/api/auth/forgot-password", { email });
};
```

- [ ] **Step 4: Run the service test to verify it passes**

Run: `npm.cmd test -- src/services/authApi.test.ts`

Expected: PASS for both `authApi` tests.

---

### Task 2: Login Card Forgot-Password Mode

**Files:**
- Modify: `src/pages/LoginPage.tsx`

- [ ] **Step 1: Add imports and local state**

Update imports:

```ts
import { AlertCircle, Boxes, CheckCircle2, LockKeyhole, LogIn, Mail, ReceiptText, ScanBarcode, Store, UserRound } from "lucide-react";
import { forgotPasswordRequest } from "../services/authApi";
```

Add state inside `LoginPage`:

```ts
const [authMode, setAuthMode] = useState<"login" | "forgot-password">("login");
const [forgotEmail, setForgotEmail] = useState("");
const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
const [forgotPasswordMessage, setForgotPasswordMessage] = useState<string | null>(null);
const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
```

- [ ] **Step 2: Add submit and mode handlers**

Add below `handleSubmit`:

```ts
const showForgotPassword = () => {
  clearError();
  setLocalError(null);
  setForgotPasswordError(null);
  setForgotPasswordMessage(null);
  setForgotEmail("");
  setAuthMode("forgot-password");
};

const showLogin = () => {
  setForgotPasswordError(null);
  setForgotPasswordMessage(null);
  setAuthMode("login");
};

const handleForgotPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const email = forgotEmail.trim();

  if (!email) {
    setForgotPasswordError("أدخل البريد الإلكتروني.");
    setForgotPasswordMessage(null);
    return;
  }

  setForgotPasswordLoading(true);
  setForgotPasswordError(null);
  setForgotPasswordMessage(null);

  try {
    await forgotPasswordRequest(email);
    setForgotPasswordMessage("إذا كان البريد موجودا، تم إرسال رابط الاستعادة.");
  } catch (nextError) {
    const message = nextError instanceof Error ? nextError.message : "تعذر إرسال رابط الاستعادة. حاول مرة أخرى.";
    setForgotPasswordError(message);
  } finally {
    setForgotPasswordLoading(false);
  }
};
```

- [ ] **Step 3: Render login and forgot-password modes**

Keep the existing login form in `authMode === "login"`. Add a text button:

```tsx
<button
  type="button"
  onClick={showForgotPassword}
  className="justify-self-end text-sm font-medium text-brand-700 transition hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
>
  نسيت كلمة المرور؟
</button>
```

Render the forgot-password form when `authMode === "forgot-password"`:

```tsx
<form className="grid gap-4" onSubmit={handleForgotPasswordSubmit}>
  <label className="block">
    <span className="mb-2 block text-sm font-medium text-zinc-900">البريد الإلكتروني</span>
    <span className="relative block">
      <Mail className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
      <input
        dir="ltr"
        type="email"
        value={forgotEmail}
        onChange={(event) => setForgotEmail(event.target.value)}
        placeholder="admin@ibrahim-market.com"
        autoComplete="email"
        className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
      />
    </span>
  </label>

  <Button type="submit" fullWidth disabled={forgotPasswordLoading} icon={<Mail className="h-5 w-5" />} className="mt-2">
    {forgotPasswordLoading ? "جار الإرسال..." : "إرسال رابط الاستعادة"}
  </Button>

  <button
    type="button"
    onClick={showLogin}
    className="text-sm font-medium text-zinc-600 transition hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
  >
    العودة إلى تسجيل الدخول
  </button>
</form>
```

- [ ] **Step 4: Add forgot-password status messages**

Use the existing red alert style for `forgotPasswordError`. Add success display:

```tsx
{forgotPasswordMessage ? (
  <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{forgotPasswordMessage}</span>
  </div>
) : null}
```

- [ ] **Step 5: Run focused checks**

Run: `npm.cmd test -- src/services/authApi.test.ts`

Expected: PASS.

Run: `npm.cmd run build`

Expected: TypeScript and Vite build exit 0.

---

### Task 3: Final Verification

**Files:**
- Verify: `src/services/authApi.ts`
- Verify: `src/pages/LoginPage.tsx`
- Verify: `src/services/authApi.test.ts`

- [ ] **Step 1: Run all tests**

Run: `npm.cmd test`

Expected: all Vitest test files pass.

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: build exits 0.

- [ ] **Step 3: Review git diff**

Run: `git diff -- src/services/authApi.ts src/services/authApi.test.ts src/pages/LoginPage.tsx docs/superpowers/plans/2026-05-17-forgot-password-login.md`

Expected: diff only contains the forgot-password flow and its plan/test.
