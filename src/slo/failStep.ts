// Helpers keep returning a plain boolean, so a final failure travels beside the return value
let failRunningStep: (() => void) | undefined;

export function failStepNow() {
  failRunningStep?.();
}

export function callStepCheck<T>(check: () => T): { outcome: T; failedNow: boolean } {
  let failedNow = false;
  const outer = failRunningStep;
  failRunningStep = () => {
    failedNow = true;
  };
  try {
    const outcome = check();
    return { outcome, failedNow };
  } finally {
    failRunningStep = outer;
  }
}
