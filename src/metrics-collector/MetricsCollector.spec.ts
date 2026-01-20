/* describe('MetricsCollector', () => {
  let onSuccess: jest.Mock;
  let onFail: jest.Mock;
  let collector: MetricsCollector;

  beforeEach(() => {
    onSuccess = jest.fn();
    onFail = jest.fn();
    jest.useFakeTimers();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initialization', () => {
    test('initializes with config', () => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
      });

      const status = collector.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.isDone).toBe(false);
      expect(status.isPaused).toBe(false);
      expect(status.registeredMetrics).toEqual([]);
    });

    test('initializes with failTime', () => {
      collector = new MetricsCollector({
        steps: ['step1'],
        onSuccess,
        onFail,
        failTime: 5000,
      });

      expect(collector.getStatus().isRunning).toBe(false);
    });

    test('initializes with log enabled', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      collector = new MetricsCollector({
        steps: ['step1'],
        onSuccess,
        onFail,
        log: true,
      });

      collector.start();
      expect(consoleSpy).toHaveBeenCalledWith('[SLO-metrics:start]');

      consoleSpy.mockRestore();
    });
  });

  describe('start', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
      });
    });

    test('starts the collector', () => {
      collector.start();
      const status = collector.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.isDone).toBe(false);
      expect(status.runningTime).toBeGreaterThanOrEqual(0);
    });

    test('cannot start twice', () => {
      collector.start();
      const firstStatus = collector.getStatus();

      collector.start();
      const secondStatus = collector.getStatus();

      expect(firstStatus.isRunning).toBe(secondStatus.isRunning);
    });

    test('initializes startTime', () => {
      const beforeStart = performance.now();
      collector.start();
      const afterStart = performance.now();

      const status = collector.getStatus();
      expect(status.runningTime).toBeLessThanOrEqual(afterStart - beforeStart);
    });

    test('resets pause state on start', () => {
      collector.start();
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);
      expect(onSuccess).toHaveBeenCalled();

      onSuccess.mockClear();
      collector.reset();

      collector.start();
      const status = collector.getStatus();

      expect(status.isPaused).toBe(false);
      expect(status.pausedDuration).toBe(0);
    });
  });

  describe('addMetricStep', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2', 'step3'],
        onSuccess,
        onFail,
      });
    });

    test('adds metric step and returns collector for chaining', () => {
      const result = collector.addMetricStep('step1', () => true);
      expect(result).toBe(collector);

      const status = collector.getStatus();
      expect(status.registeredMetrics).toContain('step1');
    });

    test('starts collector when adding first metric', () => {
      collector.addMetricStep('step1', () => true);
      const status = collector.getStatus();

      expect(status.isRunning).toBe(true);
    });

    test('ignores adding metric if collector is done', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(1000);
      expect(onSuccess).toHaveBeenCalled();

      onSuccess.mockClear();
      collector.addMetricStep('step3', () => true);

      expect(onSuccess).not.toHaveBeenCalled();
    });

    test('ignores adding metric if step not in configuration', () => {
      collector.addMetricStep('step1', () => true);
      const registeredBefore = collector.getStatus().registeredMetrics.length;

      collector.addMetricStep('unknownStep' as any, () => true);
      const registeredAfter = collector.getStatus().registeredMetrics.length;

      expect(registeredBefore).toBe(registeredAfter);
    });

    test('ignores adding same metric twice', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step1', () => false);

      jest.advanceTimersByTime(100);
      expect(onSuccess).toHaveBeenCalled();
    });

    test('supports async metric functions', async () => {
      collector.addMetricStep('step1', async () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(true), 50);
        });
      });
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(150);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onSuccess).toHaveBeenCalled();
    });

    test('calls metric function with conditionFn', () => {
      const metricFn = jest.fn(() => true);
      const conditionFn = jest.fn(() => true);

      collector.addMetricStep('step1', metricFn, conditionFn);

      jest.advanceTimersByTime(100);

      expect(conditionFn).toHaveBeenCalled();
      expect(metricFn).toHaveBeenCalled();
    });

    test('does not call metric function when conditionFn returns false', () => {
      const metricFn = jest.fn(() => true);
      const conditionFn = jest.fn(() => false);

      collector.addMetricStep('step1', metricFn, conditionFn);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);

      expect(conditionFn).toHaveBeenCalled();
      expect(metricFn).not.toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });

    test('supports method chaining', () => {
      const result = collector
        .addMetricStep('step1', () => true)
        .addMetricStep('step2', () => true)
        .addMetricStep('step3', () => false);

      expect(result).toBe(collector);
      jest.advanceTimersByTime(100);

      expect(onFail).toHaveBeenCalled();
    });
  });

  describe('pause and resume', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
        failTime: 10000,
      });
    });

    test('pauses running collector', () => {
      collector.start();
      jest.advanceTimersByTime(100);

      const statusBefore = collector.getStatus();
      expect(statusBefore.isPaused).toBe(false);

      collector.pause();

      const statusAfter = collector.getStatus();
      expect(statusAfter.isPaused).toBe(true);
    });

    test('cannot pause if not running', () => {
      collector.pause();

      const status = collector.getStatus();
      expect(status.isPaused).toBe(false);
    });

    test('cannot pause if already paused', () => {
      collector.start();
      collector.pause();
      const pausedDurationBefore = collector.getStatus().pausedDuration;

      jest.advanceTimersByTime(100);
      collector.pause();

      const pausedDurationAfter = collector.getStatus().pausedDuration;
      expect(pausedDurationBefore).toBe(pausedDurationAfter);
    });

    test('cannot pause if done', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);
      expect(onSuccess).toHaveBeenCalled();

      collector.pause();
      const status = collector.getStatus();

      expect(status.isPaused).toBe(false);
    });

    test('resumes paused collector', () => {
      collector.start();
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);

      collector.pause();
      expect(collector.getStatus().isPaused).toBe(true);

      collector.resume();
      expect(collector.getStatus().isPaused).toBe(false);
    });

    test('accumulates paused duration', () => {
      collector.start();
      jest.advanceTimersByTime(100);

      collector.pause();
      const pausedDurationBefore = collector.getStatus().pausedDuration;

      jest.advanceTimersByTime(100);

      collector.resume();
      const pausedDurationAfter = collector.getStatus().pausedDuration;

      expect(pausedDurationAfter).toBeGreaterThan(pausedDurationBefore);
    });

    test('cannot resume if not running', () => {
      collector.resume();

      const status = collector.getStatus();
      expect(status.isPaused).toBe(false);
    });

    test('cannot resume if not paused', () => {
      collector.start();
      collector.resume();

      const status = collector.getStatus();
      expect(status.isPaused).toBe(false);
    });

    test('cannot resume if done', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);
      expect(onSuccess).toHaveBeenCalled();

      collector.pause();
      collector.resume();

      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    test('resumes timeout with remaining time', () => {
      collector.addMetricStep('step1', async () => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(true), 50);
        });
      });

      jest.advanceTimersByTime(100);

      collector.pause();
      jest.advanceTimersByTime(5000);

      collector.resume();
      jest.advanceTimersByTime(5000);

      expect(onFail).toHaveBeenCalled();
    });
  });

  describe('failTime', () => {
    test('calls onFail when failTime is reached', () => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
        failTime: 1000,
      });

      collector.start();
      jest.advanceTimersByTime(1000);

      expect(onFail).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: expect.any(Number),
          timestamp: expect.any(Number),
          steps: expect.any(Object),
        }),
      );
    });

    test('calls onSuccess before failTime if all steps complete', () => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
        failTime: 1000,
      });

      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);

      expect(onSuccess).toHaveBeenCalled();
      expect(onFail).not.toHaveBeenCalled();
    });

    test('remainingTime in status shows correct value', () => {
      collector = new MetricsCollector({
        steps: ['step1'],
        onSuccess,
        onFail,
        failTime: 5000,
      });

      collector.start();
      jest.advanceTimersByTime(2000);

      const status = collector.getStatus();
      expect(status.remainingTime).toBeLessThanOrEqual(3000);
      expect(status.remainingTime).toBeGreaterThan(0);
    });

    test('remainingTime is 0 after failTime passed', () => {
      collector = new MetricsCollector({
        steps: ['step1'],
        onSuccess,
        onFail,
        failTime: 1000,
      });

      collector.start();
      jest.advanceTimersByTime(1000);

      jest.runOnlyPendingTimers();
      const status = collector.getStatus();

      expect(status.remainingTime).toBe(0);
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2', 'step3'],
        onSuccess,
        onFail,
        failTime: 5000,
      });
    });

    test('returns initial status', () => {
      const status = collector.getStatus();

      expect(status).toEqual({
        isRunning: false,
        isDone: false,
        isPaused: false,
        runningTime: 0,
        pausedDuration: 0,
        registeredMetrics: [],
        completedMetrics: [],
        pendingMetrics: ['step1', 'step2', 'step3'],
        remainingTime: undefined,
      });
    });

    test('returns status after start', () => {
      collector.start();
      const status = collector.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.isDone).toBe(false);
      expect(status.runningTime).toBeGreaterThanOrEqual(0);
    });

    test('includes registered metrics', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => false);

      jest.advanceTimersByTime(100);

      const status = collector.getStatus();
      expect(status.registeredMetrics).toContain('step1');
      expect(status.registeredMetrics).toContain('step2');
    });

    test('includes completed metrics with results', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => false);

      jest.advanceTimersByTime(100);

      const status = collector.getStatus();
      expect(status.completedMetrics).toContainEqual(['step1', true]);
      expect(status.completedMetrics).toContainEqual(['step2', false]);
    });

    test('includes pending metrics', () => {
      collector.addMetricStep('step1', () => true);

      jest.advanceTimersByTime(100);

      const status = collector.getStatus();
      expect(status.pendingMetrics).toContain('step2');
      expect(status.pendingMetrics).toContain('step3');
      expect(status.pendingMetrics).not.toContain('step1');
    });

    test('shows running time', () => {
      collector.start();
      jest.advanceTimersByTime(500);

      const status = collector.getStatus();
      expect(status.runningTime).toBeGreaterThanOrEqual(500);
    });

    test('excludes paused duration from running time', () => {
      collector.start();
      jest.advanceTimersByTime(200);

      collector.pause();
      jest.advanceTimersByTime(300);

      const status = collector.getStatus();
      expect(status.runningTime).toBeLessThan(300);
      expect(status.pausedDuration).toBeGreaterThan(0);
    });
  });

  describe('finish', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
      });
    });

    test('calls onSuccess when all steps pass', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
          duration: expect.any(Number),
          steps: { step1: true, step2: true },
        }),
      );
    });

    test('calls onFail when any step fails', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => false);

      jest.advanceTimersByTime(100);

      expect(onFail).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
          duration: expect.any(Number),
          steps: { step1: true, step2: false },
        }),
      );
    });

    test('calls onFail when step throws error', () => {
      collector.addMetricStep('step1', () => {
        throw new Error('boom');
      });
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);

      expect(onFail).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: expect.objectContaining({ step1: false }),
        }),
      );
    });

    test('calls onFail with missing steps as false', () => {
      collector.addMetricStep('step1', () => true);

      jest.advanceTimersByTime(100);

      expect(onFail).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: { step1: true, step2: false },
        }),
      );
    });

    test('does not call callback twice', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);
      expect(onSuccess).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(100);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    test('includes correct duration in callback', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(500);

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
    });

    test('includes current timestamp in callback', () => {
      const beforeTime = Date.now();
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);

      const afterTime = Date.now();

      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
        }),
      );

      const callbackTimestamp = (onSuccess.mock.calls[0][0] as MetricsCollectorCallback).timestamp;
      expect(callbackTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(callbackTimestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
        failTime: 5000,
      });
    });

    test('resets collector to initial state', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);
      expect(onSuccess).toHaveBeenCalled();

      onSuccess.mockClear();

      collector.reset();

      const status = collector.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.isDone).toBe(false);
      expect(status.isPaused).toBe(false);
      expect(status.runningTime).toBe(0);
      expect(status.pausedDuration).toBe(0);
      expect(status.registeredMetrics).toEqual([]);
      expect(status.completedMetrics).toEqual([]);
    });

    test('clears metrics', () => {
      collector.addMetricStep('step1', () => true);

      jest.advanceTimersByTime(100);

      collector.reset();
      const status = collector.getStatus();

      expect(status.registeredMetrics).toEqual([]);
    });

    test('clears timeout', () => {
      collector.start();
      jest.advanceTimersByTime(1000);

      collector.reset();
      jest.advanceTimersByTime(5000);

      expect(onFail).not.toHaveBeenCalled();
    });

    test('allows restarting after reset', () => {
      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);
      expect(onSuccess).toHaveBeenCalledTimes(1);

      collector.reset();
      onSuccess.mockClear();

      collector.addMetricStep('step1', () => true);
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    test('resets pause state', () => {
      collector.start();
      collector.pause();

      jest.advanceTimersByTime(100);

      collector.reset();
      const status = collector.getStatus();

      expect(status.isPaused).toBe(false);
      expect(status.pausedDuration).toBe(0);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
      });
    });

    test('handles metric function errors gracefully', () => {
      collector.addMetricStep('step1', () => {
        throw new Error('metric error');
      });
      collector.addMetricStep('step2', () => true);

      expect(() => {
        jest.advanceTimersByTime(100);
      }).not.toThrow();

      expect(onFail).toHaveBeenCalled();
    });

    test('handles async metric function errors', () => {
      collector.addMetricStep('step1', async () => {
        throw new Error('async metric error');
      });
      collector.addMetricStep('step2', () => true);

      expect(() => {
        jest.advanceTimersByTime(100);
      }).not.toThrow();

      expect(onFail).toHaveBeenCalled();
    });

    test('marks failed metrics as false in results', () => {
      collector.addMetricStep('step1', () => {
        throw new Error('fail');
      });
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);

      const callback = onFail.mock.calls[0][0] as MetricsCollectorCallback;
      expect(callback.steps.step1).toBe(false);
    });
  });

  describe('logging', () => {
    test('logs when log option is enabled', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      collector = new MetricsCollector({
        steps: ['step1'],
        onSuccess,
        onFail,
        log: true,
      });

      collector.start();
      expect(consoleSpy).toHaveBeenCalledWith('[SLO-metrics:start]');

      consoleSpy.mockRestore();
    });

    test('does not log when log option is disabled', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

      collector = new MetricsCollector({
        steps: ['step1'],
        onSuccess,
        onFail,
        log: false,
      });

      collector.start();
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('complex scenarios', () => {
    test('handles multiple pause/resume cycles', () => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
        failTime: 10000,
      });

      collector.start();
      jest.advanceTimersByTime(100);

      collector.pause();
      jest.advanceTimersByTime(100);

      collector.resume();
      jest.advanceTimersByTime(100);

      collector.pause();
      jest.advanceTimersByTime(100);

      collector.resume();
      jest.advanceTimersByTime(100);

      const status = collector.getStatus();
      expect(status.pausedDuration).toBeGreaterThan(150);
    });

    test('handles metrics added during collection', () => {
      collector = new MetricsCollector({
        steps: ['step1', 'step2', 'step3'],
        onSuccess,
        onFail,
      });

      collector.addMetricStep('step1', () => true);
      jest.advanceTimersByTime(100);

      collector.addMetricStep('step2', () => true);
      jest.advanceTimersByTime(100);

      collector.addMetricStep('step3', () => true);
      jest.advanceTimersByTime(100);

      expect(onSuccess).toHaveBeenCalled();
    });

    test('handles conditional metrics that change state', () => {
      let conditionMet = false;

      collector = new MetricsCollector({
        steps: ['step1', 'step2'],
        onSuccess,
        onFail,
      });

      collector.addMetricStep(
        'step1',
        () => true,
        () => conditionMet,
      );
      collector.addMetricStep('step2', () => true);

      jest.advanceTimersByTime(100);
      expect(onSuccess).not.toHaveBeenCalled();

      conditionMet = true;
      jest.advanceTimersByTime(100);

      expect(onSuccess).toHaveBeenCalled();
    });

    test('tracks timing correctly across pause/resume cycles', () => {
      collector = new MetricsCollector({
        steps: ['step1'],
        onSuccess,
        onFail,
      });

      collector.addMetricStep('step1', () => true);
      jest.advanceTimersByTime(200);

      collector.pause();
      jest.advanceTimersByTime(500);

      collector.resume();
      jest.advanceTimersByTime(100);

      const callback = onSuccess.mock.calls[0][0] as MetricsCollectorCallback;
      expect(callback.duration).toBeLessThan(400);
      expect(callback.duration).toBeGreaterThanOrEqual(200);
    });
  });
});

*/
