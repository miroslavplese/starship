import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { closeDialog, dismissScreen, beginExpedition, continueExpedition, setGraphicsQuality, savedLibraryBytes, savedSnapshots } from './journeys';

async function observeTransitions(page: Page) {
  return page.evaluateHandle(() => {
    const samples: { fade: string | null; opacity: number; width: number; height: number; deckOpacity: number; sceneOpacity: number }[] = [];
    let frame = 0;
    const sample = () => {
      const fade = document.querySelector<HTMLElement>('.screen-fade'), box = fade?.getBoundingClientRect();
      samples.push({
        fade: fade?.className ?? null, opacity: fade ? Number(getComputedStyle(fade).opacity) : 0,
        width: box?.width ?? 0, height: box?.height ?? 0,
        deckOpacity: Number(getComputedStyle(document.querySelector('main')!).opacity),
        sceneOpacity: Number(getComputedStyle(document.querySelector('.tactical-scene')!).opacity),
      });
    };
    const tick = () => { sample(); frame = requestAnimationFrame(tick); };
    const observer = new MutationObserver(sample);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    tick();
    return { stop() { sample(); observer.disconnect(); cancelAnimationFrame(frame); return samples; } };
  });
}

test('cinematic menu, pre-run settings and credits never write a save', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Main menu', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.title-art').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('main-menu.png') });
  await page.getByRole('button', { name: 'About', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Miroslav Plese');
  await dismissScreen(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /Save expedition/ })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Reduced motion', exact: true }).check();
  await dismissScreen(page);
  await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  await expect(page.locator('.empty-saves')).toContainText('No saved expeditions');
  await expect(page.locator('.save-recovery')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'load', exact: true })).not.toContainText('Interaction pause active');
  await expect(page.getByRole('button', { name: /^(Save expedition|Continue|Restore)/ })).toHaveCount(0);
  await expect(page.getByLabel('Import expedition')).toBeVisible();
  await dismissScreen(page);
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Mission selection', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Planetary Survey/ }).click();
  expect(await savedLibraryBytes(page)).toEqual({});
  await page.getByRole('button', { name: 'Begin Expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction' }).click();
  await expect(page.locator('.enemy-readout')).toContainText('Planetary survey');
  await expect(page.getByTestId('tactical-rendered-fps')).toHaveCount(0);
  await expect(page.locator('.navigation-bar')).toHaveCount(0);
  await page.keyboard.press('f');
  await expect(page.locator('.command-feedback')).toContainText('saved and verified');
  const saved = await savedLibraryBytes(page);
  await page.reload();
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Mission selection', exact: true })).toBeVisible();
  await dismissScreen(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await dismissScreen(page);
  expect(await savedLibraryBytes(page)).toEqual(saved);
  await continueExpedition(page);
  await expect(page.locator('.enemy-readout')).toContainText('Planetary survey');
  expect(errors).toEqual([]);
});

test('two-level navigation, render settings and anchored queued crew orders', async ({ page }, info) => {
  await page.goto('/');
  await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction' }).click();
  await setGraphicsQuality(page, 'performance');
  await expect.poll(() => page.locator('.tactical-scene canvas').evaluate(canvas => (canvas as HTMLCanvasElement).width / canvas.clientWidth)).toBeCloseTo(.5, 2);
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const navBox = (await page.getByRole('button', { name: 'NAVIGATION', exact: true }).boundingBox())!;
  expect(navBox.x).toBeLessThan((await settings.boundingBox())!.x);
  await page.getByRole('button', { name: 'NAVIGATION', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Orbital system map' })).toBeVisible();
  await expect(page.locator('.navigation-visual')).not.toContainText('Schematic, not physical scale.');
  await page.getByRole('button', { name: 'Inspect Helios I', exact: true }).click();
  await expect(page.locator('#course-s0-planet0')).toHaveClass(/selected/);
  await page.screenshot({ path: info.outputPath('orbital-map.png') });
  await page.getByRole('button', { name: 'STELLAR REGION', exact: true }).click();
  await expect(page.locator('.navigation-visual')).not.toContainText('Schematic, not physical scale.');
  await expect(page.locator('.navigation-visual line.available')).toHaveCount(2);
  await page.getByRole('button', { name: 'Inspect Cinder', exact: true }).press('Enter');
  await expect(page.locator('#course-s1')).toHaveClass(/selected/);
  await page.screenshot({ path: info.outputPath('stellar-map.png') });
  await closeDialog(page);
  await page.locator('.crew-card').nth(1).click();
  await page.getByRole('button', { name: 'SHIP', exact: true }).click();
  await page.getByRole('button', { name: /Wayfarer: Shields/ }).click();
  const popup = page.locator('.room-inspector');
  await expect(popup).toBeVisible();
  await expect(page.locator('.screen-fade')).toHaveCount(0);
  await expect(popup).toContainText('Ivo orders');
  const before = (await popup.boundingBox())!;
  expect(before.x).toBeGreaterThanOrEqual(8);
  expect(before.y).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: info.outputPath('room-orders.png') });
  await expect(page.getByRole('button', { name: 'move', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1100, height: 760 });
  await expect.poll(async () => (await popup.boundingBox())!.x).not.toBe(before.x);
  const after = (await popup.boundingBox())!;
  expect(after.x + after.width).toBeLessThanOrEqual(1100);
  expect(after.y + after.height).toBeLessThanOrEqual(760);
  await expect(page.getByRole('button', { name: 'move', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'repair', exact: true }).press('Enter');
  await expect(page.locator('.command-feedback')).toContainText('Order queued (1)');
  await expect(popup).toHaveCount(0);
  await expect(page.locator('.crew-card.selected')).toBeFocused();
});

test('menu overlays restore modal focus without a scene transition', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await expect(page.locator('.screen-fade')).toHaveCount(0);
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('dialog', { name: 'Mission selection', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.locator('.screen-fade')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /The Cartographer Expedition/ })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Main menu', exact: true })).toBeVisible();
});

test('opening, switching and closing overlays never fades the viewport or changes captain pause', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/'); await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const capture = await observeTransitions(page);
  for (const name of ['NAVIGATION', 'DOCK / STATION', 'FIELD MANUAL', 'CREW', 'SHIP', 'JOURNAL 0/3', 'Settings']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused();
    await expect(page.locator('.deck-content')).toHaveAttribute('inert', '');
    await closeDialog(page);
    await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  }
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Active scan', exact: true }).click();
  await page.getByRole('button', { name: 'Launch probe · 5 CR', exact: true }).click();
  const rejection = await page.locator('.dialog-footer').innerText();
  await page.screenshot({ path: info.outputPath('navigation-single-close.png') });
  const duplicate = await page.getByRole('button', { name: 'Return to live simulation', exact: true }).count();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Saved expeditions', exact: true }).click();
  await closeDialog(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'New expedition', exact: true }).click();
  await closeDialog(page);
  await page.getByRole('button', { name: /RESUME/ }).click();
  await page.getByRole('button', { name: 'NAVIGATION', exact: true }).click();
  const scan = await page.locator('.operation-banner').innerText();
  await page.waitForTimeout(300);
  expect(await page.locator('.operation-banner').innerText()).toBe(scan);
  await closeDialog(page);
  await expect(page.locator('.pause-stack .pause-button')).not.toHaveClass(/paused/);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Abandon expedition', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Expedition debrief', exact: true })).toBeVisible();
  const samples = await capture.evaluate(observer => observer.stop()); await capture.dispose();
  await writeFile(info.outputPath('overlay-opacity-samples.json'), JSON.stringify(samples));
  expect(samples.length).toBeGreaterThan(5);
  expect(samples.filter(sample => sample.fade !== null).length, 'Full-screen fade samples while using overlays').toBe(0);
  expect(samples.every(sample => sample.deckOpacity === 1 && sample.sceneOpacity === 1)).toBe(true);
  expect(duplicate).toBe(0);
  expect(rejection).toContain('operation is already in progress');
});

