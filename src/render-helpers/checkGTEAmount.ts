import { getAmount } from './getAmount.ts';

export function checkGTEAmount(selector: string, amount: number): boolean {
  return getAmount(selector) >= amount;
}
