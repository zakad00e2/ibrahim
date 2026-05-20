import { describe, expect, it, vi } from "vitest";
import { clearDeprecatedApiResponseCaches } from "./browserCache";

describe("browserCache", () => {
  it("deletes the deprecated runtime API cache", async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);

    await clearDeprecatedApiResponseCaches({ delete: deleteCache });

    expect(deleteCache).toHaveBeenCalledWith("cashier-api-cache");
  });

  it("does nothing when CacheStorage is unavailable", async () => {
    await expect(clearDeprecatedApiResponseCaches()).resolves.toBeUndefined();
  });
});
