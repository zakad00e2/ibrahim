import { describe, expect, it } from "vitest";
import { formatDate } from "./formatCurrency";

describe("formatDate", () => {
  it("returns a fallback label for missing or invalid dates", () => {
    expect(formatDate("")).toBe("غير متوفر");
    expect(formatDate("not-a-date")).toBe("غير متوفر");
  });
});
