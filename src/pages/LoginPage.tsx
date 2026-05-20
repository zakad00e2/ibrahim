import { GrainGradient } from "@paper-design/shaders-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LockKeyhole,
  LogIn,
  Mail,
  Store,
  UserRound,
} from "lucide-react";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";
import { Button } from "../components/Button";
import { forgotPasswordRequest } from "../services/authApi";
import { useAuthStore } from "../store/AuthStore";

type LoginLocationState = {
  from?: Location;
  registered?: boolean;
  username?: string;
};

type LoginForm = {
  subdomain: string;
  username: string;
  password: string;
};

const supportWhatsappUrl = "https://wa.me/972597986160";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, error, clearError } = useAuthStore();
  const state = location.state as LoginLocationState | null;
  const [form, setForm] = useState<LoginForm>({
    subdomain: "",
    username: state?.username ?? "",
    password: "",
  });
  const [authMode, setAuthMode] = useState<"login" | "forgot-password">("login");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState<string | null>(null);
  const [forgotPasswordError, setForgotPasswordError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    clearError();
  }, [clearError]);

  const redirectTo = useMemo(() => {
    const from = state?.from;

    if (!from || from.pathname === "/login" || from.pathname === "/register") {
      return "/cashier";
    }

    return `${from.pathname}${from.search}${from.hash}`;
  }, [state?.from]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextForm = {
      subdomain: form.subdomain.trim(),
      username: form.username.trim(),
      password: form.password,
    };

    if (!nextForm.subdomain || !nextForm.username || !nextForm.password) {
      setLocalError("أدخل اسم المتجر واسم المستخدم وكلمة المرور.");
      return;
    }

    setLocalError(null);

    try {
      await login(nextForm);
      navigate(redirectTo, { replace: true });
    } catch {
      // The store exposes the API error for display.
    }
  };

  const showForgotPassword = () => {
    clearError();
    setLocalError(null);
    setForgotPasswordError(null);
    setForgotPasswordMessage(null);
    setForgotEmail("");
    setAuthMode("forgot-password");
  };

  const showLogin = () => {
    setForgotPasswordError(null);
    setForgotPasswordMessage(null);
    setAuthMode("login");
  };

  const handleForgotPasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = forgotEmail.trim();

    if (!email) {
      setForgotPasswordError("أدخل البريد الإلكتروني.");
      setForgotPasswordMessage(null);
      return;
    }

    setForgotPasswordLoading(true);
    setForgotPasswordError(null);
    setForgotPasswordMessage(null);

    try {
      await forgotPasswordRequest(email);
      setForgotPasswordMessage("إذا كان البريد موجودا، تم إرسال رابط الاستعادة.");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "تعذر إرسال رابط الاستعادة. حاول مرة أخرى.";
      setForgotPasswordError(message);
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const loginMessage = authMode === "login" ? localError ?? error : null;
  const forgotMessage = authMode === "forgot-password" ? forgotPasswordMessage : null;
  const forgotError = authMode === "forgot-password" ? forgotPasswordError : null;

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
                دخول آمن لإدارة البيع، المنتجات، العملاء، والفواتير من مكان واحد.
              </p>
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="mb-8 lg:hidden">
            <h1 className="text-3xl font-medium text-zinc-950">صافي كاشير</h1>
          </div>

          <div className="flex flex-col justify-items-start rounded-2xl lg:rounded-r-none lg:rounded-l-2xl border border-zinc-200 lg:border-r-0 bg-white py-5 px-6 shadow-panel sm:py-7 sm:px-10 lg:px-14 lg:min-h-[34rem]">
            <div className="mb-6 text-center" style={{ fontFeatureSettings: '"ss01", "cv11"' }}>
              <h2 className="text-2xl font-medium text-zinc-950">
                {authMode === "login" ? "تسجيل الدخول" : "استعادة كلمة المرور"}
              </h2>
              <p className="mt-1 text-sm font-normal leading-6 text-zinc-500">
                {authMode === "login"
                  ? "أدخل بيانات حسابك للوصول إلى لوحة الكاشير."
                  : "أدخل بريد حسابك وسنرسل لك رابط استعادة كلمة المرور."}
              </p>
            </div>

            {authMode === "login" && state?.registered ? (
              <div
                className="mb-4 whitespace-nowrap rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"
                dir="rtl"
              >
                تم إنشاء الحساب بنجاح. لتفعيل الدخول، يرجى التواصل عبر{" "}
                <a
                  className="font-semibold underline decoration-emerald-300 underline-offset-4 transition hover:text-emerald-800"
                  href={supportWhatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  الواتساب
                </a>
                .
              </div>
            ) : null}

            {loginMessage ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{loginMessage}</span>
              </div>
            ) : null}

            {forgotMessage ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{forgotMessage}</span>
              </div>
            ) : null}

            {forgotError ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{forgotError}</span>
              </div>
            ) : null}

            {authMode === "login" ? (
              <>
                <form className="grid gap-3" onSubmit={handleSubmit}>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-zinc-900">اسم المتجر</span>
                    <span className="relative block">
                      <Store className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                      <input
                        dir="ltr"
                        value={form.subdomain}
                        onChange={(event) => setForm((current) => ({ ...current, subdomain: event.target.value }))}
                        placeholder="store-subdomain"
                        autoComplete="organization"
                        className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                      />
                    </span>
                  </label>

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
                        className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                      />
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={showForgotPassword}
                    className="justify-self-end text-sm font-normal text-zinc-900 transition hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
                  >
                    نسيت كلمة المرور؟
                  </button>

                  <Button
                    type="submit"
                    variant="dark"
                    fullWidth
                    disabled={isLoading}
                    icon={<LogIn className="h-5 w-5" />}
                    iconPosition="end"
                    className="mt-2"
                  >
                    {isLoading ? "جار تسجيل الدخول..." : "دخول"}
                  </Button>
                </form>

                <p className="mt-5 text-center text-sm font-normal text-zinc-500">
                  لا تملك حسابًا؟{" "}
                  <Link className="font-medium text-zinc-900 transition hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2" to="/register">
                    إنشاء حساب جديد
                  </Link>
                </p>
              </>
            ) : (
              <form className="grid gap-4" onSubmit={handleForgotPasswordSubmit}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-zinc-900">البريد الإلكتروني</span>
                  <span className="relative block">
                    <Mail className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                    <input
                      dir="ltr"
                      type="email"
                      value={forgotEmail}
                      onChange={(event) => setForgotEmail(event.target.value)}
                      placeholder="admin@ibrahim-market.com"
                      autoComplete="email"
                      className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                    />
                  </span>
                </label>

                <Button
                  type="submit"
                  fullWidth
                  disabled={forgotPasswordLoading}
                  icon={<Mail className="h-5 w-5" />}
                  className="mt-2"
                >
                  {forgotPasswordLoading ? "جار الإرسال..." : "إرسال رابط الاستعادة"}
                </Button>

                <button
                  type="button"
                  onClick={showLogin}
                  className="text-sm font-medium text-zinc-600 transition hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
                >
                  العودة إلى تسجيل الدخول
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
