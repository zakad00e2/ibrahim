import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, LockKeyhole, ShieldCheck, Store, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";
import { Button } from "../components/Button";
import { useAuthStore } from "../store/AuthStore";

type SuperAdminLoginLocationState = {
  from?: Location;
};

type SuperAdminLoginForm = {
  username: string;
  password: string;
};

const emptyForm: SuperAdminLoginForm = {
  username: "",
  password: "",
};

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
    const from = state?.from;

    if (
      !from ||
      from.pathname === "/login" ||
      from.pathname === "/register" ||
      from.pathname === "/super-admin-login"
    ) {
      return "/cashier";
    }

    return `${from.pathname}${from.search}${from.hash}`;
  }, [state?.from]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextForm = {
      username: form.username.trim(),
      password: form.password,
    };

    if (!nextForm.username || !nextForm.password) {
      setLocalError("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }

    setLocalError(null);

    try {
      await superAdminLogin(nextForm);
      navigate(redirectTo, { replace: true });
    } catch {
      // The store exposes the API error for display.
    }
  };

  const message = localError ?? error;

  return (
    <main className="min-h-dvh bg-[#f7f8f6] px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_28rem]">
        <section className="order-2 hidden min-h-[34rem] overflow-hidden rounded-2xl bg-zinc-950 text-white shadow-panel lg:order-1 lg:block">
          <div className="flex h-full flex-col justify-between p-8">
            <div>
              <p className="text-sm font-normal text-emerald-400">صلاحيات المشرف العام</p>
              <h1 className="sidebar-brand mt-4 text-5xl leading-tight mb-2">صافي كاشير</h1>
            </div>

            <div className="max-w-md">
              <p className="text-2xl font-medium leading-relaxed text-zinc-300">
                دخول منفصل لإدارة النظام ومتابعة المتاجر من مساحة آمنة ومركزة.
              </p>
              <div className="mt-8 flex items-center gap-4 text-zinc-300">
                <span className="grid h-14 w-14 place-items-center rounded-xl bg-white/10">
                  <ShieldCheck className="h-8 w-8 text-emerald-400" strokeWidth={1.5} />
                </span>
                <span className="h-10 w-px bg-white/15" aria-hidden="true" />
                <span className="grid h-14 w-14 place-items-center rounded-xl bg-white/10">
                  <Store className="h-8 w-8 text-emerald-400" strokeWidth={1.5} />
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-light text-emerald-600">صلاحيات المشرف العام</p>
            <h1 className="sidebar-brand mt-2 text-3xl text-zinc-950">صافي كاشير</h1>
          </div>

          <div className="flex flex-col justify-center rounded-2xl border border-zinc-200 bg-white p-5 shadow-panel sm:p-7 lg:min-h-[34rem]">
            <div className="mb-6">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-medium text-zinc-950">دخول المشرف العام</h2>
              <p className="mt-2 text-sm font-normal leading-6 text-zinc-500">
                استخدم بيانات المشرف العام للوصول إلى لوحة التحكم.
              </p>
            </div>

            {message ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            ) : null}

            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-900">اسم المستخدم</span>
                <span className="relative block">
                  <UserRound className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    value={form.username}
                    onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                    placeholder="username"
                    autoComplete="username"
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-900">كلمة المرور</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

              <Button
                type="submit"
                fullWidth
                disabled={isLoading}
                icon={<ShieldCheck className="h-5 w-5" />}
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
