import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";

type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
};

const sizeClasses = {
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

const modalBackdropColor = "#8c8d8c";
let openModalCount = 0;
let previousThemeColor: string | null = null;

const getThemeColorMeta = () => {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  return meta;
};

export function Modal({ open, title, children, footer, onClose, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const themeColorMeta = getThemeColorMeta();
    if (openModalCount === 0) {
      previousThemeColor = themeColorMeta.getAttribute("content");
      themeColorMeta.setAttribute("content", modalBackdropColor);
    }

    openModalCount += 1;
    document.documentElement.classList.add("modal-open");

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.documentElement.classList.remove("modal-open");
        if (previousThemeColor === null) {
          themeColorMeta.removeAttribute("content");
        } else {
          themeColorMeta.setAttribute("content", previousThemeColor);
        }
        previousThemeColor = null;
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop z-50 flex items-center justify-center bg-zinc-950/45 p-2 sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[94dvh] w-full ${sizeClasses[size]} flex-col overflow-hidden rounded-lg bg-white shadow-panel sm:rounded-xl`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-lg font-bold text-zinc-950">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق">
            <X className="h-5 w-5" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-zinc-100 px-4 py-4 sm:px-5 sm:py-5">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
