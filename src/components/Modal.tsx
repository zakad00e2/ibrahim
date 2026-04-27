import type { ReactNode } from "react";
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

export function Modal({ open, title, children, footer, onClose, size = "md" }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-2 sm:p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[94dvh] w-full ${sizeClasses[size]} overflow-hidden rounded-lg bg-white shadow-panel sm:rounded-xl`}
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-lg font-bold text-zinc-950">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق">
            <X className="h-5 w-5" />
          </Button>
        </header>
        <div className="max-h-[calc(94dvh-8rem)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">{children}</div>
        {footer ? <footer className="border-t border-zinc-100 px-4 py-3 sm:px-5 sm:py-4">{footer}</footer> : null}
      </section>
    </div>
  );
}
