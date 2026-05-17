const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

const STORAGE_KEY = "ibrahim-market-auth-session";

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  statusCode?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const translateApiMessage = (message: string): string => {
  const normalized = message.trim().replace(/\s+/g, " ").replace(/[.!؟]+$/, "").toLowerCase();

  if (normalized === "a product with this barcode already exists in your store") {
    return "يوجد منتج بهذا الباركود بالفعل في متجرك";
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

const handleResponse = async (response: Response, fallback: string): Promise<unknown> => {
  const payload = await readJson(response);

  if (!response.ok) {
    const err = new Error(normalizeMessage(payload, fallback)) as Error & { unauthorized?: boolean };

    if (response.status === 401) {
      err.unauthorized = true;
    }

    throw err;
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
