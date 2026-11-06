import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../../src/sim/types';
import { beginExpedition, closeDialog, savedLibraryBytes, savedSnapshots } from './journeys';

async function downloadRun(page: Page): Promise<GameState> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download save file', exact: true }).click();
  const download = await pending, path = await download.path();
  if (!path) throw new Error('Current expedition download was unavailable.');
  return JSON.parse(JSON.parse(await readFile(path, 'utf8')).payload);
}
async function loadNamed(page: Page, name: string) {
  await page.locator('.saved-games > .saved-list article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
}

test('two expeditions retain live progress and orders through switching, return to menu and browser reload', async ({ page }, info) => {
  await page.goto('/'); await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.getByRole('button', { name: 'Increase medbay power', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'New expedition', exact: true }).click();
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await page.getByLabel('EXPEDITION SEED', { exact: true }).fill('222');
  await page.getByRole('button', { name: 'Begin Expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.getByRole('button', { name: 'Increase oxygen power', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Saved expeditions', exact: true }).click();
  await expect(page.locator('.saved-games > .saved-list article')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('switch-expeditions.png') });
  await loadNamed(page, 'Expedition 1');
  const second = (await savedSnapshots(page)).find(save => save.name === 'Expedition 2')!;
  await page.locator('.crew-card').nth(1).click();
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await page.getByRole('button', { name: /Wayfarer: Cockpit/ }).click();
  await page.getByRole('button', { name: 'move', exact: true }).click();
  await expect(page.locator('.room-inspector')).toHaveCount(0);
  await page.getByRole('button', { name: /RESUME/ }).click();
  await page.waitForTimeout(1200);
  await page.locator('.pause-stack .pause-button').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const live = await downloadRun(page);
  expect(live.tick).toBeGreaterThan(0); expect(live.tick).toBeLessThan(600);
  expect(live.ships[0].systems.find(system => system.kind === 'medbay')!.power).toBe(1);
  expect(live.crew[1].task).toBe('move');
  await page.getByRole('button', { name: 'Return to main menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Main menu', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  await loadNamed(page, 'Expedition 1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  expect(await downloadRun(page)).toEqual(live);
  expect((await savedSnapshots(page)).find(save => save.key === second.key)!.raw).toBe(second.raw);
  await page.screenshot({ path: info.outputPath('resumed-current-expedition.png') });
  await page.getByRole('button', { name: 'Saved expeditions', exact: true }).click();
  await loadNamed(page, 'Expedition 2');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  expect(await downloadRun(page)).toEqual(JSON.parse(JSON.parse(second.snapshot).payload));
});

test('a failed menu checkpoint keeps the live expedition in Settings until saving can succeed', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    let fail = false;
    window.addEventListener('starship-test-fail-menu-save', () => { fail = true; });
    Storage.prototype.setItem = function (key, value) {
      if (fail && key.startsWith('starship.expedition.v1:') && !key.endsWith('.previous')) {
        fail = false; throw new DOMException('Test quota exhausted.', 'QuotaExceededError');
      }
      set.call(this, key, value);
    };
  });
  await page.goto('/'); await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.getByRole('button', { name: 'Increase medbay power', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const live = await downloadRun(page), stored = (await savedSnapshots(page))[0];
  await page.evaluate(() => window.dispatchEvent(new Event('starship-test-fail-menu-save')));
  await page.getByRole('button', { name: 'Return to main menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'settings', exact: true })).toBeVisible();
  await expect(page.locator('.dialog-footer')).toContainText('Save failed:');
  await expect(page.getByRole('dialog', { name: 'Main menu', exact: true })).toHaveCount(0);
  expect(await downloadRun(page)).toEqual(live);
  expect((await savedSnapshots(page))[0].raw).toBe(stored.raw);
  await expect(page.getByRole('button', { name: 'Save current progress as a separate expedition', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Return to main menu', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Main menu', exact: true })).toBeVisible();
  expect(JSON.parse(JSON.parse((await savedSnapshots(page))[0].snapshot).payload)).toEqual(live);
});

test('menu Settings keeps its menu backdrop and empty Load offers a direct New Game route without writing saves', async ({ page }, info) => {
  await page.goto('/');
  const before = await savedLibraryBytes(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'settings', exact: true })).not.toContainText('Interaction pause active');
  await expect(page.locator('.title-screen')).toBeVisible();
  await expect(page.locator('.title-screen')).toHaveAttribute('inert', '');
  await expect(page.locator('.title-screen')).toHaveAttribute('aria-hidden', 'true');
  await page.screenshot({ path: info.outputPath('menu-settings.png') });
  await closeDialog(page);
  await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  await expect(page.locator('.empty-saves')).toContainText('No saved expeditions');
  await page.screenshot({ path: info.outputPath('empty-load-next-step.png') });
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Mission selection', exact: true })).toBeVisible();
  await closeDialog(page);
  await expect(page.getByRole('dialog', { name: 'Main menu', exact: true })).toBeVisible();
  expect(await savedLibraryBytes(page)).toEqual(before);
});
