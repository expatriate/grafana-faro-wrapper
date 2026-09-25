const BARE_LOGFMT_VALUE = /^[^\s"=\\]+$/;

function formatLogfmtValue(value: unknown): string {
  const text = String(value);
  if (BARE_LOGFMT_VALUE.test(text)) {
    return text;
  }
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return `"${escaped}"`;
}

export function toLogfmt(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatLogfmtValue(value)}`)
    .join(' ');
}
