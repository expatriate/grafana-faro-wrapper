export function isSvgSource(src: string): boolean {
  return /\.svg([?#]|$)/i.test(src) || src.startsWith('data:image/svg');
}
