interface Pausable {
  pause(): void;
  resume(): void;
}

export function pauseWhenHidden(run: Pausable): () => void {
  let focusCheck: ReturnType<typeof setTimeout> | undefined;
  const pause = () => run.pause();
  const resumeIfVisible = () => {
    if (!document.hidden) {
      run.resume();
    }
  };
  const syncWithVisibility = () => (document.hidden ? pause() : resumeIfVisible());
  const pauseIfFocusLeftPage = () => {
    clearTimeout(focusCheck);
    // Focus moving into a nested iframe blurs the window before hasFocus() reports it
    focusCheck = setTimeout(() => {
      if (!document.hasFocus()) {
        pause();
      }
    });
  };

  const windowListeners = [
    ['pagehide', pause],
    ['blur', pauseIfFocusLeftPage],
    ['pageshow', resumeIfVisible],
    ['focus', resumeIfVisible],
  ] as const;

  windowListeners.forEach(([event, listener]) => window.addEventListener(event, listener));
  document.addEventListener('visibilitychange', syncWithVisibility);
  if (document.hidden) {
    pause();
  }

  return () => {
    clearTimeout(focusCheck);
    windowListeners.forEach(([event, listener]) => window.removeEventListener(event, listener));
    document.removeEventListener('visibilitychange', syncWithVisibility);
  };
}
