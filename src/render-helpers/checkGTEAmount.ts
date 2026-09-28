import { countMatches, parseAmount } from './getAmount';

export function checkGTEAmount(selector: string, amount: number | string): boolean {
  const minimum = parseAmount(amount);
  const count = countMatches(selector);
  return minimum !== null && count !== null && count >= minimum;
}
