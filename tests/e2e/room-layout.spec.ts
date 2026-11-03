import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../../src/sim/game';
import { encode } from '../../src/game/persistence';
import { displayRoomBounds } from '../../src/render/layout';
import type { Ship, SystemKind } from '../../src/sim/types';
import { beginExpedition, savedSnapshots } from './journeys';

async function selectRoom(page: Page, ship: Ship, kind: SystemKind) {
  const room = ship.rooms.find(room => room.system === kind)!;
  const minX = Math.min(...ship.rooms.map(room => room.x)), minY = Math.min(...ship.rooms.map(room => room.y));
  const width = Math.max(...ship.rooms.map(room => room.x + room.w)) - minX;
  const height = Math.max(...ship.rooms.map(room => room.y + room.h)) - minY;
  const unit = Math.min(540 / width, 285 / height);
  const bounds = displayRoomBounds(room, { x: -(minX + width / 2) * unit, y: -(minY + height / 2) * unit, unit }, true);
  const box = (await page.locator('.tactical-scene canvas').boundingBox())!;
  const scale = Math.min(box.width / 1600, box.height / 600);
  const x = box.x + (box.width - 1600 * scale) / 2 + (580 + (bounds.x + bounds.w * .25) * .9) * scale;
  const y = box.y + (box.height - 600 * scale) / 2 + (292 + (bounds.y + bounds.h * .3) * .9) * scale;
  await page.mouse.click(x, y);
  const popup = page.getByRole('region', { name: `${room.name} crew orders`, exact: true });
  await expect(popup).toContainText(`Wayfarer / ${room.name}`);
  await expect(popup).toContainText(`${ship.systems.find(system => system.kind === kind)!.health.toFixed(1)} HP`);
  const anchor = (await popup.boundingBox())!;
  expect(anchor.x).toBeGreaterThanOrEqual(8); expect(anchor.y).toBeGreaterThanOrEqual(8);
  return { x, popup };
}

test('actual Wayfarer compartments and order hit targets match left exhaust and right bow', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 2263, height: 1462 });
  await page.goto('/'); await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await expect(page.locator('.tactical-scene')).toHaveAttribute('data-renderer-ready', 'true');
  await page.locator('.crew-card').nth(1).click();
  const ship = createGame(12345).ships[0], positions: Partial<Record<SystemKind, number>> = {};
  for (const kind of ['engines', 'reactor', 'cockpit', 'sensors', 'medbay', 'oxygen'] as const) {
    positions[kind] = (await selectRoom(page, ship, kind)).x;
    await page.keyboard.press('Escape');
  }
  expect(positions.engines).toBe(positions.reactor);
  expect(positions.cockpit).toBeGreaterThan(positions.sensors!);
  expect(positions.sensors).toBeGreaterThan(positions.oxygen!);
  expect(positions.oxygen).toBeGreaterThan(positions.engines!);
  await page.screenshot({ path: info.outputPath('wayfarer-aft-forward.png') });
  const { popup } = await selectRoom(page, ship, 'reactor');
  await page.screenshot({ path: info.outputPath('aft-reactor-orders.png') });
  await popup.getByRole('button', { name: 'repair', exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(page.locator('.command-feedback')).toContainText('Order queued (1)');
  await page.keyboard.press('f');
  await expect(page.locator('.command-feedback')).toContainText('saved and verified');
  const saved = JSON.parse(JSON.parse((await savedSnapshots(page))[0].snapshot).payload);
  expect(saved.queue[0]).toMatchObject({ crew: 'player-crew-2', room: 'player-reactor', task: 'repair' });
  expect(saved.ships[0].rooms).toEqual(ship.rooms);
  expect(errors).toEqual([]);
});

test('legacy geometry loads aft-correct with untouched sources, crew and queued room identities', async ({ page }, info) => {
  const state = createGame(12345); state.tick = 1203;
  state.queue = [{ type: 'crew', crew: 'player-crew-2', room: 'player-reactor', task: 'repair' }];
  state.queueMeta = [{ tick: state.tick, sequence: state.sequence }];
  const current = encode(state); const previousState = createGame(12345); previousState.tick = 603;
  const previous = encode(previousState);
  await page.goto('/');
  await page.evaluate(({ current, previous }) => { localStorage.setItem('starship.save.v1', current); localStorage.setItem('starship.previous.v1', previous); }, { current, previous });
  await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  await page.locator('.saved-games > .saved-list').getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  await expect(page.locator('.tactical-scene')).toHaveAttribute('data-renderer-ready', 'true');
  await page.locator('.crew-card').nth(1).click();
  const { popup } = await selectRoom(page, state.ships[0], 'reactor');
  await page.screenshot({ path: info.outputPath('legacy-aft-reactor.png') });
  await page.keyboard.press('Escape');
  const migrated = (await savedSnapshots(page)).find(save => JSON.parse(save.raw).source === 'legacy')!;
  expect(migrated.snapshot).toBe(current); expect(migrated.savedAt).toBeNull();
  await page.getByRole('button', { name: /RESUME/ }).click();
  await expect(page.locator('.crew-card').nth(1)).toContainText('REPAIR');
  await expect.poll(async () => {
    await page.keyboard.press('f');
    return JSON.parse(JSON.parse((await savedSnapshots(page)).find(save => save.key === migrated.key)!.snapshot).payload).crew[1].room;
  }).toBe('player-reactor');
  await page.locator('.pause-stack .pause-button').click();
  await page.keyboard.press('f'); await expect(page.locator('.command-feedback')).toContainText('saved and verified');
  const continued = JSON.parse(JSON.parse((await savedSnapshots(page)).find(save => save.key === migrated.key)!.snapshot).payload);
  expect(continued.crew[1].room).toBe('player-reactor'); expect(continued.queue).toHaveLength(0);
  expect(continued.ships[0].rooms.map((room: { id: string; x: number; y: number }) => [room.id, room.x, room.y])).toEqual(state.ships[0].rooms.map(room => [room.id, room.x, room.y]));
  expect(await page.evaluate(() => [localStorage.getItem('starship.save.v1'), localStorage.getItem('starship.previous.v1')])).toEqual([current, previous]);
  await expect(popup).toHaveCount(0);
});
