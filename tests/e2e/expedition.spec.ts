import { expect, test, type Page } from '@playwright/test';

const travelTimeout = 60_000;

async function closeDialog(page: Page) {
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
}

async function resume(page: Page) {
  const button = page.getByRole('button', { name: /RESUME/ });
  if (await button.count()) await button.click();
}

async function safeSpeed(page: Page) {
  for (let i = 0; i < 2; i++) {
    const button = page.getByRole('button', { name: /^SAFE SPEED/ });
    if ((await button.innerText()).includes('8×')) return;
    await button.click();
  }
  await expect(page.getByRole('button', { name: /^SAFE SPEED/ })).toHaveText('SAFE SPEED 8×');
}

async function localCourse(page: Page, destination: string) {
  await page.getByRole('button', { name: /NAVIGATION/ }).click();
  const contact = page.locator('article').filter({
    has: page.getByRole('heading', { name: destination, exact: true }),
  });
  await contact.getByRole('button', { name: 'SET COURSE', exact: true }).click();
  await expect(page.locator('.location-strip')).toContainText(destination, { timeout: travelTimeout });
  await expect(page.locator('.operation-banner')).toHaveCount(0, { timeout: travelTimeout });
}

async function jump(page: Page, destination: string) {
  await resume(page);
  await expect(page.getByRole('progressbar', { name: 'FTL charge', exact: true }))
    .toHaveAttribute('value', '600', { timeout: travelTimeout });
  await page.getByRole('button', { name: 'JUMP J', exact: true }).click();
  const system = page.locator('article').filter({
    has: page.getByRole('heading', { name: destination, exact: true }),
  });
  await system.getByRole('button', { name: 'PLOT JUMP', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Confirm command', exact: true });
  await expect(confirmation).toContainText(`Jump to ${destination}`);
  await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.location-strip')).toContainText(destination.toUpperCase(), {
    timeout: travelTimeout,
  });
  await expect(page.locator('.operation-banner')).toHaveCount(0, { timeout: travelTimeout });
}

async function stationServices(page: Page) {
  await page.getByRole('button', { name: 'DOCK / STATION', exact: true }).click();
  await page.getByRole('button', { name: 'SERVICES', exact: true }).click();
}

async function buyChart(page: Page, count: number) {
  await stationServices(page);
  await page.getByRole('button', { name: 'Buy local archive chart', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(`Archive coordinate recovered: ${count}/3`);
  await closeDialog(page);
  await expect(page.getByRole('button', { name: new RegExp(`JOURNAL.*${count}/3`) })).toBeVisible();
}

test('completes and preserves an Expedition through production controls', async ({ page }, testInfo) => {
  test.setTimeout(20 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await test.step('Start a genuine new run and finance preparation with freight', async () => {
    await page.goto('/');
    await page.getByLabel('EXPEDITION SEED', { exact: true }).fill('12345');
    await page.getByRole('button', { name: 'New Expedition', exact: true }).click();
    await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
    await safeSpeed(page);
    await page.getByRole('button', { name: 'DOCK / STATION', exact: true }).click();
    await page.getByRole('button', { name: 'CONTRACTS', exact: true }).click();
    const freight = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'Supply run', exact: true }),
    });
    await freight.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(freight).toContainText('active');
    await closeDialog(page);
    await localCourse(page, 'Helios Research Outpost');
    await page.getByRole('button', { name: 'DOCK / STATION', exact: true }).click();
    await page.getByRole('button', { name: 'CONTRACTS', exact: true }).click();
    await freight.getByRole('button', { name: 'Claim completion', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Supply run complete. Reward 32');
    await expect(page.locator('.station-overview')).toContainText('92 CR');
    await closeDialog(page);
  });

  await test.step('Obtain the first two independent coordinates', async () => {
    await jump(page, 'Cinder');
    await jump(page, 'Verdant');
    await buyChart(page, 1);
    await jump(page, 'Orison');
    await jump(page, 'Vesper');
    await buyChart(page, 2);
  });

  await test.step('Survey frontier space, handle a threat and replenish fuel', async () => {
    await localCourse(page, 'Vesper I');
    await expect(page.getByRole('button', { name: 'Evade · 1 fuel', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Evade · 1 fuel', exact: true }).click();
    await page.getByRole('button', { name: 'OPERATIONS', exact: true }).click();
    await page.getByRole('button', { name: 'Investigate location', exact: true }).click();
    await expect(page.locator('.operation-banner')).toHaveCount(0, { timeout: travelTimeout });
    await page.getByRole('button', { name: /JOURNAL/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Vesper I surveyed');
    await closeDialog(page);
    await localCourse(page, 'Vesper Exchange');
    await stationServices(page);
    await page.getByRole('button', { name: 'Sell unique surveys', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Sold');
    const refueling = page.locator('article').filter({
      has: page.getByRole('heading', { name: 'Refueling', exact: true }),
    });
    for (let i = 0; i < 8; i++) {
      await refueling.getByRole('button', { name: 'Buy 1 fuel', exact: true }).click();
    }
    await expect(refueling).toContainText('Fuel 10/10');
    await closeDialog(page);
    await jump(page, 'Nacre');
    await buyChart(page, 3);
  });

  await test.step('Save and continue the genuine run with all coordinates intact', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: /Save expedition/ }).click();
    await expect(page.getByRole('dialog')).toContainText('saved and verified');
    await page.reload();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /JOURNAL.*3\/3/ })).toBeVisible();
    await safeSpeed(page);
  });

  await test.step('Resolve the guardian and recover the real final archive', async () => {
    await jump(page, 'The Veil');
    await jump(page, 'Terminus');
    await page.getByRole('button', { name: 'OPERATIONS', exact: true }).click();
    await page.getByRole('button', { name: 'Negotiate passage', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Guardian passage granted');
    await closeDialog(page);
    await localCourse(page, 'The Cartographer Beacon');
    await page.getByRole('button', { name: 'OPERATIONS', exact: true }).click();
    await page.getByRole('button', { name: 'Recover final archive', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Cartographer archive secured');
    await closeDialog(page);
    await expect(page.getByRole('dialog', { name: 'Expedition debrief', exact: true })).toHaveCount(0);
  });

  await test.step('Extract at Haven and persist the terminal outcome', async () => {
    await jump(page, 'The Veil');
    await jump(page, 'Orison');
    await jump(page, 'Helios');
    await stationServices(page);
    await page.getByRole('button', { name: 'Hand in final archive', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Expedition debrief', exact: true }))
      .toContainText('THE ARCHIVE IS HOME');
    await expect(page.getByRole('dialog', { name: 'Expedition debrief', exact: true }))
      .toContainText('Archives 3/3');
    await page.keyboard.press('f');
    await page.reload();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Expedition debrief', exact: true }))
      .toContainText('THE ARCHIVE IS HOME');
    await page.screenshot({ path: testInfo.outputPath('expedition-victory.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
});
