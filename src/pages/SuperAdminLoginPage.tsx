import { GrainGradient } from "@paper-design/shaders-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";
import { Button } from "../components/Button";
import { useAuthStore } from "../store/AuthStore";

type SuperAdminLoginLocationState = {
  from?: Location;
};

export type SuperAdminLoginForm = {
  username: string;
  password: string;
};

const emptyFieldsError = "أدخل اسم المستخدم وكلمة المرور.";
const errorId = "super-admin-login-error";

const emptyForm: SuperAdminLoginForm = {
  username: "",
  password: "",
};

export function getSuperAdminLoginRequest(form: SuperAdminLoginForm) {
  const request = {
    username: form.username.trim(),
    password: form.password,
  };

  return {
    request,
    error: request.username && request.password ? null : emptyFieldsError,
  };
}

export function getSuperAdminLoginRedirectTo(from?: Location) {
  if (
    !from ||
    from.pathname === "/login" ||
    from.pathname === "/register" ||
    from.pathname === "/super-admin-login"
  ) {
    return "/super-admin";
  }

  return `${from.pathname}${from.search}${from.hash}`;
}

export function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { superAdminLogin, isLoading, error, clearError } = useAuthStore();
  const state = location.state as SuperAdminLoginLocationState | null;
  const [form, setForm] = useState<SuperAdminLoginForm>(emptyForm);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const redirectTo = useMemo(() => {
    return getSuperAdminLoginRedirectTo(state?.from);
  }, [state?.from]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { request, error: validationError } = getSuperAdminLoginRequest(form);

    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);

    try {
      await superAdminLogin(request);
      navigate(redirectTo, { replace: true });
    } catch {
      // The store exposes the API error for display.
    }
  };

  const message = localError ?? error;

  return (
    <main className="min-h-dvh bg-[#f7f8f6] px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-5xl items-center gap-0 lg:grid-cols-2">
        <section
          className="order-2 relative hidden min-h-[34rem] overflow-hidden rounded-2xl bg-emerald-950 text-white shadow-panel lg:order-1 lg:block lg:rounded-l-none lg:rounded-r-2xl"
        >
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
            <GrainGradient
              width={1280}
              height={720}
              colors={["#ff4d0069", "#14ff47", "#000000ab"]}
              colorBack="#04160a"
              softness={1}
              intensity={0.18}
              noise={0}
              shape="wave"
              speed={0.6}
              scale={1.28}
              rotation={176}
              offsetY={0.08}
            />
          </div>
          <div className="absolute inset-0 bg-black/20" aria-hidden="true" />
          <div className="relative z-10 flex min-h-[34rem] items-end justify-start p-8">
            <div className="flex w-full max-w-lg flex-col items-start text-right" dir="rtl">
              <h1 className="mb-2 text-3xl font-medium leading-tight">صافي كاشير</h1>
              <p className="text-base font-normal leading-7">
                دخول منفصل للمشرف العام لإدارة النظام ومتابعة المتاجر من مساحة آمنة ومركزة.
              </p>
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="mb-8 lg:hidden">
            <h1 className="text-3xl font-medium text-zinc-950">صافي كاشير</h1>
          </div>

          <div className="flex flex-col justify-center rounded-2xl border border-zinc-200 bg-white px-6 py-5 shadow-panel sm:px-10 sm:py-7 lg:min-h-[34rem] lg:rounded-l-2xl lg:rounded-r-none lg:border-r-0 lg:px-14">
            <div className="mb-6 text-center" style={{ fontFeatureSettings: '"ss01", "cv11"' }}>
              <h2 className="text-2xl font-medium text-zinc-950">دخول المشرف العام</h2>
              <p className="mt-1 text-sm font-normal leading-6 text-zinc-500">
                استخدم بيانات المشرف العام للوصول إلى لوحة التحكم.
              </p>
            </div>

            {message ? (
              <div
                id={errorId}
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            ) : null}

            <form className="grid gap-3" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-900">اسم المستخدم</span>
                <span className="relative block">
                  <UserRound className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    value={form.username}
                    onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                    placeholder="username"
                    autoComplete="username"
                    aria-invalid={message ? true : undefined}
                    aria-describedby={message ? errorId : undefined}
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-zinc-900">كلمة المرور</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    aria-invalid={message ? true : undefined}
                    aria-describedby={message ? errorId : undefined}
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

              <Button
                type="submit"
                variant="dark"
                fullWidth
                disabled={isLoading}
                icon={<ShieldCheck className="h-5 w-5" />}
                iconPosition="end"
                className="mt-2"
              >
                {isLoading ? "جار تسجيل الدخول..." : "دخول المشرف العام"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm font-normal text-zinc-500">
              تريد الدخول إلى متجر؟{" "}
              <Link className="font-medium text-brand-700 transition hover:text-brand-600" to="/login">
                تسجيل دخول المتجر
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
