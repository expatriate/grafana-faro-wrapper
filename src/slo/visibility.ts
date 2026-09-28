interface Pausable {
  pause(): void;
  resume(): void;
}

type PauseReason = 'hidden' | 'blurred';

export function pauseWhenHidden(run: Pausable): () => void {
  const reasons = new Set<PauseReason>();
  let focusCheck: ReturnType<typeof setTimeout> | undefined;

  const setReason = (reason: PauseReason, applies: boolean) => {
    if (applies) {
      reasons.add(reason);
    } else {
      reasons.delete(reason);
    }
    if (reasons.size > 0) {
      run.pause();
    } else {
      run.resume();
    }
  };
  const syncWithVisibility = () => setReason('hidden', document.hidden);
  const pauseIfFocusLeftPage = () => {
    clearTimeout(focusCheck);
    // Focus moving into a nested iframe blurs the window before hasFocus() reports it
    focusCheck = setTimeout(() => {
      if (!document.hasFocus()) {
        setReason('blurred', true);
      }
    });
  };

  const windowListeners = [
    ['pagehide', () => setReason('hidden', true)],
    ['pageshow', syncWithVisibility],
    ['blur', pauseIfFocusLeftPage],
    ['focus', () => setReason('blurred', false)],
  ] as const;

  windowListeners.forEach(([event, listener]) => window.addEventListener(event, listener));
  document.addEventListener('visibilitychange', syncWithVisibility);
  if (document.hidden) {
    setReason('hidden', true);
  }

  return () => {
    clearTimeout(focusCheck);
    windowListeners.forEach(([event, listener]) => window.removeEventListener(event, listener));
    document.removeEventListener('visibilitychange', syncWithVisibility);
  };
}
