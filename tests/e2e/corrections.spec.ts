import { expect, test, type Page } from '@playwright/test';
import { encode } from '../../src/game/persistence';
import { createGame } from '../../src/sim/game';
import { beginExpedition, closeDialog, dismissScreen } from './journeys';

async function sceneryRows(page: Page, image: Buffer) {
  return page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return [8, canvas.height - 12].map(y => {
      const colors = new Set<string>();
      for (let x = Math.floor(canvas.width * .35); x < canvas.width * .65; x += 4) {
        colors.add([...context.getImageData(x, y, 1, 1).data].join(','));
      }
      return colors.size;
    });
  }, image.toString('base64'));
}

async function clickWeaponsRoom(page: Page) {
  const ship = createGame(12345).ships.find(ship => ship.id === 'player')!;
  const room = ship.rooms.find(room => room.name === 'Weapons')!;
  const minX = Math.min(...ship.rooms.map(room => room.x)), minY = Math.min(...ship.rooms.map(room => room.y));
  const width = Math.max(...ship.rooms.map(room => room.x + room.w)) - minX;
  const height = Math.max(...ship.rooms.map(room => room.y + room.h)) - minY;
  const unit = Math.min(540 / width, 285 / height);
  const x = 580 + ((room.x - minX + room.w * .25) * unit - width * unit / 2) * .9;
  const y = 292 + ((room.y - minY + room.h * .3) * unit - height * unit / 2) * .9;
  const box = (await page.locator('.tactical-scene canvas').boundingBox())!;
  const scale = Math.min(box.width / 1600, box.height / 600);
  await page.mouse.click(box.x + (box.width - 1600 * scale) / 2 + x * scale, box.y + (box.height - 600 * scale) / 2 + y * scale);
  await expect(page.getByRole('region', { name: 'Weapons crew orders', exact: true })).toBeVisible();
}

test('player copy and automatically generated About metadata are save-safe', async ({ page, request }, info) => {
  await page.goto('/');
  await expect(page.getByText('A SHIP. A CREW. AN UNKNOWN HORIZON.', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('menu.png') });
  await page.getByRole('button', { name: 'About', exact: true }).click();
  const metadata = await (await request.get('/build-info.json')).json();
  const about = page.getByRole('dialog', { name: 'about', exact: true });
  await expect(about).toContainText('Miroslav Plese');
  await expect(about).toContainText(metadata.version);
  await expect(about).toContainText(metadata.build);
  await expect(about.locator('time')).toHaveAttribute('datetime', metadata.builtAt);
  await expect(about.locator('time')).toContainText('UTC');
  await expect(about.locator('.dialog-footer')).toHaveCount(0);
  await expect(about).not.toContainText('Interaction pause active');
  await page.screenshot({ path: info.outputPath('about.png') });
  await dismissScreen(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'settings', exact: true });
  await expect(settings).not.toContainText('Local persistence');
  await expect(settings.getByRole('heading', { name: 'Saved expedition', exact: true })).toHaveCount(0);
  await expect(settings.getByRole('heading', { name: 'Damaged save recovery', exact: true })).toHaveCount(0);
  await expect(settings.getByRole('heading', { name: 'Developer diagnostics', exact: true })).toHaveCount(0);
  await expect(settings.getByRole('combobox', { name: 'Tactical graphics quality' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('player-settings.png') });
  expect(await page.evaluate(() => localStorage.getItem('starship.save.v1'))).toBeNull();
});

