import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../../src/sim/types';
import { createGame } from '../../src/sim/game';
import { encode } from '../../src/game/persistence';
import { closeDialog, beginExpedition, continueExpedition, savedLibraryBytes, savedSnapshots, importExpeditionFile } from './journeys';

const currentKey = 'starship.save.v1', previousKey = 'starship.previous.v1';
const feedback = (page: Page) => page.getByRole('dialog', { name: 'settings', exact: true }).getByRole('status');

async function startAndSave(page: Page) {
  await page.goto('/'); await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Save expedition/ }).click();
  await expect(feedback(page)).toContainText('saved and verified');
  return (await savedSnapshots(page))[0].snapshot;
}
async function downloadText(page: Page, name: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
  const path = await download.path(); if (!path) throw new Error('Export did not produce a readable download.');
  return readFile(path, 'utf8');
}
const exportRun = (page: Page) => downloadText(page, 'Download save file');
function envelope(payload: string) {
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) hash = Math.imul(hash ^ payload.charCodeAt(i), 16777619);
  return JSON.stringify({ schema: 1, checksum: (hash >>> 0).toString(16), payload });
}

test('invalid imports preserve the live expedition and every independent saved copy', async ({ page }) => {
  const bytes = await startAndSave(page), before = await savedLibraryBytes(page);
  const original: { payload: string } = JSON.parse(bytes), state: GameState = JSON.parse(original.payload);
  const duplicate = structuredClone(state); duplicate.crew.push(structuredClone(duplicate.crew[0]));
  const broken = structuredClone(state); broken.crew[0].room = 'missing-room';
  const outOfBounds = structuredClone(state); outOfBounds.crew[0].health = 101;
  const unknownCargo = structuredClone(state); unknownCargo.ships[0].cargo['unknown-commodity'] = 1;
  const unknownModule = structuredClone(state); unknownModule.ships[0].modules.push('unknown-upgrade');
  const nonfinite = original.payload.replace(/"tick":\d+/, '"tick":1e309'); expect(nonfinite).not.toBe(original.payload);
  const cases = [
    { name: 'malformed', bytes: '{' },
    { name: 'unknown-envelope', bytes: bytes.replace('"schema":1', '"schema":99') },
    { name: 'unknown-content', bytes: envelope(JSON.stringify({ ...state, contentVersion: 99 })) },
    { name: 'bad-checksum', bytes: JSON.stringify({ schema: 1, checksum: 'invalid', payload: original.payload }) },
    { name: 'nonfinite', bytes: envelope(nonfinite) },
    { name: 'duplicate-identities', bytes: envelope(JSON.stringify(duplicate)) },
    { name: 'broken-reference', bytes: envelope(JSON.stringify(broken)) },
    { name: 'out-of-bounds', bytes: envelope(JSON.stringify(outOfBounds)) },
    { name: 'unknown-commodity', bytes: envelope(JSON.stringify(unknownCargo)) },
    { name: 'unknown-upgrade', bytes: envelope(JSON.stringify(unknownModule)) },
    ...['constructor', 'toString', '__proto__'].map(module => ({
      name: `inherited-queued-upgrade-${module}`,
      bytes: envelope(JSON.stringify({ ...state, queue: [{ type: 'upgrade', module }], queueMeta: [{ tick: state.tick, sequence: state.sequence }] })),
    })),
    { name: 'oversized', bytes: 'x'.repeat(1048577) },
  ];
  for (const fixture of cases) await test.step(fixture.name, async () => {
    await page.getByLabel('Import expedition', { exact: true }).setInputFiles({ name: `${fixture.name}.json`, mimeType: 'application/json', buffer: Buffer.from(fixture.bytes) });
    await expect(feedback(page)).toContainText('Import failed:'); await expect(feedback(page)).toContainText('Live run retained');
    expect(await exportRun(page)).toBe(bytes); expect(await savedLibraryBytes(page)).toEqual(before);
  });
});

