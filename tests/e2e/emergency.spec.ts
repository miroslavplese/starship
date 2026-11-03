import { expect, test, type Page } from '@playwright/test';
import { closeDialog, beginExpedition, returnFromDrill } from './journeys';

test.use({ actionTimeout: 30000 });

async function selectRoom(page: Page, name: string) {
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await page.locator('.operation-buttons button').filter({ hasText: new RegExp(`^Wayfarer: ${name}`) }).click();
}

test('real physical emergency suppression, breach repair, healing and vent warning', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction' }).click();
  await page.getByRole('button', { name: 'FIELD MANUAL', exact: true }).click();
  await page.getByRole('button', { name: 'Damage-control practice drill' }).click();
  await selectRoom(page, 'Weapons');
  await expect(page.locator('.room-inspector')).toContainText('FIRE 35%');
  await expect(page.locator('.room-inspector')).toContainText('BREACH 0.3');
  await page.screenshot({ path: `test-results/${test.info().project.name}-emergency.png` });
  await page.locator('.room-inspector').getByRole('button', { name: 'extinguish', exact: true }).click();
  await page.getByRole('button', { name: /RESUME/ }).click();
  await expect(page.locator('.room-inspector')).toContainText('FIRE 0%', { timeout: 90000 });
  await page.locator('.room-inspector').getByRole('button', { name: 'repair', exact: true }).click();
  await expect(page.locator('.room-inspector')).toContainText('BREACH 0.0', { timeout: 90000 });
  await expect(page.locator('.room-inspector')).toContainText('100.0 HP', { timeout: 90000 });
  await expect(page.locator('.drill-banner')).toContainText('DRILL OBJECTIVE VERIFIED');
  await page.getByRole('button', { name: 'Increase medbay power' }).click();
  await page.locator('.crew-roster').getByRole('button', { name: /^Kade/ }).click();
  await selectRoom(page, 'Medbay');
  await page.locator('.room-inspector').getByRole('button', { name: 'heal', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Kade health' })).toHaveAttribute('value', '100', { timeout: 90000 });
  await page.locator('.pause-stack .pause-button').click();
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  const vent = page.locator('.door-list > div').filter({ hasText: 'VACUUM' });
  await vent.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('depressurize and suffocate');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await closeDialog(page);
  await page.getByRole('button', { name: /RESUME/ }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await vent.getByRole('button', { name: 'Close', exact: true }).click();
  await closeDialog(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.room-inspector')).toHaveCount(0);
  await returnFromDrill(page);
  await expect(page.locator('.player-readout')).toContainText('30 / 30');
  expect(errors).toEqual([]);
});
