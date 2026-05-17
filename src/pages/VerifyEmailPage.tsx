import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { verifyEmailRequest } from "../services/authApi";

type VerifyLocationState = {
  email?: string;
  username?: string;
};

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as VerifyLocationState | null;
  const email = state?.email ?? "";
  const username = state?.username ?? "";

  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      navigate("/register", { replace: true });
    }
  }, [email, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedCode = code.trim();

    if (!trimmedCode || !/^\d{6}$/.test(trimmedCode)) {
      setError("رمز التحقق يجب أن يكون ٦ أرقام.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await verifyEmailRequest({ email, otp: trimmedCode });
      navigate("/login", {
        replace: true,
        state: {
          registered: true,
          username,
        },
      });
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "تعذر التحقق من الرمز. حاول مرة أخرى.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!email) {
    return null;
  }

  return (
    <main className="min-h-dvh bg-[#f7f8f6] px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_28rem]">
        <section className="order-2 hidden min-h-[32rem] overflow-hidden rounded-2xl bg-zinc-950 text-white shadow-panel lg:order-1 lg:block">
          <div className="flex h-full flex-col justify-between p-8">
            <div>
              <p className="text-sm font-medium text-brand-100">تأكيد البريد الإلكتروني</p>
              <h1 className="sidebar-brand mt-4 text-5xl leading-tight">صافي كاشير</h1>
            </div>

            <div className="max-w-md">
              <p className="text-2xl font-medium leading-relaxed">
                أرسلنا رمز تحقق إلى بريدك الإلكتروني. أدخله لتفعيل حسابك.
              </p>
              <div className="mt-8 flex items-center gap-3 text-sm text-zinc-300">
                <span className="h-px flex-1 bg-white/20" />
                <span>حساب آمن وموثّق</span>
                <span className="h-px flex-1 bg-white/20" />
              </div>
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-medium text-brand-700">تأكيد البريد الإلكتروني</p>
            <h1 className="sidebar-brand mt-2 text-3xl text-zinc-950">صافي كاشير</h1>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-panel sm:p-7">
            <div className="mb-6">
              <h2 className="text-2xl font-medium text-zinc-950">تحقق من بريدك</h2>
              <p className="mt-2 text-sm font-normal leading-6 text-zinc-500">
                أرسلنا رمز التحقق إلى{" "}
                <span dir="ltr" className="font-medium text-zinc-700">
                  {email}
                </span>
              </p>
            </div>

            {error ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-zinc-900">رمز التحقق</span>
                <span className="relative block">
                  <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    dir="ltr"
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    maxLength={6}
                    className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2 pl-3 pr-10 text-center text-lg font-medium tracking-widest outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-100"
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
                {isLoading ? "جار التحقق..." : "تأكيد الحساب"}
              </Button>
            </form>

            <div className="mt-5 flex items-center justify-center gap-2 text-sm font-normal text-zinc-500">
              <MailCheck className="h-4 w-4 text-zinc-400" />
              <span>تحقق من صندوق الوارد أو مجلد الرسائل غير المرغوبة.</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
