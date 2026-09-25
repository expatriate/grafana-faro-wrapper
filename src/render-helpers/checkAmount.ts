import { getAmount } from './getAmount';

export function checkAmount(selector: string, amount: number): boolean {
  return getAmount(selector) === amount;
}
