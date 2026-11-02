import { expect, test, type Page } from '@playwright/test';

async function newRun(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New Expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction' }).click();
}

async function clickWorld(page: Page, x: number, y: number) {
  const scene = page.locator('.tactical-scene');
  const { w, h } = await scene.evaluate(el => ({ w: el.clientWidth, h: el.clientHeight }));
  const box = (await scene.locator('canvas').boundingBox())!;
  const scale = Math.min(w / 1600, h / 600);
  const ox = (w - 1600 * scale) / 2, oy = (h - 600 * scale) / 2;
  await page.mouse.click(box.x + (ox + x * scale) * box.width / w, box.y + (oy + y * scale) * box.height / h);
}

test('spatial targeting over hostile crew, field claims and combat continuation', async ({ page }) => {
  await page.setViewportSize({ width: 1664, height: 936 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await newRun(page);
  await page.getByRole('button', { name: /DOCK \/ STATION/ }).click();
  await page.getByRole('button', { name: 'CONTRACTS', exact: true }).click();
  await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Raider interdiction', exact: true }) }).getByRole('button', { name: 'Accept', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /NAVIGATION/ }).click();
  await page.locator('.contact-card').last().getByRole('button', { name: 'SET COURSE' }).click();
  await expect(page.locator('.enemy-readout')).toContainText('Marked raider', { timeout: 60000 });
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  const laser = page.locator('.weapon-tile').filter({ hasText: 'Pulse Laser' });
  const ion = page.locator('.weapon-tile').filter({ hasText: 'Ion Lance' });
  const feedback = page.locator('.navigation-bar [role="status"]');
  await page.getByRole('checkbox', { name: 'AUTO-FIRE' }).check();
  await laser.getByRole('button', { name: /Pulse Laser/ }).click();
  await clickWorld(page, 1321.35, 191.213);
  await expect(feedback).toContainText('Order queued (1)');
  await expect(page.locator('.room-inspector')).not.toContainText('Tal orders');
  await ion.getByRole('button', { name: /Ion Lance/ }).click();
  await clickWorld(page, 1384.05, 179.3);
  await expect(feedback).toContainText('Order queued (2)');
  await page.getByRole('button', { name: /RESUME/ }).click();
  await expect(laser.locator('.weapon-state')).toHaveText('AUTO · weapons');
  await expect(ion.locator('.weapon-state')).toHaveText('AUTO · shields');
  await page.locator('.pause-stack .pause-button').click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Save expedition/ }).click();
  await expect(page.getByRole('dialog')).toContainText('saved and verified');
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(laser.locator('.weapon-state')).toHaveText('AUTO · weapons');
  await expect(ion.locator('.weapon-state')).toHaveText('AUTO · shields');
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  await page.getByRole('button', { name: 'OPERATIONS', exact: true }).click();
  const bounty = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Raider interdiction', exact: true }) });
  await expect(bounty.getByRole('button', { name: 'Claim completion' })).toBeVisible();
  await bounty.getByRole('button', { name: 'Claim completion' }).click();
  await expect(page.locator('.dialog-footer')).not.toContainText('paid');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.screenshot({ path: `test-results/${test.info().project.name}-spatial-targeting.png` });
  expect(errors).toEqual([]);
});

test('real door lock/unlock, reversible emergency drill and terminal persistence', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await newRun(page);
  await page.getByRole('button', { name: /^JUMP/ }).click();
  await page.locator('article').filter({ has: page.getByRole('heading', { name: 'Cinder', exact: true }) }).getByRole('button', { name: 'PLOT JUMP' }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'map', exact: true })).toBeVisible();
  await expect(page.locator('.dialog-footer')).toContainText('FTL charging');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  const door = page.locator('.door-list > div').first();
  await door.getByRole('button', { name: 'Lock', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /RESUME/ }).click();
  await page.waitForTimeout(150);
  await page.locator('.pause-stack .pause-button').click();
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await expect(door.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible();
  await door.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /RESUME/ }).click();
  await page.waitForTimeout(150);
  await page.locator('.pause-stack .pause-button').click();
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await expect(door.getByRole('button', { name: 'Lock', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Save expedition/ }).click();
  const original = await page.evaluate(() => localStorage.getItem('starship.save.v1'));
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'FIELD MANUAL', exact: true }).click();
  await page.getByRole('button', { name: 'Damage-control practice drill' }).click();
  await expect(page.locator('.drill-banner')).toContainText('DAMAGE-CONTROL');
  await page.keyboard.press('f');
  await expect(page.locator('.navigation-bar [role="status"]')).toContainText('does not overwrite');
  expect(await page.evaluate(() => localStorage.getItem('starship.save.v1'))).toBe(original);
  await page.getByRole('button', { name: 'Return to expedition unchanged' }).click();
  await expect(page.locator('.player-readout')).toContainText('30 / 30');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Abandon expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Expedition debrief' })).toContainText('JOURNEY ENDED');
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Expedition debrief' })).toContainText('JOURNEY ENDED');
  expect(errors).toEqual([]);
});

test('production shell and saved expedition reopen without a network', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Offline service-worker interception is checked in Chromium.');
  await newRun(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Save expedition/ }).click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  await expect(page.locator('.player-readout')).toContainText('30 / 30');
});
