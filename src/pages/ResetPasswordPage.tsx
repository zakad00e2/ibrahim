import { useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, KeyRound, LockKeyhole } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { toUserFacingMessage } from "../services/apiClient";
import { resetPasswordRequest } from "../services/authApi";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "رابط إعادة التعيين غير صالح أو ناقص.");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setError("رابط إعادة التعيين غير صالح أو ناقص.");
      setSuccessMessage(null);
      return;
    }

    if (!password || !confirmPassword) {
      setError("أدخل كلمة المرور الجديدة وتأكيدها.");
      setSuccessMessage(null);
      return;
    }

    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون ٦ أحرف على الأقل.");
      setSuccessMessage(null);
      return;
    }

    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      setSuccessMessage(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await resetPasswordRequest({ token, newPassword: password });
      setSuccessMessage("تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.");
      setPassword("");
      setConfirmPassword("");
    } catch (nextError) {
      const message = toUserFacingMessage(nextError, "تعذر تغيير كلمة المرور. حاول مرة أخرى.");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-[#f7f8f6] px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_28rem]">
        <section className="order-2 hidden min-h-[32rem] overflow-hidden rounded-2xl bg-zinc-950 text-white shadow-panel lg:order-1 lg:block">
          <div className="flex h-full flex-col justify-between p-8">
            <div>
              <p className="text-sm font-medium text-brand-100">استعادة الوصول</p>
              <h1 className="sidebar-brand mt-4 text-5xl leading-tight">صافي كاشير</h1>
            </div>

            <div className="max-w-md">
              <p className="text-2xl font-medium leading-relaxed">
                اختر كلمة مرور جديدة لحسابك، ثم ارجع إلى تسجيل الدخول لإكمال العمل.
              </p>
              <div className="mt-8 flex items-center gap-3 text-sm text-zinc-300">
                <span className="h-px flex-1 bg-white/20" />
                <span>رابط آمن ومحدود الصلاحية</span>
                <span className="h-px flex-1 bg-white/20" />
              </div>
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-medium text-brand-700">استعادة الوصول</p>
            <h1 className="sidebar-brand mt-2 text-3xl text-zinc-950">صافي كاشير</h1>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-panel sm:p-7">
            <div className="mb-6">
              <h2 className="text-2xl font-medium text-zinc-950">إعادة تعيين كلمة المرور</h2>
              <p className="mt-2 text-sm font-normal leading-6 text-zinc-500">
                أدخل كلمة مرور جديدة لحسابك. الرابط صالح لمدة محدودة.
              </p>
            </div>

            {successMessage ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            ) : null}

            {error ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-900">كلمة المرور الجديدة</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={!token || Boolean(successMessage)}
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-900">تأكيد كلمة المرور</span>
                <span className="relative block">
                  <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={!token || Boolean(successMessage)}
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-left text-sm font-medium outline-none transition disabled:cursor-not-allowed disabled:opacity-60 focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
                  />
                </span>
              </label>

              <Button
                type="submit"
                fullWidth
                disabled={!token || isLoading || Boolean(successMessage)}
                icon={<KeyRound className="h-5 w-5" />}
                className="mt-2"
              >
                {isLoading ? "جار تغيير كلمة المرور..." : "تغيير كلمة المرور"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm font-normal text-zinc-500">
              تذكرت كلمة المرور؟{" "}
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