test('developer feature flag off and on controls tools and actual rendered diagnostics', async ({ page, request }) => {
  const metadata = await (await request.get('/build-info.json')).json();
  expect(metadata.diagnostics).toBe(process.env.EXPECT_DIAGNOSTICS === '1');
  await page.addInitScript(() => localStorage.setItem('VITE_STARSHIP_DIAGNOSTICS', '1'));
  await page.goto('/?diagnostics=1&VITE_STARSHIP_DIAGNOSTICS=1');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: 'Show graphics diagnostics / frame rate', exact: true });
  if (metadata.diagnostics) {
    await expect(page.getByRole('heading', { name: 'Developer diagnostics', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export recovery diagnostics', exact: true })).toBeVisible();
    await checkbox.check();
  } else {
    await expect(checkbox).toHaveCount(0);
    await expect(page.locator('.developer-diagnostics')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export recovery diagnostics', exact: true })).toHaveCount(0);
  }
  await closeDialog(page);
  await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction' }).click();
  await expect(page.locator('.tactical-scene')).toHaveAttribute('data-renderer-ready', 'true');
  const fps = page.getByTestId('tactical-rendered-fps');
  if (metadata.diagnostics) {
    await expect(fps).toBeVisible();
    await expect(fps).not.toHaveAttribute('data-render-state', 'measuring');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await checkbox.uncheck();
    await closeDialog(page);
  }
  await expect(fps).toHaveCount(0);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 1080 }, { width: 2263, height: 1462 }]) {
  test(`scene fills HUD, equal toolbar, overlaid log and room order acceptance at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    const fixture = createGame(12345);
    fixture.events = Array.from({ length: 40 }, (_, id) => ({ id: id + 1, tick: 0, kind: 'order', message: `Crew inspection ${id + 1}: all expedition systems ready.` }));
    fixture.nextId = Math.max(fixture.nextId, 41);
    await page.goto('/');
    await page.getByRole('button', { name: 'Load Game', exact: true }).click();
    await page.getByLabel('Import expedition').setInputFiles({ name: 'log-fixture.json', mimeType: 'application/json', buffer: Buffer.from(encode(fixture)) });
    await expect(page.locator('.dialog-footer')).toContainText('Imported validated run, paused.');
    await closeDialog(page);
    await expect(page.locator('.tactical-scene')).toHaveAttribute('data-renderer-ready', 'true');
    const buttons = page.locator('.command-icons button');
    await expect(buttons).toHaveCount(5);
    for (const button of await buttons.all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBe(48); expect(box.height).toBe(48);
    }
    const scene = (await page.locator('.tactical-area').boundingBox())!;
    const canvas = (await page.locator('.tactical-scene canvas').boundingBox())!;
    const header = (await page.locator('.telemetry').boundingBox())!;
    const footer = (await page.locator('.instruments').boundingBox())!;
    const log = page.getByRole('complementary', { name: 'Ship log', exact: true });
    const logBox = (await log.boundingBox())!;
    expect(scene.y).toBeCloseTo(header.y + header.height, 0);
    expect(canvas.y).toBeCloseTo(scene.y, 0);
    expect(canvas.height).toBeCloseTo(scene.height, 0);
    expect(footer.y).toBeCloseTo(scene.y + scene.height, 0);
    expect((await page.locator('.systems-panel').boundingBox())!.y - footer.y).toBeLessThanOrEqual(16);
    expect(logBox.y).toBeGreaterThanOrEqual(scene.y + 40);
    expect(logBox.y + logBox.height).toBeLessThanOrEqual(scene.y + scene.height - 8);
    expect(logBox.x + logBox.width).toBeLessThanOrEqual(scene.x + scene.width - 12);
    expect(await log.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    await log.hover();
    expect(await page.locator('.tactical-area').boundingBox()).toEqual(scene);
    expect(await page.locator('.telemetry').boundingBox()).toEqual(header);
    expect(await page.locator('.instruments').boundingBox()).toEqual(footer);
    await log.press('PageDown');
    await expect.poll(() => log.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await log.press('Home');
    await expect.poll(() => log.evaluate(node => node.scrollTop)).toBe(0);
    const pixels = await page.locator('.tactical-scene canvas').screenshot();
    for (const colors of await sceneryRows(page, pixels)) expect(colors, 'Actual scenery must fill both former uniform letterbox bands').toBeGreaterThan(12);
    await page.screenshot({ path: info.outputPath('hud-log.png') });
    await page.locator('.crew-card').nth(1).click();
    await clickWeaponsRoom(page);
    await page.screenshot({ path: info.outputPath('room-orders.png') });
    await page.getByRole('button', { name: 'repair', exact: true }).click();
    await expect(page.locator('.room-inspector')).toHaveCount(0);
    await expect(page.locator('.command-feedback')).toContainText('Order queued (1)');
    await expect(page.locator('.crew-card.selected')).toBeFocused();
    await clickWeaponsRoom(page);
    await page.getByRole('button', { name: 'sabotage', exact: true }).click();
    await expect(page.locator('.room-inspector')).toBeVisible();
    await expect(page.locator('.command-feedback')).toContainText('Sabotage requires a hostile ship.');
    await page.keyboard.press('Escape');
    await expect(page.locator('.room-inspector')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
