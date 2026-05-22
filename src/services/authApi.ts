import { buildApiError, postJson, readJson } from "./apiClient";
import type {
  AuthSession,
  AuthUser,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  SuperAdminLoginRequest,
  VerifyEmailRequest,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

const tokenKeys = ["token", "accessToken", "access_token", "jwt"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const postPublicJson = async <TBody extends object>(path: string, body: TBody): Promise<unknown> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload, "تعذر الاتصال بالخادم. حاول مرة أخرى.");
  }

  return payload;
};

const findToken = (payload: unknown): string | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  for (const key of tokenKeys) {
    const value = payload[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  for (const key of ["data", "result", "auth"]) {
    const nested = payload[key];
    const token = findToken(nested);

    if (token) {
      return token;
    }
  }

  return undefined;
};

const findUser = (payload: unknown, fallback: { username: string; subdomain?: string }): AuthUser => {
  if (isRecord(payload)) {
    const nestedUser = payload.user ?? (isRecord(payload.data) ? payload.data.user : undefined) ?? payload.userData;

    if (isRecord(nestedUser)) {
      return {
        id: typeof nestedUser.id === "string" ? nestedUser.id : undefined,
        name: typeof nestedUser.name === "string" ? nestedUser.name : undefined,
        username: typeof nestedUser.username === "string" ? nestedUser.username : fallback.username,
        email: typeof nestedUser.email === "string" ? nestedUser.email : undefined,
        subdomain: typeof nestedUser.subdomain === "string" ? nestedUser.subdomain : fallback.subdomain,
        role: typeof nestedUser.role === "string" ? nestedUser.role : undefined,
        storeId: typeof nestedUser.storeId === "string" || nestedUser.storeId === null ? nestedUser.storeId : undefined,
      };
    }
  }

  return {
    username: fallback.username,
    subdomain: fallback.subdomain,
  };
};

export const loginRequest = async (request: LoginRequest): Promise<AuthSession> => {
  const payload = await postPublicJson("/api/auth/login", request);

  return {
    token: findToken(payload),
    user: findUser(payload, request),
  };
};

export const superAdminLoginRequest = async (request: SuperAdminLoginRequest): Promise<AuthSession> => {
  const payload = await postPublicJson("/api/auth/super-admin/login", request);

  return {
    token: findToken(payload),
    user: findUser(payload, { username: request.username }),
  };
};

export const registerRequest = async (request: RegisterRequest) => {
  return postPublicJson("/api/auth/register", request);
};

export const forgotPasswordRequest = async (email: string) => {
  return postPublicJson("/api/auth/forgot-password", { email });
};

export const resetPasswordRequest = async (request: ResetPasswordRequest) => {
  return postPublicJson("/api/auth/reset-password", request);
};

export const verifyEmailRequest = async (request: VerifyEmailRequest) => {
  return postPublicJson("/api/auth/verify-email", request);
};

export { postJson };