test('real scene changes retain full-viewport exit and entry opacity while reduced motion omits fades', async ({ page }, info) => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/');
    await page.getByRole('button', { name: 'New Game', exact: true }).click();
    const savedCount = (await savedSnapshots(page)).length;
    const capture = await observeTransitions(page);
    await page.getByRole('button', { name: 'Begin Expedition', exact: true }).dblclick();
    await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
    expect(await savedSnapshots(page)).toHaveLength(savedCount + 1);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Return to main menu', exact: true }).click();
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    await continueExpedition(page);
    const samples = await capture.evaluate(observer => observer.stop()); await capture.dispose();
    await writeFile(info.outputPath(`scene-opacity-${reducedMotion}.json`), JSON.stringify(samples));
    const fades = samples.filter(sample => sample.fade !== null), viewport = page.viewportSize()!;
    if (reducedMotion === 'reduce') expect(fades).toEqual([]);
    else {
      expect(fades.some(sample => sample.fade!.includes('fade-out'))).toBe(true);
      expect(fades.some(sample => sample.fade!.includes('fade-in'))).toBe(true);
      expect(Math.max(...fades.map(sample => sample.opacity))).toBeGreaterThanOrEqual(.95);
      expect(fades.some(sample => sample.opacity > .05 && sample.opacity < .95)).toBe(true);
      expect(fades.every(sample => sample.width === viewport.width && sample.height === viewport.height)).toBe(true);
    }
    await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  }
});

test('selected survey mission can be completed through real travel and field operations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Game', exact: true }).click();
  await page.getByRole('button', { name: /Planetary Survey/ }).click();
  await page.getByRole('button', { name: 'Begin Expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction' }).click();
  await page.getByRole('button', { name: 'NAVIGATION', exact: true }).click();
  await page.locator('#course-s0-planet0').getByRole('button', { name: 'SET COURSE', exact: true }).click();
  await expect(page.locator('.location-strip')).toContainText('Helios I');
  await page.getByRole('button', { name: 'OPERATIONS', exact: true }).click();
  await page.getByRole('button', { name: 'Investigate location', exact: true }).click();
  await expect(page.locator('.event-feed')).toContainText('survey', { timeout: 60000 });
  await expect(page.locator('.operation-banner')).toHaveCount(0, { timeout: 60000 });
  await page.getByRole('button', { name: 'OPERATIONS', exact: true }).click();
  const mission = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Planetary survey', exact: true }) });
  await mission.getByRole('button', { name: 'Claim completion', exact: true }).click();
  await expect(page.locator('.dialog-footer')).toContainText('Planetary survey complete. Reward');
  await expect(mission).toHaveCount(0);
  await closeDialog(page);
  await page.keyboard.press('f');
  await expect(page.locator('.command-feedback')).toContainText('saved and verified');
  await page.reload();
  await continueExpedition(page);
  await page.getByRole('button', { name: /JOURNAL/ }).click();
  await expect(page.getByRole('dialog')).toContainText('1 contracts completed');
});
