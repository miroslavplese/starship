import { expect, type Page } from '@playwright/test';

export async function beginExpedition(page: Page, seed?: string) {
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  if (seed) await page.getByLabel('EXPEDITION SEED', { exact: true }).fill(seed);
  await page.getByRole('button', { name: 'Begin Expedition', exact: true }).click();
}

export async function continueExpedition(page: Page) {
  await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  await page.locator('.saved-games > .saved-list').getByRole('button', { name: 'Load', exact: true }).first().click();
  await expect(page.locator('.screen-fade')).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
}

export async function importExpeditionFile(page: Page, name: string, bytes: string) {
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await page.getByLabel('Import expedition', { exact: true }).setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(bytes) });
}

export async function savedLibraryBytes(page: Page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('starship.')).sort().map(key => [key, localStorage.getItem(key)])));
}

export async function savedSnapshots(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('starship.expedition.v1:') && !key.endsWith('.previous')).map(key => {
    const record = JSON.parse(localStorage.getItem(key)!);
    return { key, raw: localStorage.getItem(key)!, snapshot: record.snapshot as string, name: record.name as string, savedAt: record.savedAt as string | null };
  }));
}

export async function closeDialog(page: Page) {
  const label = await page.getByRole('dialog').last().getAttribute('aria-label');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('dialog', { name: label!, exact: true })).toHaveCount(0);
  await expect(page.locator('.screen-fade')).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
}

export async function dismissScreen(page: Page) {
  await expect(page.locator('.screen-fade')).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.screen-fade')).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
}

export async function returnFromDrill(page: Page) {
  await expect(page.locator('.screen-fade')).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  const inspector = page.locator('.room-inspector');
  if (await inspector.count()) {
    await inspector.getByRole('button', { name: 'Close room inspector', exact: true }).click({ timeout: 30000 });
    await expect(inspector).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Return to expedition unchanged', exact: true }).click({ timeout: 30000 });
}

export async function selectPlayerRoom(page: Page, name: string) {
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await page.locator('.operation-buttons button').filter({ hasText: `Wayfarer: ${name}` }).click();
  await expect(page.getByRole('dialog', { name: 'systems', exact: true })).toHaveCount(0);
  await expect(page.locator('.screen-fade')).toHaveCount(0);
  await expect(page.locator('.room-inspector')).toBeVisible();
}

export async function setGraphicsQuality(page: Page, quality: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Tactical graphics quality' }).selectOption(quality);
  await closeDialog(page);
  await expect(page.locator('.tactical-scene')).toHaveAttribute('data-renderer-ready', 'true');
}

export async function enableDiagnostics(page: Page, quality?: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  if (quality) await page.getByRole('combobox', { name: 'Tactical graphics quality' }).selectOption(quality);
  await page.getByRole('checkbox', { name: 'Show graphics diagnostics / frame rate' }).check();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByTestId('tactical-rendered-fps')).toBeVisible();
}
