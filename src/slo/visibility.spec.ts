/** @jest-environment jsdom */
import { SloRun, STEP_CHECK_INTERVAL_MS } from './SloRun.ts';
import { pauseWhileHidden } from './visibility.ts';

function setTabHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  setTabHidden(false);
});

test('time spent in a hidden tab does not count towards the duration', async () => {
  let rendered = false;
  const onFinish = jest.fn();
  const run = new SloRun<'render'>({ failTime: 1000, onFinish, steps: { render: () => rendered } });
  run.start();
  pauseWhileHidden(run);

  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);
  setTabHidden(true);
  await jest.advanceTimersByTimeAsync(5000);
  setTabHidden(false);
  rendered = true;
  await jest.advanceTimersByTimeAsync(STEP_CHECK_INTERVAL_MS);

  expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ duration: 200 }));
});

test('switching windows pauses through blur and focus', () => {
  const run = { pause: jest.fn(), resume: jest.fn() };
  pauseWhileHidden(run);

  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));

  expect(run.pause).toHaveBeenCalledTimes(1);
  expect(run.resume).toHaveBeenCalledTimes(1);
});

test('unsubscribing stops reacting to visibility', () => {
  const run = { pause: jest.fn(), resume: jest.fn() };
  const unsubscribe = pauseWhileHidden(run);

  unsubscribe();
  setTabHidden(true);
  window.dispatchEvent(new Event('blur'));

  expect(run.pause).not.toHaveBeenCalled();
});
