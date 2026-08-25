const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

const STORAGE_KEY = "ibrahim-market-auth-session";
const DEFAULT_RETRY_AFTER_SECONDS = 60;

const inFlightGetRequests = new Map<string, Promise<unknown>>();
let getCooldownUntil = 0;
let getRetryQueue: Promise<void> = Promise.resolve();

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

  if (normalized === "invalid email") {
    return "البريد الإلكتروني غير صالح.";
  }

  if (normalized === "internal server error") {
    return "حدث خطأ في الخادم. حاول مرة أخرى.";
  }

  if (normalized === "not found") {
    return "العنصر غير موجود.";
  }

  if (normalized === "unauthorized") {
    return "انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى.";
  }

  if (normalized === "forbidden") {
    return "لا تملك صلاحية تنفيذ هذا الإجراء.";
  }

  if (normalized === "invalid or expired reset token") {
    return "رابط إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية.";
  }

  if (normalized === "if this email exists, a reset link has been sent") {
    return "إذا كان البريد الإلكتروني مسجلاً فسيصلك رابط استعادة كلمة المرور.";
  }

  if (normalized === "store approved successfully") {
    return "تمت الموافقة على المتجر بنجاح.";
  }

  if (normalized === "store suspended successfully") {
    return "تم تعليق المتجر بنجاح.";
  }

  if (normalized === "store reactivated successfully") {
    return "تمت إعادة تفعيل المتجر.";
  }

  if (normalized === "password reset successfully") {
    return "تم تغيير كلمة المرور بنجاح.";
  }

  if (normalized === "email verified successfully") {
    return "تم تأكيد البريد الإلكتروني بنجاح.";
  }

  if (normalized.includes("too many requests") || normalized.includes("throttlerexception")) {
    return "تجاوزت عدد المحاولات. حاول بعد قليل.";
  }

  if (normalized.startsWith("invalid product")) {
    return "تعذر قراءة بيانات المنتج من الخادم.";
  }

  if (normalized.startsWith("invalid customer")) {
    return "تعذر قراءة بيانات العميل من الخادم.";
  }

  if (normalized.startsWith("invalid invoice")) {
    return "تعذر قراءة بيانات الفاتورة من الخادم.";
  }

  if (normalized.startsWith("invalid debt")) {
    return "تعذر قراءة بيانات الدين من الخادم.";
  }

  if (normalized.startsWith("invalid admin store")) {
    return "تعذر قراءة بيانات المتجر من الخادم.";
  }

  if (normalized.startsWith("invalid admin user")) {
    return "تعذر قراءة بيانات المستخدم من الخادم.";
  }

  if (normalized.endsWith("must be a finite number")) {
    return "القيمة المدخلة يجب أن تكون رقماً صحيحاً.";
  }

  return message;
};

export const toUserFacingMessage = (error: unknown, fallback = "حدث خطأ غير متوقع. حاول مرة أخرى."): string => {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

  if (!message.trim()) {
    return fallback;
  }

  return translateApiMessage(message);
};

export const normalizeMessage = (payload: unknown, fallback: string): string => {
  if (!isRecord(payload)) {
    return fallback;
  }

  const p = payload as ApiErrorPayload;

  if (Array.isArray(p.message)) {
    return p.message.map((message) => toUserFacingMessage(message, fallback)).join("، ");
  }

  if (typeof p.message === "string" && p.message.trim()) {
    return toUserFacingMessage(p.message, fallback);
  }

  if (typeof p.error === "string" && p.error.trim()) {
    return toUserFacingMessage(p.error, fallback);
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
  `تجاوزت عدد المحاولات. حاول بعد ${retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS} ثانية.`;

const waitForGetCooldown = async (): Promise<void> => {
  const delayMs = getCooldownUntil - Date.now();

  if (delayMs > 0) {
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs));
  }
};

const updateGetCooldown = (response: Response): void => {
  const retryAfterSeconds = getRetryAfterSeconds(response) ?? DEFAULT_RETRY_AFTER_SECONDS;
  getCooldownUntil = Math.max(getCooldownUntil, Date.now() + retryAfterSeconds * 1000);
};

const enqueueGetRetry = <T>(operation: () => Promise<T>): Promise<T> => {
  const scheduled = getRetryQueue.then(async () => {
    await waitForGetCooldown();
    return operation();
  });

  getRetryQueue = scheduled.then(
    () => undefined,
    () => undefined,
  );

  return scheduled;
};

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

const performGet = async (
  path: string,
  retryOnThrottle: boolean,
  queuedForCooldown = false,
): Promise<unknown> => {
  const cooldownDelayMs = getCooldownUntil - Date.now();

  if (cooldownDelayMs > 0 && !queuedForCooldown) {
    return enqueueGetRetry(() => performGet(path, retryOnThrottle, true));
  }

  if (cooldownDelayMs > 0) {
    await waitForGetCooldown();
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: buildHeaders(),
  });

  if (response.status === 429) {
    updateGetCooldown(response);

    if (retryOnThrottle) {
      await readJson(response);
      return enqueueGetRetry(() => performGet(path, false, true));
    }
  }

  return handleResponse(response, "تعذر جلب البيانات من الخادم.");
};

export const getJson = (path: string): Promise<unknown> => {
  const existingRequest = inFlightGetRequests.get(path);

  if (existingRequest) {
    return existingRequest;
  }

  const request = performGet(path, true);
  inFlightGetRequests.set(path, request);

  const clearRequest = () => {
    if (inFlightGetRequests.get(path) === request) {
      inFlightGetRequests.delete(path);
    }
  };

  request.then(clearRequest, clearRequest);
  return request;
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
