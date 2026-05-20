import { describe, expect, it } from "vitest";
import { validateDebtPaymentAmount } from "./calculations";

describe("validateDebtPaymentAmount", () => {
  it("rejects payments above the selected debt remaining balance", () => {
    expect(validateDebtPaymentAmount({ remaining: 50 }, 75)).toBe("amount-exceeds-remaining");
  });

  it("allows positive payments up to the selected debt remaining balance", () => {
    expect(validateDebtPaymentAmount({ remaining: 50 }, 50)).toBeNull();
    expect(validateDebtPaymentAmount({ remaining: 50 }, 25)).toBeNull();
  });
});
