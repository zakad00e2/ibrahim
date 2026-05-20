import { describe, expect, it } from "vitest";
import {
  getAuthenticatedHomePath,
  isAuthenticatedSession,
  isSuperAdminSession,
  normalizeLeadingSlashPathname,
} from "./App";
import type { AuthSession } from "./types";

describe("App routing", () => {
  it("normalizes duplicate leading slashes before route matching redirects to login", () => {
    expect(normalizeLeadingSlashPathname("//super-admin-login")).toBe("/super-admin-login");
    expect(normalizeLeadingSlashPathname("///reports")).toBe("/reports");
  });

  it("keeps already-normal pathnames unchanged", () => {
    expect(normalizeLeadingSlashPathname("/super-admin-login")).toBe("/super-admin-login");
    expect(normalizeLeadingSlashPathname("/login")).toBe("/login");
  });

  it("routes super-admin sessions to the platform dashboard", () => {
    expect(
      getAuthenticatedHomePath({
        token: "token",
        user: {
          role: "SUPER_ADMIN",
          storeId: null,
        },
      }),
    ).toBe("/super-admin");
  });

  it("routes store sessions to cashier", () => {
    expect(
      getAuthenticatedHomePath({
        token: "token",
        user: {
          role: "ADMIN",
          storeId: "95f2dd54-c1d0-41c1-a1d3-58e93cd544b2",
        },
      }),
    ).toBe("/cashier");
  });

  it("does not authenticate role-only sessions without a bearer token", () => {
    const forgedSession: AuthSession = {
      user: {
        role: "SUPER_ADMIN",
        storeId: null,
      },
    };

    expect(isAuthenticatedSession(forgedSession)).toBe(false);
    expect(isSuperAdminSession(forgedSession)).toBe(false);
    expect(getAuthenticatedHomePath(forgedSession)).toBe("/login");
  });
});
