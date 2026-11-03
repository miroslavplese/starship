import { expect, test } from '@playwright/test';
import { closeDialog, beginExpedition, continueExpedition, enableDiagnostics } from './journeys';

test('first battle: damage control, repower, surrender or victory, reward and departure', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction' }).click();
  await page.getByRole('button', { name: /DOCK \/ STATION/ }).click();
  await page.getByRole('button', { name: 'SHIPYARD', exact: true }).click();
  await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Pulse laser', exact: true }) }).getByRole('button', { name: /INSTALL/ }).click();
  await page.getByRole('button', { name: 'CONTRACTS', exact: true }).click();
  await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Raider interdiction', exact: true }) }).getByRole('button', { name: 'Accept', exact: true }).click();
  await closeDialog(page);
  await page.getByRole('button', { name: 'Increase weapons power' }).click();
  await page.getByRole('button', { name: /NAVIGATION/ }).click();
  await page.locator('.contact-card').last().getByRole('button', { name: 'SET COURSE' }).click();
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible({ timeout: 60000 });
  for (const [key, room] of [['q', 'Engines'], ['e', 'Weapons']] as const) {
    await page.keyboard.press(key);
    await page.getByRole('button', { name: 'SHIP', exact: true }).click();
    await page.locator('.operation-buttons button').filter({ hasText: new RegExp(`^Marked raider at s0-pirate: ${room}`) }).click();
    await expect(page.getByRole('dialog', { name: 'systems', exact: true })).toHaveCount(0);
    await expect(page.locator('.screen-fade')).toHaveCount(0);
  }
  await page.locator('.weapon-tile').nth(2).getByRole('button', { name: /Pulse Laser/ }).click();
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await page.locator('.operation-buttons button').filter({ hasText: /^Marked raider at s0-pirate: Engines/ }).click();
  await page.locator('.crew-roster').getByRole('button', { name: /^Ivo/ }).click();
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await page.locator('.operation-buttons button').filter({ hasText: /^Wayfarer: Weapons/ }).click();
  await page.locator('.room-inspector').getByRole('button', { name: 'repair', exact: true }).click();
  await page.getByRole('button', { name: /RESUME/ }).click();
  let completed = false, repairTask = 'repair';
  for (let attempt = 0; attempt < 120; attempt++) {
    await page.waitForTimeout(1500);
    expect(await page.getByRole('dialog', { name: 'Expedition debrief' }).count(), 'Prepared battle must remain winnable with engine targeting, physical repair and repower').toBe(0);
    const pause = page.locator('.pause-stack .pause-button');
    if ((await pause.textContent())?.includes('PAUSE')) await pause.click();
    const accept = page.getByRole('button', { name: 'Accept terms', exact: true });
    if (await accept.count()) await accept.click();
    const hazards = await page.locator('.room-inspector').textContent();
    const desiredTask = Number(hazards?.match(/FIRE (\d+)%/)?.[1] ?? 0) > 0 ? 'extinguish' : 'repair';
    if (desiredTask !== repairTask) {
      await page.locator('.room-inspector').getByRole('button', { name: desiredTask, exact: true }).click();
      repairTask = desiredTask;
    }
    const weapons = page.locator('.system-tile').filter({ has: page.locator('b').filter({ hasText: /^Weapons$/ }) });
    if (!(await weapons.textContent())?.includes('ION LOCK')) {
      const allocated = await weapons.locator('.power-controls .segments i.filled').count();
      for (let unit = allocated; unit < 3; unit++) await page.getByRole('button', { name: 'Increase weapons power' }).click();
    }
    await page.getByRole('button', { name: 'OPERATIONS', exact: true }).click({ timeout: 3000 });
    const bounty = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Raider interdiction', exact: true }) });
    await bounty.getByRole('button', { name: 'Claim completion' }).click();
    completed = await bounty.count() === 0;
    await closeDialog(page);
    if (completed) break;
    await page.getByRole('button', { name: /RESUME/ }).click();
  }
  expect(completed, 'Defeat the marked target and claim its real field bounty').toBe(true);
  const credits = await page.locator('[title="Credits and scrap"] b').textContent();
  expect(Number(credits)).toBeGreaterThan(60);
  await page.getByRole('button', { name: /NAVIGATION/ }).click();
  await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Haven Anchorage', exact: true }) }).getByRole('button', { name: 'SET COURSE' }).click();
  await expect(page.locator('.location-strip')).toContainText('Haven Anchorage', { timeout: 60000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Save expedition/ }).click();
  await expect(page.locator('.dialog-footer')).toContainText('saved and verified');
  await page.reload();
  await continueExpedition(page);
  await expect(page.locator('[title="Credits and scrap"] b')).toHaveText(credits!);
  await enableDiagnostics(page);
  await expect(page.getByTestId('tactical-rendered-fps')).not.toHaveAttribute('data-render-state', 'measuring');
  await page.screenshot({ path: `test-results/${test.info().project.name}-first-battle-complete.png` });
  expect(errors).toEqual([]);
});
