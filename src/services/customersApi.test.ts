import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteCustomer } from "./customersApi";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("customersApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a customer-specific message when the delete endpoint returns a raw internal error", async () => {
    mockFetch(
      new Response(JSON.stringify({ message: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(deleteCustomer("customer-1")).rejects.toThrow(
      "تعذر حذف العميل من الخادم لأن لديه سجلات مرتبطة. إذا كان الرصيد المتبقي صفرًا، فالمشكلة من سجلات فواتير أو ديون قديمة وليست من الدين الحالي.",
    );
  });

  it("sends the delete request to the selected customer endpoint", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }));

    await expect(deleteCustomer("customer 1")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith("/api/customers/customer%201", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  });
});
