// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthStoreProvider, normalizeStoredSession, useAuthStore } from "./AuthStore";

const offlineDbMocks = vi.hoisted(() => ({
  clearOfflineData: vi.fn(),
}));

vi.mock("../services/offlineDb", () => offlineDbMocks);

type AuthSnapshot = ReturnType<typeof useAuthStore>;

const Probe = ({ onStore }: { onStore: (store: AuthSnapshot) => void }) => {
  onStore(useAuthStore());
  return null;
};

describe("AuthStore storage", () => {
  const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

  afterEach(async () => {
    for (const { root, container } of mountedRoots.splice(0)) {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }

    window.localStorage.clear();
    vi.clearAllMocks();
  });

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

  it("clears auth and offline cached data on logout", async () => {
    window.localStorage.setItem("ibrahim-market-auth-session", JSON.stringify({
      token: "session-token",
      user: {
        role: "ADMIN",
        storeId: "store-1",
      },
    }));
    offlineDbMocks.clearOfflineData.mockResolvedValue(undefined);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ container, root });
    let currentStore: AuthSnapshot | null = null;

    await act(async () => {
      root.render(
        <AuthStoreProvider>
          <Probe onStore={(store) => {
            currentStore = store;
          }} />
        </AuthStoreProvider>,
      );
    });

    await act(async () => {
      currentStore?.logout();
    });

    expect(window.localStorage.getItem("ibrahim-market-auth-session")).toBeNull();
    expect(offlineDbMocks.clearOfflineData).toHaveBeenCalledTimes(1);
  });
});
