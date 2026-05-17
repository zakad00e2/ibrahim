# Forgot Password Form on Login

## Context

The app already has a public login page at `src/pages/LoginPage.tsx` and public auth requests in `src/services/authApi.ts`.

The backend exposes `POST /api/auth/forgot-password` with this request body:

```json
{
  "email": "admin@ibrahim-market.com"
}
```

On success, the backend returns:

```json
{
  "message": "If this email exists, a reset link has been sent."
}
```

## Goal

Add a "نسيت كلمة المرور؟" action to the login card. Clicking it replaces the login form with a small email form for requesting a password reset link. No separate route is needed.

## User Experience

The login card keeps its existing visual structure and Arabic copy style.

In login mode:

- Show the existing store, username, and password fields.
- Add a "نسيت كلمة المرور؟" text button/link near the password area or below the login button.
- Keep the existing "إنشاء حساب جديد" link.

In forgot-password mode:

- Replace the login form with one email field.
- Show a submit button labeled "إرسال رابط الاستعادة".
- Show a secondary action labeled "العودة إلى تسجيل الدخول".
- On success, show a neutral/success message: "إذا كان البريد موجودا، تم إرسال رابط الاستعادة."
- On validation failure, show: "أدخل البريد الإلكتروني."
- On API failure, show the normalized API error when available, otherwise a generic Arabic error.

## Architecture

Add a `forgotPasswordRequest` function in `src/services/authApi.ts`.

The function will call:

```ts
postPublicJson("/api/auth/forgot-password", { email })
```

Add a local view mode and state in `LoginPage.tsx`:

- `authMode`: `"login" | "forgot-password"`
- `forgotEmail`
- `forgotPasswordLoading`
- `forgotPasswordMessage`
- `forgotPasswordError`

The forgot-password flow stays local to `LoginPage.tsx`; it does not affect `AuthStore` because it does not create or modify an auth session.

## Data Flow

1. User clicks "نسيت كلمة المرور؟".
2. Page switches to forgot-password mode.
3. User enters email and submits.
4. `LoginPage` trims the email and validates it is not empty.
5. `forgotPasswordRequest` sends `{ email }` to `/api/auth/forgot-password`.
6. On success, `LoginPage` displays the success message.
7. User can return to login mode without losing the existing login form state.

## Error Handling

- Empty email is handled client-side.
- Network or backend errors are shown in the same alert style used by the login form.
- The backend's non-enumerating success message is preserved; the UI must not reveal whether an email exists.

## Testing

Add or update tests around the public auth service if the existing test setup supports service tests cleanly:

- `forgotPasswordRequest` posts to `/api/auth/forgot-password`.
- It sends only the trimmed email supplied by the page-level handler.
- It throws a normalized error when the response is not OK.

Run the existing test and build commands before completion.

## Out of Scope

- No `/forgot-password` route.
- No reset password page.
- No handling of reset tokens in the frontend.
- No change to backend behavior.
