import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../../src/sim/types';

const currentKey = 'starship.save.v1';
const previousKey = 'starship.previous.v1';
const feedback = (page: Page) => page.getByRole('dialog', { name: 'settings', exact: true }).getByRole('status');

async function startAndSave(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Skip introduction', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Save expedition/ }).click();
  await expect(feedback(page)).toContainText('saved and verified');
  return page.evaluate(key => localStorage.getItem(key)!, currentKey);
}

async function exportRun(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export JSON', exact: true }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('Export did not produce a readable download.');
  return readFile(path, 'utf8');
}

function envelope(payload: string) {
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) hash = Math.imul(hash ^ payload.charCodeAt(i), 16777619);
  return JSON.stringify({ schema: 1, checksum: (hash >>> 0).toString(16), payload });
}

test('invalid imports preserve the live expedition and both known-good slots', async ({ page }) => {
  const bytes = await startAndSave(page);
  await page.getByRole('button', { name: /Save expedition/ }).click();
  const original: { payload: string } = JSON.parse(bytes);
  const state: GameState = JSON.parse(original.payload);
  const duplicate = structuredClone(state);
  duplicate.crew.push(structuredClone(duplicate.crew[0]));
  const broken = structuredClone(state);
  broken.crew[0].room = 'missing-room';
  const outOfBounds = structuredClone(state);
  outOfBounds.crew[0].health = 101;
  const nonfinite = original.payload.replace(/"tick":\d+/, '"tick":1e309');
  expect(nonfinite).not.toBe(original.payload);
  const cases = [
    { name: 'malformed', bytes: '{' },
    { name: 'unknown-envelope', bytes: bytes.replace('"schema":1', '"schema":99') },
    { name: 'unknown-content', bytes: envelope(JSON.stringify({ ...state, contentVersion: 99 })) },
    { name: 'bad-checksum', bytes: JSON.stringify({ schema: 1, checksum: 'invalid', payload: original.payload }) },
    { name: 'nonfinite', bytes: envelope(nonfinite) },
    { name: 'duplicate-identities', bytes: envelope(JSON.stringify(duplicate)) },
    { name: 'broken-reference', bytes: envelope(JSON.stringify(broken)) },
    { name: 'out-of-bounds', bytes: envelope(JSON.stringify(outOfBounds)) },
    { name: 'oversized', bytes: 'x'.repeat(1048577) },
  ];
  for (const fixture of cases) {
    await test.step(fixture.name, async () => {
      await page.getByLabel('Import expedition', { exact: true }).setInputFiles({
        name: `${fixture.name}.json`, mimeType: 'application/json', buffer: Buffer.from(fixture.bytes),
      });
      await expect(feedback(page)).toContainText('Import failed:');
      await expect(feedback(page)).toContainText('Live run retained');
      expect(await exportRun(page)).toBe(bytes);
      expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [currentKey, previousKey])).toEqual([bytes, bytes]);
    });
  }
});

test('a corrupt primary remains available for diagnostics while the previous run recovers paused', async ({ page }) => {
  const bytes = await startAndSave(page);
  await page.getByRole('button', { name: /Save expedition/ }).click();
  await page.evaluate(key => localStorage.setItem(key, '{corrupt-primary'), currentKey);
  await page.getByRole('button', { name: 'Load current slot', exact: true }).click();
  await expect(feedback(page)).toContainText('Load failed:');
  expect(await exportRun(page)).toBe(bytes);
  await page.getByRole('button', { name: 'Recover previous slot', exact: true }).click();
  await expect(feedback(page)).toContainText('Expedition loaded paused');
  expect(await exportRun(page)).toBe(bytes);
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [currentKey, previousKey])).toEqual(['{corrupt-primary', bytes]);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: /RESUME/ })).toBeVisible();
});

test('quota and failed read-back never claim success or lose the live run and previous slot', async ({ page }) => {
  await page.addInitScript(key => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    let mode = '';
    let readback = false;
    window.addEventListener('starship-test-storage-fault', event => {
      if (event instanceof CustomEvent && ['quota', 'missing', 'invalid'].includes(event.detail)) mode = event.detail;
    });
    Storage.prototype.setItem = function (name, value) {
      if (name === key && mode === 'quota') {
        mode = '';
        throw new DOMException('Test quota exhausted.', 'QuotaExceededError');
      }
      set.call(this, name, value);
      if (name === key && mode) readback = true;
    };
    Storage.prototype.getItem = function (name) {
      if (name === key && readback) {
        const result = mode === 'missing' ? null : '{invalid-readback';
        mode = '';
        readback = false;
        return result;
      }
      return get.call(this, name);
    };
  }, currentKey);
  await startAndSave(page);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Increase medbay power', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const live = await exportRun(page);
  for (const fault of ['quota', 'missing', 'invalid']) {
    await test.step(fault, async () => {
      const prior = await page.evaluate(key => localStorage.getItem(key), currentKey);
      await page.evaluate(mode => window.dispatchEvent(new CustomEvent('starship-test-storage-fault', { detail: mode })), fault);
      await page.getByRole('button', { name: /Save expedition/ }).click();
      await expect(feedback(page)).toContainText('Save failed:');
      expect(await exportRun(page)).toBe(live);
      expect(await page.evaluate(key => localStorage.getItem(key), previousKey)).toBe(prior);
      if (fault === 'quota') expect(await page.evaluate(key => localStorage.getItem(key), currentKey)).toBe(prior);
    });
  }
});
