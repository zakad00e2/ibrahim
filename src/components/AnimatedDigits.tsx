import type { CSSProperties } from "react";

type AnimatedDigitsProps = {
  value: string | number;
  className?: string;
};

const digitPattern = /[0-9٠-٩۰-۹]/;

export function AnimatedDigits({ value, className }: AnimatedDigitsProps) {
  const text = String(value);
  let digitIndex = 0;

  return (
    <span
      key={text}
      className={["t-digit-group is-animating", className].filter(Boolean).join(" ")}
      aria-label={text}
    >
      {Array.from(text).map((character, index) => {
        if (!digitPattern.test(character)) {
          return (
            <span key={`${character}-${index}`} className="t-digit-static" aria-hidden="true">
              {character}
            </span>
          );
        }

        const currentDigitIndex = digitIndex;
        digitIndex += 1;

        return (
          <span
            key={`${character}-${index}`}
            className="t-digit"
            aria-hidden="true"
            style={{ "--digit-index": currentDigitIndex } as CSSProperties}
          >
            {character}
          </span>
        );
      })}
    </span>
  );
}
