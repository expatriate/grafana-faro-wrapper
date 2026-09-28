import { countMatches, parseAmount } from './getAmount';

export function checkAmount(selector: string, amount: number | string): boolean {
  const expected = parseAmount(amount);
  const count = countMatches(selector);
  return expected !== null && count !== null && count === expected;
}
