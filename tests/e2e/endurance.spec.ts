import { expect, test } from '@playwright/test';
import { beginExpedition, continueExpedition } from './journeys';

test('25 production restart/load/battle cycles and fifteen-minute browser endurance', async ({ page, context, browserName }) => {
  test.skip(process.env.SOAK !== '1' || browserName !== 'chromium', 'Run explicitly with SOAK=1 in Chromium.');
  test.setTimeout(1500000);
  await page.setViewportSize({ width: 1664, height: 936 });
  const errors: string[] = [], heap: number[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  const started = Date.now();
  for (let cycle = 0; cycle < 25; cycle++) {
    await page.goto('/');
    await beginExpedition(page);
    if (await page.getByRole('alertdialog').count()) await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.getByRole('button', { name: 'Skip introduction' }).click();
    await page.getByRole('button', { name: /NAVIGATION/ }).click();
    await page.locator('.contact-card').last().getByRole('button', { name: 'SET COURSE' }).click();
    await expect(page.locator('.enemy-readout')).toContainText('CONTACT HULL', { timeout: 60000 });
    await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
    const scene = page.locator('.tactical-scene');
    const { w, h } = await scene.evaluate(el => ({ w: el.clientWidth, h: el.clientHeight }));
    const box = (await scene.locator('canvas').boundingBox())!;
    const scale = Math.min(w / 1600, h / 600), ox = (w - 1600 * scale) / 2, oy = (h - 600 * scale) / 2;
    for (const [family, x, y] of [['laser', 1321.35, 191.213], ['ion', 1384.05, 179.3]] as const) {
      await page.keyboard.press(family === 'laser' ? 'q' : 'e');
      await page.mouse.click(box.x + (ox + x * scale) * box.width / w, box.y + (oy + y * scale) * box.height / h);
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: /Save expedition/ }).click();
    await expect(page.locator('.dialog-footer')).toContainText('saved and verified');
    await page.reload();
    await continueExpedition(page);
    await page.getByRole('button', { name: /RESUME/ }).click();
    await page.waitForTimeout(36000);
    expect(await page.locator('canvas').count()).toBe(1);
    await cdp.send('HeapProfiler.collectGarbage');
    const usage = await cdp.send('Runtime.getHeapUsage');
    heap.push(usage.usedSize);
    console.log(JSON.stringify({ cycle: cycle + 1, elapsedSeconds: (Date.now() - started) / 1000, retainedHeap: usage.usedSize, errors: errors.length }));
  }
  const elapsed = Date.now() - started;
  const warm = Math.max(...heap.slice(3, 6)), final = Math.max(...heap.slice(-3));
  const growth = (final - warm) / warm;
  await test.info().attach('browser-endurance.json', { body: JSON.stringify({ cycles: 25, elapsed, heap, growth, errors }, null, 2), contentType: 'application/json' });
  expect(elapsed).toBeGreaterThanOrEqual(900000);
  expect(errors).toEqual([]);
  expect(growth).toBeLessThanOrEqual(0.1);
});
