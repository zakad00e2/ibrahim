import { getJson, patchJson } from "./apiClient";
import type { AdminStore, AdminStoreCounts, AdminUser, AdminUserStore } from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (dto: Record<string, unknown>, key: string, fallback = ""): string => {
  const value = dto[key];

  return typeof value === "string" ? value : fallback;
};

const getBoolean = (dto: Record<string, unknown>, key: string, fallback = false): boolean => {
  const value = dto[key];

  return typeof value === "boolean" ? value : fallback;
};

const getNumber = (dto: Record<string, unknown>, key: string, fallback = 0): number => {
  const value = dto[key];
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const extractItems = (payload: unknown, key: "stores" | "users"): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const data = payload.data ?? payload.items ?? payload[key];

  return Array.isArray(data) ? data : [];
};

const mapCounts = (value: unknown): AdminStoreCounts => {
  const dto = isRecord(value) ? value : {};

  return {
    users: getNumber(dto, "users"),
    products: getNumber(dto, "products"),
    customers: getNumber(dto, "customers"),
  };
};

export const mapAdminStore = (value: unknown): AdminStore => {
  if (!isRecord(value)) {
    throw new Error("invalid admin store dto");
  }

  return {
    id: getString(value, "id"),
    name: getString(value, "name"),
    subdomain: getString(value, "subdomain"),
    plan: getString(value, "plan"),
    status: getString(value, "status", "PENDING"),
    createdAt: getString(value, "createdAt"),
    updatedAt: getString(value, "updatedAt"),
    counts: mapCounts(value._count ?? value.counts),
  };
};

const mapAdminUserStore = (value: unknown): AdminUserStore | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: getString(value, "id"),
    name: getString(value, "name"),
    subdomain: getString(value, "subdomain"),
    status: getString(value, "status", "PENDING"),
  };
};

export const mapAdminUser = (value: unknown): AdminUser => {
  if (!isRecord(value)) {
    throw new Error("invalid admin user dto");
  }

  const storeId = value.storeId;

  return {
    id: getString(value, "id"),
    username: getString(value, "username"),
    email: getString(value, "email") || undefined,
    role: getString(value, "role"),
    isActive: getBoolean(value, "isActive"),
    isEmailVerified: getBoolean(value, "isEmailVerified"),
    createdAt: getString(value, "createdAt"),
    updatedAt: getString(value, "updatedAt"),
    storeId: typeof storeId === "string" || storeId === null ? storeId : undefined,
    store: mapAdminUserStore(value.store),
  };
};

export const listAdminStores = async (): Promise<AdminStore[]> => {
  const payload = await getJson("/api/admin/stores");

  return extractItems(payload, "stores").map(mapAdminStore);
};

export const approveAdminStore = async (storeId: string): Promise<{ message: string }> => {
  const payload = await patchJson(`/api/admin/stores/${encodeURIComponent(storeId)}/approve`, {});

  if (isRecord(payload) && typeof payload.message === "string") {
    return { message: payload.message };
  }

  return { message: "تمت الموافقة على المتجر بنجاح." };
};

export const suspendAdminStore = async (storeId: string): Promise<{ message: string }> => {
  const payload = await patchJson(`/api/admin/stores/${encodeURIComponent(storeId)}/suspend`, {});

  if (isRecord(payload) && typeof payload.message === "string") {
    return { message: payload.message };
  }

  return { message: "تم تعليق المتجر وسيتم طرد المستخدمين المسجلين." };
};

export const reactivateAdminStore = async (storeId: string): Promise<{ message: string }> => {
  const payload = await patchJson(`/api/admin/stores/${encodeURIComponent(storeId)}/reactivate`, {});

  if (isRecord(payload) && typeof payload.message === "string") {
    return { message: payload.message };
  }

  return { message: "تمت إعادة تفعيل المتجر." };
};

export const listAdminUsers = async (storeId?: string): Promise<AdminUser[]> => {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  const payload = await getJson(`/api/admin/users${query}`);

  return extractItems(payload, "users").map(mapAdminUser);
};
