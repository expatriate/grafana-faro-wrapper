import { expect, test } from '@playwright/test';

interface LegacyResult {
  errors: string[];
  sloSent: boolean;
}

test('full bundle runs in an ES2019 browser on a page that is not in UTF-8', async ({ page }) => {
  await page.goto('/legacy');
  const result = await page.waitForFunction(
    () => (window as unknown as { legacyResult?: LegacyResult }).legacyResult,
    undefined,
    { timeout: 30_000 },
  );
  const { errors, sloSent } = (await result.jsonValue()) as LegacyResult;

  expect(errors).toEqual([]);
  expect(sloSent).toBe(true);
});
