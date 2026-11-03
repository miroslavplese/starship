import { expect, test } from '@playwright/test';
import { beginExpedition, setGraphicsQuality, returnFromDrill } from './journeys';

test('finished combat, targeting and physical-hazard visual states at full resolution', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction' }).click();
  await setGraphicsQuality(page, 'high');
  await page.getByRole('button', { name: /NAVIGATION/ }).click();
  await page.locator('.contact-card').last().getByRole('button', { name: 'SET COURSE' }).click();
  await expect(page.locator('.enemy-readout')).toContainText('CONTACT HULL', { timeout: 60000 });
  await expect(page.locator('.tactical-scene')).toHaveAttribute('data-renderer-ready', 'true');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `test-results/${test.info().project.name}-pristine-combat.png` });
  await page.keyboard.press('q');
  await expect(page.locator('.targeting-banner')).toContainText('TARGETING LASER');
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await page.locator('.operation-buttons button').filter({ hasText: /^Corsair: Shields/ }).click();
  await page.getByRole('button', { name: /RESUME/ }).click();
  await page.waitForTimeout(200);
  await page.locator('.pause-stack .pause-button').click();
  await page.locator('.crew-roster').getByRole('button', { name: /^Ivo/ }).click();
  await page.getByRole('button', { name: 'Close room inspector', exact: true }).click();
  await page.screenshot({ path: `test-results/${test.info().project.name}-targeting.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'FIELD MANUAL', exact: true }).click();
  await page.getByRole('button', { name: 'Damage-control practice drill' }).click();
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await page.locator('.operation-buttons button').filter({ hasText: /^Wayfarer: Weapons/ }).click();
  await expect(page.locator('.room-inspector')).toContainText('FIRE 35%');
  await expect(page.locator('.room-inspector')).toContainText('BREACH 0.3');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `test-results/${test.info().project.name}-fire-breach.png` });
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    instrumentsBottom: document.querySelector('.instruments')!.getBoundingClientRect().bottom,
    height: innerHeight,
  }));
  expect(layout.document).toBeLessThanOrEqual(layout.viewport);
  expect(layout.instrumentsBottom).toBeLessThanOrEqual(layout.height + 1);
  await returnFromDrill(page);
  expect(errors).toEqual([]);
});
