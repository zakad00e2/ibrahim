# Super Admin Login Page

## Context

The app currently has a public store login page at `src/pages/LoginPage.tsx`.
That page sends store users to `POST /api/auth/login` and requires:

```json
{
  "subdomain": "store-subdomain",
  "username": "username",
  "password": "password"
}
```

The backend also exposes a separate super-admin login endpoint:

```http
POST /api/auth/super-admin/login
```

Its request body must contain only:

```json
{
  "username": "superadmin",
  "password": "SuperAdmin@123"
}
```

On success, the backend returns a JWT token and a `userData` object with role
`SUPER_ADMIN` and `storeId: null`.

## Goal

Add a separate public route for super-admin login at `/super-admin-login`.
The route must let the super admin sign in with username and password only,
without entering a store subdomain.

## User Experience

The existing `/login` store-login page remains the normal entry point for store
users and keeps its current store subdomain, username, and password flow.

The new `/super-admin-login` page has its own focused card:

- Username field.
- Password field.
- Submit button for super-admin login.
- No store subdomain field.
- A secondary link back to `/login` for store users.

The existing `/login` page may include a small secondary link to
`/super-admin-login`, but the normal store-login form should not change its
validation or request body.

On successful super-admin login, the app stores the auth session through the
same `AuthStore` mechanism used by store login, then navigates to the current
protected default route, `/cashier`.

The project does not currently have a dedicated super-admin dashboard route.
Routing the super admin to `/cashier` is a temporary integration point. A future
dashboard can later redirect `SUPER_ADMIN` users to `/super-admin` without
changing the login API contract.

## Architecture

Add a public auth API helper in `src/services/authApi.ts`:

```ts
superAdminLoginRequest(request: SuperAdminLoginRequest): Promise<AuthSession>
```

The helper sends:

```ts
postPublicJson("/api/auth/super-admin/login", request)
```

where `request` contains only `username` and `password`.

Extend auth types in `src/types/index.ts`:

- Add `SuperAdminLoginRequest`.
- Allow `AuthUser` to carry `role` and `storeId`.

Extend the response parsing in `authApi.ts` so `findUser` can read either:

- `user`
- `data.user`
- `userData`

This keeps compatibility with the existing store-login response shapes while
supporting the documented super-admin response.

Extend `AuthStore` with:

```ts
superAdminLogin: (request: SuperAdminLoginRequest) => Promise<AuthSession>
```

The method follows the same loading, error, session-save, and throw behavior as
the existing `login` method.

Create `src/pages/SuperAdminLoginPage.tsx`. The page owns only its local form
state and calls `superAdminLogin` from `AuthStore`.

Register `/super-admin-login` in `src/App.tsx` inside `PublicAuthRoute`, just
like `/login` and `/register`.

## Data Flow

1. User opens `/super-admin-login`.
2. User enters username and password.
3. The page trims the username and validates both fields are present.
4. `AuthStore.superAdminLogin` calls `superAdminLoginRequest`.
5. `superAdminLoginRequest` posts to `/api/auth/super-admin/login`.
6. The auth service extracts the token and `userData`.
7. `AuthStore` stores the resulting session in local storage.
8. The page navigates to the original protected destination when available,
   otherwise to `/cashier`.

## Error Handling

- Empty username or password is handled on the page before calling the API.
- API errors use the existing `normalizeMessage` behavior where possible.
- A `401` response shows the backend message if provided, otherwise the generic
  auth failure message.
- The page must not ask for or send `subdomain`.

## Testing

Add or update tests for:

- `superAdminLoginRequest` posts to `/api/auth/super-admin/login`.
- The request body contains only `username` and `password`.
- The returned session includes the token and `userData` fields mapped to
  `AuthUser`, including `role` and `storeId`.
- `SuperAdminLoginPage` renders username and password fields, and does not
  render the store subdomain field.

Run these checks before completion:

```powershell
npm.cmd test
npm.cmd run build
```

## Out of Scope

- No dedicated super-admin dashboard.
- No role-based navigation beyond the current protected route handoff.
- No backend changes.
- No changes to the store-login request body.
