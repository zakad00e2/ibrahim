import { getJson } from "./apiClient";
import type { StoreInfo } from "../types";

export const DEFAULT_STORE_NAME = "صافي كاشير";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getOptionalString = (dto: Record<string, unknown>, key: string): string | undefined => {
  const value = dto[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const mapStoreInfo = (payload: unknown): StoreInfo => {
  const dto = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;

  if (!isRecord(dto)) {
    return { name: DEFAULT_STORE_NAME };
  }

  return {
    id: getOptionalString(dto, "id"),
    name: getOptionalString(dto, "name") ?? DEFAULT_STORE_NAME,
    subdomain: getOptionalString(dto, "subdomain"),
    plan: getOptionalString(dto, "plan"),
    status: getOptionalString(dto, "status"),
    createdAt: getOptionalString(dto, "createdAt"),
    updatedAt: getOptionalString(dto, "updatedAt"),
  };
};

export const getStoreInfo = async (): Promise<StoreInfo> => {
  const payload = await getJson("/api/store");

  return mapStoreInfo(payload);
};