test('separate same-seed expeditions, selected loading and autosaves never overwrite another campaign', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Main menu', exact: true })).not.toContainText('Command the Wayfarer. Discover what remains');
  await beginExpedition(page); await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  const first = (await savedSnapshots(page))[0];
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'New expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Begin Expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  let saves = await savedSnapshots(page); expect(saves).toHaveLength(2);
  const second = saves.find(saved => saved.key !== first.key)!;
  expect(second.snapshot).toBe(first.snapshot); expect(second.name).not.toBe(first.name);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'New expedition', exact: true }).click();
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await page.getByLabel('EXPEDITION SEED', { exact: true }).fill('222');
  await expect(page.getByLabel('EXPEDITION SEED', { exact: true })).toHaveValue('222');
  await page.getByRole('button', { name: /Planetary Survey/ }).click();
  await page.getByRole('button', { name: 'Begin Expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  saves = await savedSnapshots(page); expect(saves).toHaveLength(3);
  const third = saves.find(saved => saved.key !== first.key && saved.key !== second.key)!;
  await page.reload(); await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  const list = page.locator('.saved-games > .saved-list');
  await expect(list.locator('article')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^(Save expedition|Continue|Restore)/ })).toHaveCount(0);
  await expect(list).toContainText('Planetary survey'); await expect(list).toContainText('Seed 222');
  await page.screenshot({ path: info.outputPath('independent-expeditions.png') });
  await list.locator(`article[data-save-key="${first.key}"]`).getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  await page.getByRole('button', { name: 'Increase medbay power', exact: true }).click();
  await page.keyboard.press('f'); await expect(page.locator('.command-feedback')).toContainText('saved and verified');
  expect((await savedSnapshots(page)).find(saved => saved.key === second.key)!.raw).toBe(second.raw);
  expect((await savedSnapshots(page)).find(saved => saved.key === third.key)!.raw).toBe(third.raw);
  await page.getByRole('button', { name: /SAFE SPEED/ }).click(); await page.getByRole('button', { name: /SAFE SPEED/ }).click();
  await page.getByRole('button', { name: /RESUME/ }).click();
  await expect.poll(async () => JSON.parse(JSON.parse((await savedSnapshots(page)).find(saved => saved.key === first.key)!.snapshot).payload).tick, { timeout: 60000 }).toBeGreaterThanOrEqual(600);
  await page.locator('.pause-stack .pause-button').click();
  expect((await savedSnapshots(page)).find(saved => saved.key === second.key)!.raw).toBe(second.raw);
  expect((await savedSnapshots(page)).find(saved => saved.key === third.key)!.raw).toBe(third.raw);
});

test('legacy current and previous migrate intact, honestly dated, and backup loading creates a separate expedition', async ({ page }, info) => {
  const state = createGame(12345); state.tick = 1203; const current = encode(state);
  state.tick = 603; const previous = encode(state);
  await page.goto('/');
  await page.evaluate(({ current, previous }) => { localStorage.setItem('starship.save.v1', current); localStorage.setItem('starship.previous.v1', previous); }, { current, previous });
  const before = await savedLibraryBytes(page);
  await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  const list = page.locator('.saved-games > .saved-list');
  await expect(list.locator('article')).toHaveCount(1); await expect(list).toContainText('Saved time not recorded');
  await page.locator('.save-recovery > summary').click();
  await expect(page.locator('.save-recovery .saved-list article')).toHaveCount(1);
  expect(await savedLibraryBytes(page)).toEqual(before);
  await page.screenshot({ path: info.outputPath('legacy-recovery.png') });
  await list.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  let saves = await savedSnapshots(page);
  const primary = saves.find(saved => JSON.parse(JSON.parse(saved.snapshot).payload).tick === 1203)!;
  expect(primary.savedAt).toBeNull();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Saved expeditions', exact: true }).click();
  await page.locator('.save-recovery > summary').click();
  await page.getByRole('button', { name: 'Load recovery copy', exact: true }).click();
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  saves = await savedSnapshots(page); const recovered = saves.find(saved => saved.key !== primary.key && !JSON.parse(saved.raw).source.includes('legacy'))!;
  expect(JSON.parse(JSON.parse(recovered.snapshot).payload).tick).toBe(603);
  await page.getByRole('button', { name: 'Increase medbay power', exact: true }).click(); await page.keyboard.press('f');
  await expect(page.locator('.command-feedback')).toContainText('saved and verified');
  expect((await savedSnapshots(page)).find(saved => saved.key === primary.key)!.raw).toBe(primary.raw);
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [currentKey, previousKey])).toEqual([current, previous]);
  const migratedBytes = await savedLibraryBytes(page);
  await page.reload(); await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  expect(await savedLibraryBytes(page)).toEqual(migratedBytes);
});

