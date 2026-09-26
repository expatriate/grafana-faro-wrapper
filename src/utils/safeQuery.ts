import { LOG_PREFIX } from './logPrefix';

const reportedSelectors = new Set<string>();

function safely<T>(selector: string, notFound: T, select: () => T): T {
  try {
    return select();
  } catch (error) {
    if (!reportedSelectors.has(selector)) {
      reportedSelectors.add(selector);
      console.warn(`${LOG_PREFIX} Invalid selector "${selector}" never matches:`, error);
    }
    return notFound;
  }
}

export function queryOne<E extends Element = Element>(selector: string): E | null {
  return safely(selector, null, () => document.querySelector<E>(selector));
}

export function queryAll<E extends Element = Element>(selector: string): E[] {
  return safely(selector, [], () => Array.from(document.querySelectorAll<E>(selector)));
}
