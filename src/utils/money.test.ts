import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  maxMoney,
  minMoney,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  toMoneyNumber,
} from "./money";

describe("money utilities", () => {
  it("parses backend money strings into finite numbers", () => {
    expect(toMoneyNumber("60")).toBe(60);
    expect(toMoneyNumber("60.25")).toBe(60.25);
    expect(toMoneyNumber("", 7)).toBe(7);
    expect(toMoneyNumber(null, 7)).toBe(7);
    expect(toMoneyNumber("not money", 7)).toBe(7);
  });

  it("performs decimal-safe arithmetic before returning numbers", () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(subtractMoney("1.00", "0.9")).toBe(0.1);
    expect(multiplyMoney("0.1", 3)).toBe(0.3);
    expect(sumMoney(["0.1", "0.2", 0.3])).toBe(0.6);
  });

  it("compares and clamps mixed string and number values", () => {
    expect(compareMoney("50.00", 50)).toBe(0);
    expect(compareMoney("50.01", 50)).toBe(1);
    expect(compareMoney("49.99", 50)).toBe(-1);
    expect(minMoney("40.50", 50)).toBe(40.5);
    expect(maxMoney("40.50", 50)).toBe(50);
  });
});
