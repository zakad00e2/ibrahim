const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

const STORAGE_KEY = "ibrahim-market-auth-session";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  code?: string;
  target?: string | string[];
};

export type ApiClientError = Error & {
  statusCode?: number;
  unauthorized?: boolean;
  code?: string;
  target?: string | string[];
  body?: unknown;
  retryAfterSeconds?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const translateApiMessage = (message: string): string => {
  const normalized = message.trim().replace(/\s+/g, " ").replace(/[.!؟]+$/, "").toLowerCase();

  if (normalized === "a product with this barcode already exists in your store") {
    return "يوجد منتج بهذا الباركود بالفعل في متجرك";
  }

  if (normalized === "invalid credentials") {
    return "اسم المستخدم أو كلمة المرور غير صحيحة.";
  }

  return message;
};

export const normalizeMessage = (payload: unknown, fallback: string): string => {
  if (!isRecord(payload)) {
    return fallback;
  }

  const p = payload as ApiErrorPayload;

  if (Array.isArray(p.message)) {
    return p.message.map(translateApiMessage).join("، ");
  }

  if (typeof p.message === "string" && p.message.trim()) {
    return translateApiMessage(p.message);
  }

  if (typeof p.error === "string" && p.error.trim()) {
    return translateApiMessage(p.error);
  }

  return fallback;
};

export const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const getToken = (): string | undefined => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return undefined;
    }

    const parsed = JSON.parse(stored) as { token?: string };

    return typeof parsed?.token === "string" && parsed.token ? parsed.token : undefined;
  } catch {
    return undefined;
  }
};

const buildHeaders = (extra?: Record<string, string>): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };

  const token = getToken();

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

const getRetryAfterSeconds = (response: Response): number | undefined => {
  const raw = response.headers.get("retry-after");
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const buildThrottledMessage = (retryAfterSeconds?: number): string =>
  `تجاوزت عدد المحاولات. حاول بعد ${retryAfterSeconds ?? 60} ثانية.`;

export const buildApiError = (
  response: Response,
  payload: unknown,
  fallback: string,
): ApiClientError => {
  const retryAfterSeconds = response.status === 429 ? getRetryAfterSeconds(response) : undefined;
  const message = response.status === 429
    ? buildThrottledMessage(retryAfterSeconds)
    : normalizeMessage(payload, fallback);
  const err = new Error(message) as ApiClientError;

  err.statusCode = response.status;
  err.body = payload;

  if (retryAfterSeconds !== undefined) {
    err.retryAfterSeconds = retryAfterSeconds;
  }

  if (response.status === 401) {
    err.unauthorized = true;
  }

  if (isRecord(payload)) {
    const code = payload.code;
    const target = payload.target;

    if (typeof code === "string") {
      err.code = code;
    }

    if (typeof target === "string" || Array.isArray(target)) {
      err.target = target as string | string[];
    }
  }

  return err;
};

const handleResponse = async (response: Response, fallback: string): Promise<unknown> => {
  const payload = await readJson(response);

  if (!response.ok) {
    throw buildApiError(response, payload, fallback);
  }

  return payload;
};

export const getJson = async (path: string): Promise<unknown> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: buildHeaders(),
  });

  return handleResponse(response, "تعذر جلب البيانات من الخادم.");
};

export const postJson = async <TBody extends object>(path: string, body: TBody): Promise<unknown> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  return handleResponse(response, "تعذر إرسال البيانات إلى الخادم.");
};

export const patchJson = async <TBody extends object>(path: string, body: TBody): Promise<unknown> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });

  return handleResponse(response, "تعذر تحديث البيانات.");
};

export const deleteJson = async (path: string): Promise<unknown> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });

  return handleResponse(response, "تعذر حذف العنصر.");
};
