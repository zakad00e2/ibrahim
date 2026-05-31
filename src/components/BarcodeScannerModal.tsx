import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";
import { BrowserCodeReader, BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { Button } from "./Button";

type BarcodeScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onDetect: (code: string) => void;
  keepOpen?: boolean;
};

type ScannerStatus = "idle" | "starting" | "active" | "error";

export function BarcodeScannerModal({ open, onClose, onDetect, keepOpen = false }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastCodeRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const start = async () => {
      setStatus("starting");
      setErrorMessage("");

      try {
        const videoInputDevices = await BrowserCodeReader.listVideoInputDevices();

        if (videoInputDevices.length === 0) {
          if (!cancelled) {
            setErrorMessage("لا توجد كاميرا متاحة على هذا الجهاز");
            setStatus("error");
          }
          return;
        }

        const backCamera =
          videoInputDevices.find((d: MediaDeviceInfo) => /back|rear|environment/i.test(d.label)) ??
          videoInputDevices[0];

        if (!videoRef.current || cancelled) return;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(backCamera.deviceId, videoRef.current, (result, err) => {
          if (cancelled) return;

          if (result) {
            const code = result.getText();

            if (keepOpen) {
              if (code === lastCodeRef.current) return;
              lastCodeRef.current = code;
              onDetect(code);

              if (debounceRef.current) clearTimeout(debounceRef.current);
              debounceRef.current = setTimeout(() => {
                lastCodeRef.current = "";
              }, 1200);
            } else {
              onDetect(code);
              onClose();
            }
          }

          if (err && !(err instanceof NotFoundException)) {
            console.error("ZXing scan error:", err);
          }
        });

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setStatus("active");
      } catch (err: unknown) {
        if (cancelled) return;

        const message = err instanceof Error ? err.message : String(err);

        if (/permission|denied|not allowed/i.test(message)) {
          setErrorMessage("تم رفض إذن الكاميرا. يرجى السماح بالوصول إليها من إعدادات المتصفح.");
        } else if (/not found|no device/i.test(message)) {
          setErrorMessage("لا توجد كاميرا متاحة على هذا الجهاز");
        } else if (/insecure|https/i.test(message)) {
          setErrorMessage("الكاميرا تتطلب اتصالاً آمناً (HTTPS)");
        } else {
          setErrorMessage("تعذّر تشغيل الكاميرا. تأكد من دعم المتصفح لهذه الميزة.");
        }

        setStatus("error");
      }
    };

    void start();

    return () => {
      cancelled = true;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      lastCodeRef.current = "";

      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {
          // ignore cleanup errors
        }
        controlsRef.current = null;
      }

      setStatus("idle");
      setErrorMessage("");
    };
  }, [open, keepOpen, onDetect, onClose]);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="مسح الباركود بالكاميرا"
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950"
    >
      <header className="flex shrink-0 items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-white" />
          <h2 className="text-base font-semibold text-white">مسح الباركود</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="إغلاق"
          className="text-white hover:bg-zinc-800"
        >
          <X className="h-5 w-5" />
        </Button>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          muted
          playsInline
        />

        {status === "active" && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-44 w-72">
                <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-lg border-l-2 border-t-2 border-white" />
                <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-lg border-r-2 border-t-2 border-white" />
                <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-2 border-l-2 border-white" />
                <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-lg border-b-2 border-r-2 border-white" />
                <span className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-brand-400 opacity-80" />
              </div>
            </div>
            <p className="absolute bottom-6 left-0 right-0 text-center text-sm font-normal text-white/70">
              وجّه الكاميرا نحو الباركود
            </p>
          </>
        )}

        {status === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/80">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <p className="text-sm font-normal text-white">جار تشغيل الكاميرا...</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center">
            <Camera className="h-12 w-12 text-zinc-500" />
            <p className="text-sm font-normal leading-relaxed text-red-400">{errorMessage}</p>
            <Button variant="secondary" size="sm" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
