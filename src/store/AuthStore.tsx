import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loginRequest, registerRequest } from "../services/authApi";
import type { AuthSession, LoginRequest, RegisterRequest } from "../types";

type AuthStoreValue = {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
  login: (request: LoginRequest) => Promise<AuthSession>;
  register: (request: RegisterRequest) => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

const storageKey = "ibrahim-market-auth-session";

const AuthStoreContext = createContext<AuthStoreValue | null>(null);

const loadStoredSession = (): AuthSession | null => {
  try {
    const stored = window.localStorage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as AuthSession;

    return parsed && typeof parsed === "object" && parsed.user ? parsed : null;
  } catch {
    return null;
  }
};

const saveSession = (session: AuthSession) => {
  window.localStorage.setItem(storageKey, JSON.stringify(session));
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
      const message = nextError instanceof Error ? nextError.message : "تعذر تسجيل الدخول.";
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
      const message = nextError instanceof Error ? nextError.message : "تعذر إنشاء الحساب.";
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
      register,
      logout,
      clearError,
    }),
    [clearError, error, isLoading, login, logout, register, session],
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
