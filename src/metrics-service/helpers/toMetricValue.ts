export function safeNumberConversion(value: unknown): number {
  const num = Number(value);
  if (isNaN(num)) {
    return 0;
  }
  return num;
}
