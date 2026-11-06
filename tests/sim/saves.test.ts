import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/game/controller';
import { CORRUPT_KEY, PREVIOUS_KEY, SAVE_KEY, decode, encode } from '../../src/game/persistence';
import { createSavedExpedition, exportSaveBackup, importSaveBackup, loadSavedExpedition, migrateLegacySaves, readSaveLibrary, updateSavedExpedition } from '../../src/game/saves';
import { createGame } from '../../src/sim/game';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, clear() { values.clear(); },
    getItem: key => values.get(key) ?? null, key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key); }, setItem: (key, value) => { values.set(key, value); },
  };
}
function legacy(storage: Storage) {
  const state = createGame(12345); state.tick = 1203;
  const current = JSON.stringify(JSON.parse(encode(state)), null, 2);
  state.tick = 603; const previous = encode(state);
  storage.setItem(SAVE_KEY, current); storage.setItem(PREVIOUS_KEY, previous);
  return { current, previous };
}

describe('independent saved expeditions', () => {
  it('loads legacy identified contacts without normalizing source bytes or losing earned data', () => {
    const storage = memoryStorage(), state = createGame(12345);
    state.region[0].locations.forEach(location => { location.known = 3; });
    state.discoveries.push('route:s0', 'intercept:s0-station');
    state.soldData.push('route:s0'); state.rewards.push('approach:s0-signal0');
    const source = JSON.stringify(JSON.parse(encode(state)), null, 2);
    storage.setItem(SAVE_KEY, source);
    const api = new GameController(9, storage);
    expect(api.load(SAVE_KEY).ok).toBe(true);
    expect(api.state).toEqual(state); expect(storage.getItem(SAVE_KEY)).toBe(source);
    expect(api.persist().ok).toBe(true);
    expect(api.state).toEqual(state); expect(storage.getItem(SAVE_KEY)).toBe(source);
    expect(decode(readSaveLibrary(storage).saves[0].snapshot)).toEqual(state);
    expect(readSaveLibrary(storage).backups.some(entry => entry.snapshot === source)).toBe(true);
  });
  it('browses empty and legacy saves without writing or inventing saved times', () => {
    const storage = memoryStorage();
    expect(readSaveLibrary(storage)).toEqual({ saves: [], backups: [], issues: [] });
    const bytes = legacy(storage), before = exportSaveBackup(storage);
    const library = readSaveLibrary(storage);
    expect(library.saves[0]).toMatchObject({ snapshot: bytes.current, savedAt: null, importedAt: null, createdAt: null });
    expect(library.backups[0].snapshot).toBe(bytes.previous);
    expect(exportSaveBackup(storage)).toBe(before);
  });
  it('migrates both legacy snapshots exactly, idempotently and without removing source bytes', () => {
    const storage = memoryStorage(), bytes = legacy(storage);
    migrateLegacySaves(storage);
    const before = exportSaveBackup(storage);
    migrateLegacySaves(storage); migrateLegacySaves(storage);
    expect(exportSaveBackup(storage)).toBe(before);
    const library = readSaveLibrary(storage);
    expect(library.saves).toHaveLength(1); expect(library.backups).toHaveLength(1);
    expect(library.saves[0].snapshot).toBe(bytes.current);
    expect(library.backups[0].snapshot).toBe(bytes.previous);
    expect(library.saves[0].savedAt).toBeNull(); expect(library.backups[0].savedAt).toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBe(bytes.current); expect(storage.getItem(PREVIOUS_KEY)).toBe(bytes.previous);
    const active = loadSavedExpedition(library.saves[0].key, storage);
    active.state.tick = 1500; const updated = updateSavedExpedition(active, active.state, storage);
    updated.state.tick = 1800; updateSavedExpedition(updated, updated.state, storage);
    expect(readSaveLibrary(storage).backups.some(entry => entry.snapshot === bytes.current)).toBe(true);
    const size = storage.length; migrateLegacySaves(storage); expect(storage.length).toBe(size);
  });
  it('retries a partially failed migration without duplicating already verified copies', () => {
    const storage = memoryStorage(), bytes = legacy(storage), write = storage.setItem;
    let fail = true;
    storage.setItem = (key, value) => {
      if (fail && value.includes('"source":"legacy-backup"')) { fail = false; throw new Error('Quota exhausted'); }
      write(key, value);
    };
    expect(() => migrateLegacySaves(storage)).toThrow('Quota');
    expect(readSaveLibrary(storage).saves).toHaveLength(1);
    expect(storage.getItem(SAVE_KEY)).toBe(bytes.current); expect(storage.getItem(PREVIOUS_KEY)).toBe(bytes.previous);
    migrateLegacySaves(storage);
    expect(storage.length).toBe(4);
    expect(readSaveLibrary(storage).backups).toHaveLength(1);
  });
  it('keeps damaged and oversized legacy sources while creating usable independent saves', () => {
    const storage = memoryStorage(), bytes = legacy(storage), damaged = 'x'.repeat(1048577);
    storage.setItem(SAVE_KEY, damaged); storage.setItem(CORRUPT_KEY, '{quarantined');
    createSavedExpedition(createGame(5), 'new', storage);
    const library = readSaveLibrary(storage);
    expect(library.saves).toHaveLength(1); expect(library.backups).toHaveLength(1); expect(library.issues).toHaveLength(2);
    expect(storage.getItem(SAVE_KEY)).toBe(damaged); expect(storage.getItem(CORRUPT_KEY)).toBe('{quarantined');
    expect(storage.getItem(PREVIOUS_KEY)).toBe(bytes.previous);
    expect(exportSaveBackup(storage)).toContain('{quarantined');
  });
  it('allocates distinct identities for identical same-seed new games and imports', () => {
    const storage = memoryStorage(), state = createGame(12345);
    const a = createSavedExpedition(state, 'new', storage), b = createSavedExpedition(state, 'new', storage), c = createSavedExpedition(decode(a.snapshot), 'import', storage);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    expect(new Set([a.name, b.name, c.name]).size).toBe(3);
    expect(a.snapshot).toBe(b.snapshot); expect(c.savedAt).toBeNull(); expect(c.importedAt).not.toBeNull();
    expect(readSaveLibrary(storage).saves).toHaveLength(3);
    a.state.tick = 600; updateSavedExpedition(a, a.state, storage);
    expect(storage.getItem(b.key)).toBe(b.raw); expect(storage.getItem(c.key)).toBe(c.raw);
    expect(readSaveLibrary(storage).backups).toHaveLength(1);
  });
  it('keeps independent current and previous checkpoints when alternating expeditions', () => {
    const storage = memoryStorage(), api = new GameController(1, storage);
    expect(api.startExpedition(createGame(1)).ok).toBe(true); const a = api.saved!;
    api.state.tick = 610;
    expect(api.startExpedition(createGame(2)).ok).toBe(true); const b = api.saved!;
    expect(readSaveLibrary(storage).saves.find(entry => entry.id === a.id)!.state.tick).toBe(610);
    api.state.tick = 700; expect(api.persist().ok).toBe(true); const bRaw = api.saved!.raw;
    expect(api.load(a.key).ok).toBe(true); expect(api.paused).toBe(true); expect(api.state.tick).toBe(610);
    api.state.tick = 1210; expect(api.persist().ok).toBe(true);
    expect(storage.getItem(b.key)).toBe(bRaw);
    expect(readSaveLibrary(storage).backups.find(entry => entry.id === a.id)!.state.tick).toBe(610);
    expect(readSaveLibrary(storage).backups.find(entry => entry.id === b.id)!.state.tick).toBe(0);
  });
  it('recovers the selected checkpoint, not a backup rotated while preserving live progress', () => {
    const storage = memoryStorage(), api = new GameController(1, storage);
    api.startExpedition(createGame(1)); const original = api.saved!;
    api.state.tick = 10; api.persist(); api.state.tick = 20; api.persist(); api.state.tick = 30;
    expect(api.load(`${original.key}.previous`).ok).toBe(true);
    expect(api.state.tick).toBe(10); expect(api.saved!.id).not.toBe(original.id); expect(api.paused).toBe(true);
    const originalRaw = storage.getItem(original.key);
    expect(readSaveLibrary(storage).saves.find(entry => entry.id === original.id)!.state.tick).toBe(30);
    api.state.tick = 11; api.persist();
    expect(storage.getItem(original.key)).toBe(originalRaw);
  });
  it('never promotes a practice drill or loses its original save routing', () => {
    const storage = memoryStorage(), api = new GameController(1, storage);
    api.startExpedition(createGame(1)); const original = api.saved!, state = structuredClone(api.state);
    api.training = true; api.replace(createGame(99));
    expect(api.persist().ok).toBe(false); expect(api.startExpedition(createGame(3)).ok).toBe(false);
    api.saveSeparateCopy(); expect(readSaveLibrary(storage).saves).toHaveLength(1);
    api.replace(state); api.training = false; api.state.tick = 600; expect(api.persist().ok).toBe(true);
    expect(api.saved!.id).toBe(original.id); expect(readSaveLibrary(storage).saves[0].state.seed).toBe(1);
  });
  it.each(['quota', 'missing', 'invalid'])('reports %s failures, keeping live state and the last good checkpoint', mode => {
    const storage = memoryStorage(), api = new GameController(1, storage);
    api.startExpedition(createGame(1)); const original = api.saved!, write = storage.setItem, read = storage.getItem;
    let readback = false;
    storage.setItem = (key, value) => {
      if (key === original.key && mode === 'quota') throw new Error('Quota exhausted');
      write(key, value); if (key === original.key) readback = true;
    };
    storage.getItem = key => key === original.key && readback ? (mode === 'missing' ? null : '{truncated') : read(key);
    api.state.tick = 600; const live = encode(api.state);
    expect(api.persist().ok).toBe(false); expect(api.message).toMatch(/Save failed/); expect(api.saveIssue).toBe(true);
    expect(encode(api.state)).toBe(live); expect(read(`${original.key}.previous`)).toBe(original.raw);
    if (mode === 'quota') expect(read(original.key)).toBe(original.raw);
  });
  it('does not overwrite current bytes when backup read-back fails', () => {
    const storage = memoryStorage(), entry = createSavedExpedition(createGame(1), 'new', storage), write = storage.setItem;
    storage.setItem = (key, value) => write(key, key.endsWith('.previous') ? '{truncated' : value);
    entry.state.tick = 600;
    expect(() => updateSavedExpedition(entry, entry.state, storage)).toThrow(/verified/);
    expect(storage.getItem(entry.key)).toBe(entry.raw);
    expect(readSaveLibrary(storage).issues).toHaveLength(1);
  });
  it('retains damaged per-expedition backup bytes before replacing that checkpoint', () => {
    const storage = memoryStorage(), entry = createSavedExpedition(createGame(1), 'new', storage);
    storage.setItem(`${entry.key}.previous`, '{damaged-backup'); entry.state.tick = 600;
    updateSavedExpedition(entry, entry.state, storage);
    expect(exportSaveBackup(storage)).toContain('{damaged-backup');
    expect(readSaveLibrary(storage).issues).toHaveLength(1);
    expect(readSaveLibrary(storage).backups[0].snapshot).toBe(entry.snapshot);
  });
  it('keeps another window’s newer save and offers separate-copy routing for stale live progress', () => {
    const storage = memoryStorage(), api = new GameController(1, storage);
    api.startExpedition(createGame(1)); const stale = api.saved!;
    const other = structuredClone(stale.state); other.tick = 400;
    const newer = updateSavedExpedition(stale, other, storage);
    api.state.tick = 200;
    expect(api.persist().ok).toBe(false); expect(api.message).toMatch(/another window/);
    expect(api.startExpedition(createGame(2)).ok).toBe(false); expect(api.state.tick).toBe(200);
    api.saveSeparateCopy();
    expect(api.saved!.id).not.toBe(stale.id);
    expect(storage.getItem(stale.key)).toBe(newer.raw);
    expect(readSaveLibrary(storage).saves.map(entry => entry.state.tick).sort()).toEqual([200, 400]);
    api.state.tick = 300; expect(api.persist().ok).toBe(true); expect(storage.getItem(stale.key)).toBe(newer.raw);
  });
  it('refuses unsafe switching on write failure, retaining the active run and rejecting invalid imports before mutation', () => {
    const storage = memoryStorage(), api = new GameController(1, storage);
    api.startExpedition(createGame(1)); const originalId = api.saved!.id;
    api.state.tick = 600; const before = exportSaveBackup(storage), state = encode(api.state);
    expect(api.importExpedition('{invalid').ok).toBe(false); expect(exportSaveBackup(storage)).toBe(before);
    storage.setItem = () => { throw new Error('Quota'); };
    expect(api.startExpedition(createGame(2)).ok).toBe(false); expect(api.importExpedition(encode(createGame(3))).ok).toBe(false);
    expect(api.saved!.id).toBe(originalId); expect(encode(api.state)).toBe(state); expect(exportSaveBackup(storage)).toBe(before);
  });
  it('preserves queued orders and manual pause across selected load and only advances on explicit resume', () => {
    const storage = memoryStorage(), api = new GameController(1, storage);
    api.startExpedition(createGame(1)); const key = api.saved!.key;
    api.state.userPaused = true;
    expect(api.dispatch({ type: 'power', ship: 'player', system: 'medbay', delta: 1 }).ok).toBe(true);
    api.persist(); const snapshot = api.saved!.snapshot;
    const reloaded = new GameController(1, storage);
    expect(reloaded.load(key).ok).toBe(true); reloaded.advance(100);
    expect(encode(reloaded.state)).toBe(snapshot); expect(reloaded.state.queue).toHaveLength(1); expect(reloaded.state.userPaused).toBe(true);
    reloaded.togglePause(); reloaded.advance(50);
    expect(reloaded.state.tick).toBe(1); expect(reloaded.state.queue).toHaveLength(0);
  });
  it('exports all original/damaged bytes and imports recovery copies idempotently without changing other expeditions', () => {
    const storage = memoryStorage(), bytes = legacy(storage);
    storage.setItem(CORRUPT_KEY, '{broken'); migrateLegacySaves(storage);
    let active = loadSavedExpedition(SAVE_KEY, storage); active.state.tick = 2000;
    active = updateSavedExpedition(active, active.state, storage);
    const backup = exportSaveBackup(storage), target = memoryStorage(), existing = createSavedExpedition(createGame(7), 'new', target);
    const result = importSaveBackup(backup, target);
    expect(result.added).toBeGreaterThanOrEqual(2); expect(result.unreadable).toBe(1);
    expect(storage.getItem(SAVE_KEY)).toBe(bytes.current); expect(target.getItem(existing.key)).toBe(existing.raw);
    expect(readSaveLibrary(target).saves.some(entry => entry.state.tick === 1203)).toBe(true);
    expect(readSaveLibrary(target).saves.some(entry => entry.state.tick === 603)).toBe(true);
    expect(readSaveLibrary(target).saves.some(entry => entry.state.tick === 2000)).toBe(true);
    const before = exportSaveBackup(target); expect(importSaveBackup(backup, target).added).toBe(0); expect(exportSaveBackup(target)).toBe(before);
  });
  it('understands older recovery downloads and reports unreadable files without modifying storage', () => {
    const storage = memoryStorage(), bytes = legacy(storage), target = memoryStorage();
    expect(importSaveBackup(JSON.stringify({ schema: 1, primary: bytes.current, previous: bytes.previous, quarantined: '{bad' }), target)).toEqual({ added: 2, unreadable: 1 });
    const before = exportSaveBackup(target);
    expect(() => importSaveBackup('{bad', target)).toThrow();
    expect(() => importSaveBackup(JSON.stringify({ schema: 1, primary: '{bad', previous: null, quarantined: '{also-bad' }), target)).toThrow(/No readable/);
    expect(exportSaveBackup(target)).toBe(before);
  });
  it('reports partial recovery import failures and keeps verified copies, the file, and unrelated saves', () => {
    const storage = memoryStorage(); const bytes = legacy(storage), target = memoryStorage(), write = target.setItem;
    let writes = 0;
    target.setItem = (key, value) => { if (++writes === 2) throw new Error('Quota'); write(key, value); };
    const backup = JSON.stringify({ schema: 1, primary: bytes.current, previous: bytes.previous, quarantined: null });
    expect(() => importSaveBackup(backup, target)).toThrow(/stopped after 1 verified copies/);
    expect(readSaveLibrary(target).saves).toHaveLength(1);
    expect(importSaveBackup(backup, target).added).toBe(1);
    expect(readSaveLibrary(target).saves).toHaveLength(2);
  });
});
