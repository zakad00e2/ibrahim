import { describe, expect, it } from "vitest";
import { getAuthenticatedHomePath, normalizeLeadingSlashPathname } from "./App";

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
        raw: null,
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
        raw: null,
      }),
    ).toBe("/cashier");
  });
});
