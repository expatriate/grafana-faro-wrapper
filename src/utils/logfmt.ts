const BARE_LOGFMT_VALUE = /^[^\s"=\\\x00-\x1f\x7f]+$/;
const CHARACTERS_TO_ESCAPE = /[\\"\x00-\x1f\x7f]/g;
const NAMED_ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  '"': '\\"',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

const escapeCharacter = (char: string) =>
  NAMED_ESCAPES[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;

function formatLogfmtValue(value: unknown): string {
  const text = String(value);
  return BARE_LOGFMT_VALUE.test(text)
    ? text
    : `"${text.replace(CHARACTERS_TO_ESCAPE, escapeCharacter)}"`;
}

const formatLogfmtKey = (key: string) => key.replace(/[^\w.-]/g, '_') || '_';

export function toLogfmt(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${formatLogfmtKey(key)}=${formatLogfmtValue(value)}`)
    .join(' ');
}
