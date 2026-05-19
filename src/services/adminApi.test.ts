import { afterEach, describe, expect, it, vi } from "vitest";
import { approveAdminStore, listAdminStores, listAdminUsers } from "./adminApi";

const mockFetch = (response: Response) => {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("adminApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads all stores with counts mapped from the admin endpoint", async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify([
          {
            id: "70d02f0b-ed34-4149-84f8-4ea212fca07d",
            name: "زكريا ماركت",
            subdomain: "store-hetd1",
            plan: "FREE",
            status: "PENDING",
            createdAt: "2026-05-18T08:10:08.774Z",
            updatedAt: "2026-05-18T08:10:08.774Z",
            _count: {
              users: 1,
              products: 0,
              customers: 0,
            },
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(listAdminStores()).resolves.toEqual([
      {
        id: "70d02f0b-ed34-4149-84f8-4ea212fca07d",
        name: "زكريا ماركت",
        subdomain: "store-hetd1",
        plan: "FREE",
        status: "PENDING",
        createdAt: "2026-05-18T08:10:08.774Z",
        updatedAt: "2026-05-18T08:10:08.774Z",
        counts: {
          users: 1,
          products: 0,
          customers: 0,
        },
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/stores", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("approves a pending store by id", async () => {
    const fetchMock = mockFetch(
      new Response(JSON.stringify({ message: "Store approved." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(approveAdminStore("70d02f0b-ed34-4149-84f8-4ea212fca07d")).resolves.toEqual({
      message: "Store approved.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/stores/70d02f0b-ed34-4149-84f8-4ea212fca07d/approve",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
  });

  it("loads users for a selected store", async () => {
    const fetchMock = mockFetch(
      new Response(
        JSON.stringify([
          {
            id: "db2a8f5e-bdcf-4809-8686-c7df2093d2eb",
            username: "zekaa15",
            email: "z409483831@gmail.com",
            role: "ADMIN",
            isActive: true,
            isEmailVerified: true,
            createdAt: "2026-05-18T08:10:08.922Z",
            updatedAt: "2026-05-18T08:10:25.869Z",
            storeId: "70d02f0b-ed34-4149-84f8-4ea212fca07d",
            store: {
              id: "70d02f0b-ed34-4149-84f8-4ea212fca07d",
              name: "زكريا ماركت",
              subdomain: "store-hetd1",
              status: "APPROVED",
            },
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(listAdminUsers("70d02f0b-ed34-4149-84f8-4ea212fca07d")).resolves.toEqual([
      {
        id: "db2a8f5e-bdcf-4809-8686-c7df2093d2eb",
        username: "zekaa15",
        email: "z409483831@gmail.com",
        role: "ADMIN",
        isActive: true,
        isEmailVerified: true,
        createdAt: "2026-05-18T08:10:08.922Z",
        updatedAt: "2026-05-18T08:10:25.869Z",
        storeId: "70d02f0b-ed34-4149-84f8-4ea212fca07d",
        store: {
          id: "70d02f0b-ed34-4149-84f8-4ea212fca07d",
          name: "زكريا ماركت",
          subdomain: "store-hetd1",
          status: "APPROVED",
        },
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users?storeId=70d02f0b-ed34-4149-84f8-4ea212fca07d",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );
  });
});
