import { expect, test } from '@playwright/test';

interface HelperCase {
  group: string;
  id: string;
  expected: unknown;
  actual: unknown;
  note: string;
}

test('layout helpers answer as README promises for real images and DOM', async ({ page }) => {
  await page.goto('/');
  const results = await page.waitForFunction(
    () => (window as unknown as { helperResults?: HelperCase[] }).helperResults,
    undefined,
    { timeout: 30_000 },
  );
  const cases = (await results.jsonValue()) as HelperCase[];

  expect(cases.length).toBeGreaterThan(90);
  for (const { group, id, expected, actual, note } of cases) {
    expect.soft(actual, `${group}: ${id}${note ? ` (${note})` : ''}`).toBe(expected);
  }
});
