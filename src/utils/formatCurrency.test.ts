import { describe, expect, it } from "vitest";
import { formatDate, formatPrintAmount, formatSignedBalance } from "./formatCurrency";

describe("formatDate", () => {
  it("returns a fallback label for missing or invalid dates", () => {
    expect(formatDate("")).toBe("\u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631");
    expect(formatDate("not-a-date")).toBe("\u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631");
  });
});

describe("formatSignedBalance", () => {
  it("formats debt as negative and credit as positive", () => {
    expect(formatSignedBalance(-80)).toBe("₪ ٨٠ -");
    expect(formatSignedBalance(40)).toBe("₪ ٤٠ +");
    expect(formatSignedBalance(0)).not.toContain("+");
    expect(formatSignedBalance(0)).not.toContain("-");
  });
});

describe("formatPrintAmount", () => {
  it("formats receipt amounts without a currency symbol", () => {
    const amount = formatPrintAmount(1234.5);

    expect(amount).not.toContain("\u20AA");
    expect(amount).toContain("\u0661");
    expect(amount).toContain("\u0662");
    expect(amount).toContain("\u0663");
  });
});
