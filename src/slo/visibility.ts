interface Pausable {
  pause(): void;
  resume(): void;
}

const HIDING_EVENTS = ['pagehide', 'blur'] as const;
const SHOWING_EVENTS = ['pageshow', 'focus'] as const;

export function pauseWhileHidden(run: Pausable): () => void {
  const pause = () => run.pause();
  const resume = () => run.resume();
  const onVisibilityChange = () => (document.hidden ? pause() : resume());

  HIDING_EVENTS.forEach((event) => window.addEventListener(event, pause));
  SHOWING_EVENTS.forEach((event) => window.addEventListener(event, resume));
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (document.hidden) {
    pause();
  }

  return () => {
    HIDING_EVENTS.forEach((event) => window.removeEventListener(event, pause));
    SHOWING_EVENTS.forEach((event) => window.removeEventListener(event, resume));
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
