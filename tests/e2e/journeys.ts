import { expect, type Page } from '@playwright/test';

export async function beginExpedition(page: Page, seed?: string) {
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  if (seed) await page.getByLabel('EXPEDITION SEED', { exact: true }).fill(seed);
  await page.getByRole('button', { name: 'Begin Expedition', exact: true }).click();
}

export async function continueExpedition(page: Page) {
  await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
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

export async function enableDiagnostics(page: Page, quality?: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  if (quality) await page.getByRole('combobox', { name: 'Tactical graphics quality' }).selectOption(quality);
  await page.getByRole('checkbox', { name: 'Show graphics diagnostics / frame rate' }).check();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByTestId('tactical-rendered-fps')).toBeVisible();
}
