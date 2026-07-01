import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type AnimatedDigitsProps = {
  value: string | number;
  className?: string;
};

const digitPattern = /[0-9\u0660-\u0669\u06f0-\u06f9]/;
const ltrNumberPattern = /[^\d.-]/g;

const normalizeNumberText = (value: string) =>
  value
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, ".")
    .replace(/\u066c/g, "")
    .replace(/,/g, "");

const getNumericValue = (value: string) => {
  const normalized = normalizeNumberText(value).replace(ltrNumberPattern, "");

  if (!normalized || normalized === "." || normalized === "-" || normalized === "-.") {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
};

const getTrend = (previous: number | null, current: number | null) => {
  if (previous === null || current === null || previous === current) {
    return 0;
  }

  return current > previous ? 1 : -1;
};

export function AnimatedDigits({ value, className }: AnimatedDigitsProps) {
  const text = String(value);
  const currentNumber = useMemo(() => getNumericValue(text), [text]);
  const previousNumberRef = useRef<number | null>(currentNumber);
  const previousTextRef = useRef(text);
  const shouldReduceMotion = useReducedMotion();
  const trend = getTrend(previousNumberRef.current, currentNumber);
  const hasChanged = previousTextRef.current !== text;

  useEffect(() => {
    previousNumberRef.current = currentNumber;
    previousTextRef.current = text;
  }, [currentNumber, text]);

  return (
    <span className={["t-digit-group", className].filter(Boolean).join(" ")} aria-label={text}>
      {Array.from(text).map((character, index) => {
        const isDigit = digitPattern.test(character);
        const direction = trend === 0 ? 1 : trend;

        if (!isDigit) {
          return (
            <span key={`slot-${index}`} className="t-digit-static" aria-hidden="true">
              {character}
            </span>
          );
        }

        return (
          <span key={`slot-${index}`} className="t-digit-slot" aria-hidden="true">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={`${character}-${index}`}
                className="t-digit"
                initial={
                  shouldReduceMotion || !hasChanged
                    ? false
                    : { y: `${direction * 100}%`, opacity: 0, filter: "blur(2px)" }
                }
                animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { y: `${direction * -100}%`, opacity: 0, filter: "blur(2px)" }
                }
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.75 }}
              >
                {character}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}
