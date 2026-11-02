import { expect, test } from '@playwright/test';

const basePath = process.env.STARSHIP_BASE_PATH ?? '/';

test('deployment base loads scripts, styles, original art and a saved expedition', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(basePath);
  await expect(page.getByRole('dialog', { name: 'Expedition briefing', exact: true })).toBeVisible();
  const assets = await page.evaluate(() => [
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'), element => element.src),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), element => element.href),
  ]);
  expect(assets.length).toBeGreaterThanOrEqual(2);
  for (const asset of assets) expect(new URL(asset).pathname.startsWith(`${basePath}assets/`)).toBe(true);
  const art = ['space.png', 'wayfarer-hull.png', 'corsair-hull.png'].map(file => `${basePath}art/${file}`);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => entry instanceof PerformanceResourceTiming && entry.initiatorType === 'img')
    .map(entry => new URL(entry.name).pathname))).toEqual(expect.arrayContaining(art));
  for (const asset of art) {
    const response = await page.request.get(asset);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  await page.getByRole('button', { name: 'New Expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await expect(page.locator('.player-readout')).toContainText('30 / 30');
  await page.keyboard.press('f');
  await expect(page.locator('.navigation-bar [role="status"]')).toContainText('saved and verified');
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('deployment-scoped offline cache preserves other sites and reloads without a network', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Offline service-worker acceptance is exercised in Chromium.');
  await page.goto(`${basePath}art/manifest.json`);
  await page.evaluate(async () => {
    const cache = await caches.open('starship-other-site-sentinel');
    await cache.put('./sentinel', new Response('Other site data'));
  });
  await page.goto(basePath);
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, script: registration.active!.scriptURL };
  });
  expect(new URL(worker.scope).pathname).toBe(basePath);
  expect(new URL(worker.script).pathname).toBe(`${basePath}sw.js`);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  expect(await page.evaluate(() => caches.has('starship-other-site-sentinel'))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Expedition briefing', exact: true })).toBeVisible();
});
