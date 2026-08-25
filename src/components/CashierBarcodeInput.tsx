import { Camera } from "lucide-react";
import { forwardRef, memo, useCallback, useState, type KeyboardEvent } from "react";
import { normalizeDigits } from "../utils/formatCurrency";

type CashierBarcodeInputProps = {
  onSubmit: (barcode: string) => void;
  onEmptySubmit: () => void;
  onOpenScanner: () => void;
};

export const CashierBarcodeInput = memo(forwardRef<HTMLInputElement, CashierBarcodeInputProps>(
  function CashierBarcodeInput({ onSubmit, onEmptySubmit, onOpenScanner }, ref) {
    const [barcode, setBarcode] = useState("");

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;

      event.preventDefault();
      const normalized = normalizeDigits(barcode).trim();

      if (!normalized) {
        onEmptySubmit();
        return;
      }

      onSubmit(normalized);
      setBarcode("");
    }, [barcode, onEmptySubmit, onSubmit]);

    return (
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={ref}
            id="barcode"
            value={barcode}
            onChange={(event) => setBarcode(normalizeDigits(event.target.value))}
            onKeyDown={handleKeyDown}
            className="h-12 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-base font-bold outline-none transition focus:border-zinc-500 focus:bg-white sm:h-14 sm:px-4 sm:text-xl"
          />
          {barcode ? null : (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base font-normal leading-none text-zinc-400 sm:right-4 sm:text-xl">
              اكتب أو امسح الباركود
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenScanner}
          aria-label="مسح بالكاميرا"
          className="sm:hidden flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-zinc-600 transition hover:bg-zinc-100 active:bg-zinc-200"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>
    );
  },
));
