export function waitForElement(selector: string, onFound: () => void): () => void {
  if (document.querySelector(selector)) {
    onFound();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    if (!document.querySelector(selector)) {
      return;
    }
    observer.disconnect();
    onFound();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
