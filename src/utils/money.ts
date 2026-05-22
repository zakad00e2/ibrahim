import Decimal from "decimal.js";

export type MoneyInput = string | number | null | undefined;

const toDecimal = (value: MoneyInput, fallback = 0): Decimal => {
  if (value === undefined || value === null || value === "") {
    return new Decimal(fallback);
  }

  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal.toDecimalPlaces(12) : new Decimal(fallback);
  } catch {
    return new Decimal(fallback);
  }
};

export const toMoneyNumber = (value: MoneyInput, fallback = 0): number =>
  toDecimal(value, fallback).toNumber();

export const addMoney = (...values: MoneyInput[]): number =>
  values.reduce((sum, value) => sum.plus(toDecimal(value)), new Decimal(0)).toNumber();

export const subtractMoney = (left: MoneyInput, right: MoneyInput): number =>
  toDecimal(left).minus(toDecimal(right)).toNumber();

export const multiplyMoney = (left: MoneyInput, right: MoneyInput): number =>
  toDecimal(left).times(toDecimal(right)).toNumber();

export const sumMoney = (values: MoneyInput[]): number => addMoney(...values);

export const compareMoney = (left: MoneyInput, right: MoneyInput): -1 | 0 | 1 => {
  const comparison = toDecimal(left).cmp(toDecimal(right));
  return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
};

export const minMoney = (left: MoneyInput, right: MoneyInput): number =>
  Decimal.min(toDecimal(left), toDecimal(right)).toNumber();

export const maxMoney = (left: MoneyInput, right: MoneyInput): number =>
  Decimal.max(toDecimal(left), toDecimal(right)).toNumber();