test('a damaged current copy keeps its exact bytes while its backup recovers independently and exports for recovery', async ({ page }, info) => {
  await startAndSave(page); await closeDialog(page);
  await page.getByRole('button', { name: 'Increase medbay power', exact: true }).click(); await page.keyboard.press('f');
  await expect(page.locator('.command-feedback')).toContainText('saved and verified');
  const original = (await savedSnapshots(page))[0];
  await page.evaluate(key => localStorage.setItem(key, '{corrupt-primary'), original.key);
  await page.reload(); await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  await expect(page.locator('.saved-games')).toContainText('Some saved data could not be read');
  await expect(page.getByRole('button', { name: /Remove unreadable|Confirm discard/ })).toHaveCount(0);
  await page.locator('.save-recovery > summary').click();
  const backup = JSON.parse(await downloadText(page, 'Download recovery backup'));
  expect(backup.entries).toContainEqual({ key: original.key, bytes: '{corrupt-primary' });
  await page.screenshot({ path: info.outputPath('damaged-copy-recovery.png') });
  await page.getByRole('button', { name: 'Load recovery copy', exact: true }).click();
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await page.keyboard.press('f'); await expect(page.locator('.command-feedback')).toContainText('saved and verified');
  expect(await page.evaluate(key => localStorage.getItem(key), original.key)).toBe('{corrupt-primary');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Saved expeditions', exact: true }).click();
  await page.locator('.save-recovery > summary').click();
  await page.getByLabel('Import recovery backup', { exact: true }).setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('.dialog-footer')).toContainText('Recovery complete:');
  await expect(page.locator('.dialog-footer')).toContainText('unreadable copies remain');
  const after = await savedLibraryBytes(page);
  await page.getByLabel('Import recovery backup', { exact: true }).setInputFiles({ name: 'recovery.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('.dialog-footer')).toContainText('0 separate expedition copies added');
  expect(await savedLibraryBytes(page)).toEqual(after);
});

test('empty Load hides irrelevant recovery and pause text but accepts a recovery file through the normal importer', async ({ page }, info) => {
  const state = createGame(12345); state.tick = 1203; const current = encode(state);
  state.tick = 603; const previous = encode(state);
  await page.goto('/'); await page.getByRole('button', { name: 'Load Game', exact: true }).click();
  await expect(page.locator('.empty-saves')).toContainText('No saved expeditions');
  await expect(page.locator('.save-recovery')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'load', exact: true })).not.toContainText('Interaction pause active');
  await expect(page.getByRole('button', { name: /^(Save expedition|Continue|Restore)/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('empty-load.png') });
  await importExpeditionFile(page, 'earlier-recovery-backup.json', JSON.stringify({ schema: 1, primary: current, previous, quarantined: null }));
  await expect(page.locator('.dialog-footer')).toContainText('2 separate expedition copies added');
  await expect(page.locator('.saved-games > .saved-list article')).toHaveCount(2);
  const saves = await savedSnapshots(page);
  expect(saves.map(saved => JSON.parse(JSON.parse(saved.snapshot).payload).tick).sort()).toEqual([1203, 603]);
  expect(saves.every(saved => saved.savedAt === null)).toBe(true);
});

