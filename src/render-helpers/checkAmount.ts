import { getAmount } from './getAmount.ts';

export function checkAmount(selector: string, amount: number): boolean {
  return getAmount(selector) === amount;
}
