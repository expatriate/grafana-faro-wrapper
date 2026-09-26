import { getAmount } from './getAmount';

export function checkGTEAmount(selector: string, amount: number): boolean {
  const minimum = Number(amount);
  return Number.isFinite(minimum) && getAmount(selector) >= minimum;
}
