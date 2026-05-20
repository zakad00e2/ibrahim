import { describe, expect, it } from "vitest";
import { normalizeStoredSession } from "./AuthStore";

describe("AuthStore storage", () => {
  it("persists only the token and normalized user fields", () => {
    const session = normalizeStoredSession({
      token: "session-token",
      user: {
        username: "superadmin",
        role: "SUPER_ADMIN",
        storeId: null,
      },
      raw: {
        token: "session-token",
        refreshToken: "refresh-token-that-should-not-persist",
      },
    });

    expect(session).toEqual({
      token: "session-token",
      user: {
        username: "superadmin",
        role: "SUPER_ADMIN",
        storeId: null,
      },
    });
    expect(session).not.toHaveProperty("raw");
  });

  it("rejects stored sessions without a bearer token", () => {
    expect(
      normalizeStoredSession({
        user: {
          role: "SUPER_ADMIN",
          storeId: null,
        },
      }),
    ).toBeNull();
  });
});
