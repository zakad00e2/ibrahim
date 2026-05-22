import { afterEach, describe, expect, it, vi } from "vitest";
import { getDailyProfit } from "./reportsApi";

describe("reportsApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps daily profit money strings into normalized numbers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        date: "2026-05-22",
        totalRevenue: "0.30000000000000004",
        totalCost: "0.10000000000000002",
        netProfit: "0.19999999999999998",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(getDailyProfit("2026-05-22")).resolves.toEqual({
      date: "2026-05-22",
      totalRevenue: 0.3,
      totalCost: 0.1,
      netProfit: 0.2,
    });
  });
});
