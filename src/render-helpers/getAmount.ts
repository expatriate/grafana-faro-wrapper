import { queryAllIfValid } from '../utils/safeQuery';

export function countMatches(selector: string): number | null {
  return queryAllIfValid(selector)?.length ?? null;
}

export function getAmount(selector: string): number {
  return countMatches(selector) ?? 0;
}

export function parseAmount(amount: number | string): number | null {
  const parsed = typeof amount === 'string' && amount.trim() !== '' ? Number(amount) : amount;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}
