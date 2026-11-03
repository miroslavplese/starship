import { expect, test } from '@playwright/test';
import { closeDialog, beginExpedition, continueExpedition } from './journeys';
import { encode } from '../../src/game/persistence';
import { command, createGame, step } from '../../src/sim/game';

for (const failure of ['hull', 'crew'] as const) {
  test(`physical ${failure} loss persists a terminal defeat through actual controls`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = createGame(12345);
    if (failure === 'hull') {
      expect(command(state, { type: 'travel', destination: 's0-pirate', system: false }).ok).toBe(true);
      for (let tick = 0; tick < 140; tick++) step(state);
      state.ships[0].hull = 0.001;
      state.ships[0].shields = 0;
      state.ships[0].shieldProgress = 0;
      state.ships[0].armor = { bow: 0, stern: 0, port: 0, starboard: 0 };
      for (const system of state.ships[0].systems) if (system.kind === 'engines' || system.kind === 'shields') system.power = 0;
      for (const ship of state.ships) ship.weapons = [];
      state.projectiles = [{
        id: 'terminal-projectile', source: state.ships[1].id, target: 'player',
        room: state.ships[0].rooms[0].id, family: 'missile', remaining: 1, total: 1,
      }];
    } else {
      for (const room of state.ships[0].rooms) room.oxygen = 0;
      state.ships[0].systems.find(system => system.kind === 'oxygen')!.power = 0;
      for (const crew of state.crew) crew.health = 0.01;
    }
    await page.goto('/');
    await beginExpedition(page);
    await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Import expedition', { exact: true }).setInputFiles({
      name: `${failure}-emergency.json`, mimeType: 'application/json', buffer: Buffer.from(encode(state)),
    });
    await expect(page.getByRole('dialog', { name: 'settings', exact: true })).toContainText('Imported validated run');
    await closeDialog(page);
    await page.getByRole('button', { name: /RESUME/ }).click();
    await expect(page.getByRole('dialog', { name: 'Expedition debrief', exact: true })).toContainText('SIGNAL LOST');
    const bytes = await page.evaluate(() => localStorage.getItem('starship.save.v1'));
    expect(bytes).not.toBeNull();
    const envelope: { payload: string } = JSON.parse(bytes!);
    const ended: typeof state = JSON.parse(envelope.payload);
    expect(ended.phase).toBe('defeat');
    expect(ended.tick).toBeGreaterThan(state.tick);
    if (failure === 'hull') expect(ended.ships[0].hull).toBe(0);
    else expect(ended.crew.every(crew => crew.health === 0)).toBe(true);
    await page.reload();
    await continueExpedition(page);
    await expect(page.getByRole('dialog', { name: 'Expedition debrief', exact: true })).toContainText('SIGNAL LOST');
    expect(errors).toEqual([]);
  });
}
