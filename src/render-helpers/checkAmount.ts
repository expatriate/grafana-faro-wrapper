import { getAmount } from './getAmount';

export function checkAmount(selector: string, amount: number): boolean {
  const expected = Number(amount);
  return Number.isFinite(expected) && getAmount(selector) === expected;
}
