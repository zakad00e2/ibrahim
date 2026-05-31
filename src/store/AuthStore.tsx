import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loginRequest, registerRequest, superAdminLoginRequest } from "../services/authApi";
import { toUserFacingMessage } from "../services/apiClient";
import { clearOfflineData } from "../services/offlineDb";
import type { AuthSession, AuthUser, LoginRequest, RegisterRequest, SuperAdminLoginRequest } from "../types";

type AuthStoreValue = {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
  login: (request: LoginRequest) => Promise<AuthSession>;
  superAdminLogin: (request: SuperAdminLoginRequest) => Promise<AuthSession>;
  register: (request: RegisterRequest) => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

const storageKey = "ibrahim-market-auth-session";

const AuthStoreContext = createContext<AuthStoreValue | null>(null);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeStoredUser = (value: unknown): AuthUser | null => {
  if (!isRecord(value)) {
    return null;
  }

  const storeId = value.storeId;

  return {
    id: typeof value.id === "string" ? value.id : undefined,
    name: typeof value.name === "string" ? value.name : undefined,
    username: typeof value.username === "string" ? value.username : undefined,
    email: typeof value.email === "string" ? value.email : undefined,
    subdomain: typeof value.subdomain === "string" ? value.subdomain : undefined,
    role: typeof value.role === "string" ? value.role : undefined,
    storeId: typeof storeId === "string" || storeId === null ? storeId : undefined,
  };
};

export const normalizeStoredSession = (value: unknown): AuthSession | null => {
  if (!isRecord(value)) {
    return null;
  }

  const token = typeof value.token === "string" ? value.token.trim() : "";
  const user = normalizeStoredUser(value.user);

  if (!token || !user) {
    return null;
  }

  return { token, user };
};

const loadStoredSession = (): AuthSession | null => {
  try {
    const stored = window.localStorage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    return normalizeStoredSession(JSON.parse(stored) as unknown);
  } catch {
    return null;
  }
};

const saveSession = (session: AuthSession) => {
  const normalized = normalizeStoredSession(session);

  if (normalized) {
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  } else {
    clearSession();
  }
};

const clearSession = () => {
  window.localStorage.removeItem(storageKey);
};

export function AuthStoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (request: LoginRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSession = await loginRequest(request);
      setSession(nextSession);
      saveSession(nextSession);
      return nextSession;
    } catch (nextError) {
      const message = toUserFacingMessage(nextError, "تعذر تسجيل الدخول.");
      setError(message);
      throw nextError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const superAdminLogin = useCallback(async (request: SuperAdminLoginRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSession = await superAdminLoginRequest(request);
      setSession(nextSession);
      saveSession(nextSession);
      return nextSession;
    } catch (nextError) {
      const message = toUserFacingMessage(nextError, "تعذر تسجيل دخول المشرف العام.");
      setError(message);
      throw nextError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (request: RegisterRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      await registerRequest(request);
    } catch (nextError) {
      const message = toUserFacingMessage(nextError, "تعذر إنشاء الحساب.");
      setError(message);
      throw nextError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setError(null);
    clearSession();
    void clearOfflineData().catch(() => undefined);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo<AuthStoreValue>(
    () => ({
      session,
      isLoading,
      error,
      login,
      superAdminLogin,
      register,
      logout,
      clearError,
    }),
    [clearError, error, isLoading, login, logout, register, session, superAdminLogin],
  );

  return <AuthStoreContext.Provider value={value}>{children}</AuthStoreContext.Provider>;
}

export const useAuthStore = () => {
  const store = useContext(AuthStoreContext);

  if (!store) {
    throw new Error("useAuthStore must be used inside AuthStoreProvider");
  }

  return store;
};
