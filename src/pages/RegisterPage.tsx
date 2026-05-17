import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, LockKeyhole, Mail, Store, UserPlus, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { useAuthStore } from "../store/AuthStore";

type RegisterForm = {
  name: string;
  username: string;
  email: string;
  password: string;
};

const emptyForm: RegisterForm = {
  name: "",
  username: "",
  email: "",
  password: "",
};

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuthStore();
  const [form, setForm] = useState<RegisterForm>(emptyForm);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextForm = {
      name: form.name.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
    };

    if (!nextForm.name || !nextForm.username || !nextForm.email || !nextForm.password) {
      setLocalError("أكمل كل بيانات الحساب قبل المتابعة.");
      return;
    }

    if (nextForm.password.length < 6) {
      setLocalError("كلمة المرور يجب أن تكون ٦ أحرف على الأقل.");
      return;
    }

    setLocalError(null);

    try {
      await register(nextForm);
      navigate("/verify-email", {
        replace: true,
        state: {
          email: nextForm.email,
          username: nextForm.username,
        },
      });
    } catch {
      // The store exposes the API error for display.
    }
  };

  const message = localError ?? error;

  return (
    <main className="min-h-dvh bg-[#f7f8f6] px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_30rem]">
        <section className="order-2 hidden min-h-[36rem] overflow-hidden rounded-2xl bg-zinc-950 text-white shadow-panel lg:order-1 lg:block">
          <div className="flex h-full flex-col justify-between p-8">
            <div>
              <p className="text-sm font-light text-emerald-400">حساب جديد</p>
              <h1 className="sidebar-brand mt-4 text-5xl leading-tight mb-2">صافي كاشير</h1>
            </div>

            <div className="max-w-md">
              <p className="text-2xl font-medium leading-relaxed text-zinc-300">
                أنشئ حساب المتجر ثم استخدم بيانات الدخول للوصول إلى النظام.
              </p>
              <div className="mt-8 flex items-center gap-3 text-sm text-zinc-300">
                <span className="h-px flex-1 bg-white/20" />
                <span>بيع أسرع وتنظيم أوضح</span>
                <span className="h-px flex-1 bg-white/20" />
              </div>
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-light text-emerald-600">حساب جديد</p>
            <h1 className="sidebar-brand mt-2 text-3xl text-zinc-950">صافي كاشير</h1>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-panel sm:p-7">
            <div className="mb-6">
              <h2 className="text-2xl font-medium text-zinc-950">إنشاء حساب</h2>
              <p className="mt-2 text-sm font-normal leading-6 text-zinc-500">
                بعد إنشاء الحساب ستنتقل إلى صفحة تسجيل الدخول.
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
                <span className="mb-2 block text-sm font-medium text-zinc-900">اسم المتجر أو المسؤول</span>
                <span className="relative block">
                  <Store className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="اسم الحساب"
                    autoComplete="name"
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pr-10 pl-3 text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

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
                <span className="mb-2 block text-sm font-medium text-zinc-900">البريد الإلكتروني</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="name@example.com"
                    autoComplete="email"
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
                    autoComplete="new-password"
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

              <Button
                type="submit"
                fullWidth
                disabled={isLoading}
                icon={<UserPlus className="h-5 w-5" />}
                className="mt-2"
              >
                {isLoading ? "جار إنشاء الحساب..." : "إنشاء الحساب"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm font-normal text-zinc-500">
              لديك حساب بالفعل؟{" "}
              <Link className="font-medium text-brand-700 transition hover:text-brand-600" to="/login">
                تسجيل الدخول
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
