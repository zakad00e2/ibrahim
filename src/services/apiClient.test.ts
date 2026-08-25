import { afterEach, describe, expect, it, vi } from "vitest";
import { getJson, toUserFacingMessage } from "./apiClient";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("apiClient errors", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a throttled GET once after the Retry-After delay", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 429,
        headers: { "Retry-After": "2" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: ["ready"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = getJson("/api/customers");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toEqual({ data: ["ready"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exposes retry metadata after the single automatic retry is also throttled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2021-01-01T00:00:00Z"));
    const throttledResponse = () => new Response(
      JSON.stringify({ statusCode: 429, message: "ThrottlerException: Too Many Requests" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "45",
        },
      },
    );
    const fetchMock = vi.fn()
      .mockImplementationOnce(async () => throttledResponse())
      .mockImplementationOnce(async () => throttledResponse());
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = getJson("/api/customers");
    await vi.advanceTimersByTimeAsync(45_000);

    await expect(resultPromise).rejects.toMatchObject({
      message: "تجاوزت عدد المحاولات. حاول بعد 45 ثانية.",
      statusCode: 429,
      retryAfterSeconds: 45,
      body: {
        statusCode: 429,
        message: "ThrottlerException: Too Many Requests",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight GET between callers requesting the same path", async () => {
    let resolveResponse!: (response: Response) => void;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(responsePromise);
    vi.stubGlobal("fetch", fetchMock);

    const first = getJson("/api/products?page=1");
    const second = getJson("/api/products?page=1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(new Response(JSON.stringify({ data: ["tea"] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      { data: ["tea"] },
      { data: ["tea"] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("releases GET requests sequentially after a shared throttling cooldown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2022-01-01T00:00:00Z"));
    let resolveFirstRetry!: (response: Response) => void;
    const firstRetryResponse = new Promise<Response>((resolve) => {
      resolveFirstRetry = resolve;
    });
    const okResponse = (value: string) => new Response(JSON.stringify({ value }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 429,
        headers: { "Retry-After": "1" },
      }))
      .mockReturnValueOnce(firstRetryResponse)
      .mockResolvedValueOnce(okResponse("second"));
    vi.stubGlobal("fetch", fetchMock);

    const first = getJson("/api/reports/summary");
    await vi.advanceTimersByTimeAsync(0);
    const second = getJson("/api/products?page=2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveFirstRetry(okResponse("first"));
    await expect(first).resolves.toEqual({ value: "first" });
    await expect(second).resolves.toEqual({ value: "second" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
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

  it("translates common English error messages before showing them to users", () => {
    expect(toUserFacingMessage("Invalid email")).toBe("البريد الإلكتروني غير صالح.");
    expect(toUserFacingMessage("Internal server error")).toBe("حدث خطأ في الخادم. حاول مرة أخرى.");
    expect(toUserFacingMessage("invalid product dto")).toBe("تعذر قراءة بيانات المنتج من الخادم.");
    expect(toUserFacingMessage("Store approved successfully")).toBe("تمت الموافقة على المتجر بنجاح.");
    expect(toUserFacingMessage(new Error("Invalid or expired reset token"))).toBe(
      "رابط إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية.",
    );
    expect(toUserFacingMessage("تم حذف المنتج بنجاح")).toBe("تم حذف المنتج بنجاح");
  });
});
