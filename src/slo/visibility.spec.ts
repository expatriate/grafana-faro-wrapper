import { SloRun, STEP_CHECK_INTERVAL_MS } from './SloRun';
import { pauseWhenHidden } from './visibility';

function setTabHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

function setPageFocused(focused: boolean) {
  jest.spyOn(document, 'hasFocus').mockReturnValue(focused);
}

function startRun(options: { startWhen?: () => boolean } = {}) {
  let rendered = false;
  const onFinish = jest.fn();
  const run = new SloRun<'render'>({
    failTime: 10_000,
    onFinish,
    steps: { render: () => rendered },
    ...options,
  });
  pauseWhenHidden(run);
  return {
    run,
    onFinish,
    render: () => {
      rendered = true;
    },
  };
}

const fire = (event: string) => window.dispatchEvent(new Event(event));

beforeEach(() => {
  jest.useFakeTimers();
  setPageFocused(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});

test('time spent in a hidden tab does not count towards the duration', async () => {
  const { onFinish, render } = startRun();

  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);
  setTabHidden(true);
  await jest.advanceTimersByTimeAsync(5000);
  setTabHidden(false);
  render();
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);

  expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ duration: 200 }));
});

test('a run started in a background tab stays paused through pageshow and focus', async () => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  const { run, onFinish, render } = startRun();

  fire('pageshow');
  fire('focus');
  await jest.advanceTimersByTimeAsync(5000);
  expect(run.state).toBe('paused');

  setTabHidden(false);
  render();
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);

  expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ duration: 100 }));
});

test('a run waiting for its start condition in a hidden tab starts paused', async () => {
  let ready = false;
  const { run } = startRun({ startWhen: () => ready });

  setTabHidden(true);
  ready = true;
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);
  expect(run.state).toBe('paused');

  setTabHidden(false);
  expect(run.state).toBe('running');
});

test('leaving the page through bfcache pauses and coming back resumes', () => {
  const { run } = startRun();

  fire('pagehide');
  expect(run.state).toBe('paused');
  fire('pageshow');
  expect(run.state).toBe('running');
});

test('switching windows pauses through blur and resumes on focus', async () => {
  const { run } = startRun();

  setPageFocused(false);
  fire('blur');
  await jest.advanceTimersByTimeAsync(0);
  expect(run.state).toBe('paused');

  setPageFocused(true);
  fire('focus');
  expect(run.state).toBe('running');
});

test('focus moving into an iframe on the page does not pause the run', async () => {
  const { run } = startRun();

  fire('blur');
  await jest.advanceTimersByTimeAsync(0);

  expect(run.state).toBe('running');
});

test('unsubscribing stops reacting to visibility', async () => {
  const onFinish = jest.fn();
  const run = new SloRun<'render'>({ failTime: 10_000, onFinish, steps: { render: () => false } });
  const unsubscribe = pauseWhenHidden(run);

  unsubscribe();
  setTabHidden(true);
  setPageFocused(false);
  fire('blur');
  await jest.advanceTimersByTimeAsync(0);

  expect(run.state).toBe('running');
  run.dispose();
});