test('quota and failed read-back never claim success or lose live progress and the per-expedition checkpoint', async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    let mode = '', readback = false;
    window.addEventListener('starship-test-storage-fault', event => { if (event instanceof CustomEvent) mode = event.detail; });
    const isCurrent = (key: string) => key.startsWith('starship.expedition.v1:') && !key.endsWith('.previous');
    Storage.prototype.setItem = function (name, value) {
      if (isCurrent(name) && mode === 'quota') { mode = ''; throw new DOMException('Test quota exhausted.', 'QuotaExceededError'); }
      set.call(this, name, value); if (isCurrent(name) && mode) readback = true;
    };
    Storage.prototype.getItem = function (name) {
      if (isCurrent(name) && readback) { const result = mode === 'missing' ? null : '{invalid-readback'; mode = ''; readback = false; return result; }
      return get.call(this, name);
    };
  });
  await startAndSave(page);
  for (const [i, fault] of ['quota', 'missing', 'invalid'].entries()) await test.step(fault, async () => {
    await closeDialog(page);
    await page.getByRole('button', { name: `${i % 2 ? 'Decrease' : 'Increase'} medbay power`, exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const live = await exportRun(page), prior = (await savedSnapshots(page))[0];
    await page.evaluate(mode => window.dispatchEvent(new CustomEvent('starship-test-storage-fault', { detail: mode })), fault);
    await page.getByRole('button', { name: /Save expedition/ }).click();
    await expect(feedback(page)).toContainText('Save failed:'); expect(await exportRun(page)).toBe(live);
    expect(await page.evaluate(key => localStorage.getItem(`${key}.previous`), prior.key)).toBe(prior.raw);
    if (fault === 'quota') expect(await page.evaluate(key => localStorage.getItem(key), prior.key)).toBe(prior.raw);
    await expect(page.getByRole('button', { name: 'Save current progress as a separate expedition', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Save expedition/ }).click();
    await expect(feedback(page)).toContainText('saved and verified');
  });
  const savedBeforeEnding = (await savedSnapshots(page))[0];
  await page.getByRole('button', { name: 'Abandon expedition', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('starship-test-storage-fault', { detail: 'quota' })));
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Expedition debrief', exact: true }).getByRole('alert')).toContainText('This ending could not be saved');
  expect(JSON.parse(JSON.parse(await downloadText(page, 'Export expedition record')).payload).phase).toBe('abandoned');
  expect((await savedSnapshots(page))[0].raw).toBe(savedBeforeEnding.raw);
});

test('captain pause survives overlapping modal and visibility changes without executing queued orders', async ({ page }) => {
  await startAndSave(page); await closeDialog(page);
  await page.getByRole('button', { name: /RESUME/ }).click(); await page.getByRole('button', { name: /PAUSE/ }).click();
  await page.getByRole('button', { name: 'Increase medbay power', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const before = await exportRun(page), paused: GameState = JSON.parse(JSON.parse(before).payload);
  expect(paused.userPaused).toBe(true); expect(paused.queue).toHaveLength(1);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(10000); expect(await exportRun(page)).toBe(before);
  await page.evaluate(() => { Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange')); });
  await closeDialog(page); await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); expect(await exportRun(page)).toBe(before);
  await closeDialog(page); await page.keyboard.press('f'); await page.reload(); await continueExpedition(page);
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); expect(await exportRun(page)).toBe(before);
  await closeDialog(page); await page.getByRole('button', { name: /RESUME/ }).click();
  await expect.poll(async () => {
    await page.keyboard.press('f'); const resumed: GameState = JSON.parse(JSON.parse((await savedSnapshots(page))[0].snapshot).payload);
    expect(resumed.userPaused).toBe(false); if (resumed.tick <= paused.tick) return false;
    expect(resumed.queue).toHaveLength(0);
    expect(resumed.ships[0].systems.find(s => s.kind === 'medbay')!.power).toBe(paused.ships[0].systems.find(s => s.kind === 'medbay')!.power + 1);
    return true;
  }).toBe(true);
});
