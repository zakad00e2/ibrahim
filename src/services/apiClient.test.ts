import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson } from "./apiClient";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("apiClient errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes retry metadata and a readable message for 429 responses", async () => {
    mockFetch(
      new Response(JSON.stringify({ statusCode: 429, message: "ThrottlerException: Too Many Requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "45",
        },
      }),
    );

    await expect(getJson("/api/customers")).rejects.toMatchObject({
      message: "تجاوزت عدد المحاولات. حاول بعد 45 ثانية.",
      statusCode: 429,
      retryAfterSeconds: 45,
      body: {
        statusCode: 429,
        message: "ThrottlerException: Too Many Requests",
      },
    });
  });

  it("exposes Prisma error metadata from unified database errors", async () => {
    mockFetch(
      new Response(JSON.stringify({
        statusCode: 409,
        error: "Conflict",
        message: "سجل مكرر: القيمة موجودة مسبقاً (email)",
        code: "P2002",
        target: "email",
      }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getJson("/api/customers")).rejects.toMatchObject({
      message: "سجل مكرر: القيمة موجودة مسبقاً (email)",
      statusCode: 409,
      code: "P2002",
      target: "email",
      body: {
        code: "P2002",
        target: "email",
      },
    });
  });
});
