import { describe, expect, it } from "vitest";
import { formatDate, formatPrintAmount } from "./formatCurrency";

describe("formatDate", () => {
  it("returns a fallback label for missing or invalid dates", () => {
    expect(formatDate("")).toBe("\u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631");
    expect(formatDate("not-a-date")).toBe("\u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631");
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
