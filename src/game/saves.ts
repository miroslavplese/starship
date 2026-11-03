import { z } from 'zod';
import { CORRUPT_KEY, PREVIOUS_KEY, SAVE_KEY, decode, encode } from './persistence';
import type { GameState } from '../sim/types';

export const EXPEDITION_PREFIX = 'starship.expedition.v1:';
const RECOVERY_PREFIX = 'starship.recovery.v1:';
const legacyKeys = [SAVE_KEY, PREVIOUS_KEY, CORRUPT_KEY];
const date = z.string().datetime().nullable();
const recordSchema = z.object({
  schema: z.literal(1), id: z.string().uuid(), name: z.string().min(1).max(100),
  source: z.enum(['new', 'import', 'legacy', 'legacy-backup', 'recovery']),
  savedAt: date, createdAt: date, importedAt: date, snapshot: z.string().max(1048576),
  origin: z.object({ key: z.string().max(200), bytes: z.string().max(1048576) }).optional(),
}).strict();
type SaveRecord = z.infer<typeof recordSchema>;
export interface SavedExpedition extends SaveRecord {
  key: string;
  raw: string;
  state: GameState;
  recovery: boolean;
}
export interface SaveLibrary {
  saves: SavedExpedition[];
  backups: SavedExpedition[];
  issues: { key: string; message: string }[];
}

function keys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => key !== null);
}
function readRecord(key: string, raw: string): SavedExpedition {
  const record = recordSchema.parse(JSON.parse(raw));
  if (key !== `${EXPEDITION_PREFIX}${record.id}` && key !== `${EXPEDITION_PREFIX}${record.id}.previous`) throw new Error('Saved expedition identity mismatch.');
  return { ...record, key, raw, state: decode(record.snapshot), recovery: key.endsWith('.previous') || record.source === 'legacy-backup' };
}
function legacyEntry(key: string, bytes: string): SavedExpedition {
  const state = decode(bytes), recovery = key !== SAVE_KEY;
  return {
    schema: 1, id: key, key, raw: bytes, snapshot: bytes, state, recovery,
    name: key === SAVE_KEY ? 'Earlier expedition' : key === PREVIOUS_KEY ? 'Earlier-version backup' : 'Retained recovery copy',
    source: recovery ? 'legacy-backup' : 'legacy', savedAt: null, createdAt: null, importedAt: null,
    origin: { key, bytes },
  };
}

export function readSaveLibrary(storage: Storage = localStorage): SaveLibrary {
  const entries: SavedExpedition[] = [], issues: SaveLibrary['issues'] = [];
  for (const key of keys(storage).filter(key => key.startsWith(EXPEDITION_PREFIX) || key.startsWith(RECOVERY_PREFIX))) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    if (key.startsWith(RECOVERY_PREFIX)) { issues.push({ key, message: 'A damaged copy was kept for recovery.' }); continue; }
    try { entries.push(readRecord(key, raw)); }
    catch (error) { issues.push({ key, message: error instanceof Error ? error.message : String(error) }); }
  }
  for (const key of legacyKeys) {
    const bytes = storage.getItem(key);
    if (bytes === null) continue;
    try {
      const migrated = entries.some(entry => !entry.key.endsWith('.previous') && entry.origin?.key === key && entry.origin.bytes === bytes);
      if (!migrated) entries.push(legacyEntry(key, bytes));
      else if (!entries.some(entry => entry.snapshot === bytes)) entries.push({ ...legacyEntry(key, bytes), recovery: true, name: 'Original earlier-version save' });
    } catch (error) { issues.push({ key, message: error instanceof Error ? error.message : String(error) }); }
  }
  const time = (entry: SavedExpedition) => entry.savedAt ?? entry.importedAt ?? entry.createdAt ?? '';
  return {
    saves: entries.filter(entry => !entry.recovery).sort((a, b) => time(b).localeCompare(time(a)) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key)),
    backups: entries.filter(entry => entry.recovery),
    issues,
  };
}

function writeVerified(storage: Storage, key: string, bytes: string) {
  storage.setItem(key, bytes);
  if (storage.getItem(key) !== bytes) throw new Error('The saved copy could not be verified. Existing backups were kept.');
}
function createRecord(state: GameState, source: SaveRecord['source'], storage: Storage, options: Partial<Pick<SaveRecord, 'name' | 'savedAt' | 'origin'>> = {}) {
  const id = crypto.randomUUID(), key = `${EXPEDITION_PREFIX}${id}`, now = new Date().toISOString();
  if (storage.getItem(key) !== null) throw new Error('Expedition identity is already in use; retry saving.');
  const count = keys(storage).filter(key => key.startsWith(EXPEDITION_PREFIX) && !key.endsWith('.previous')).length;
  const record: SaveRecord = {
    schema: 1, id, name: options.name ?? `Expedition ${count + 1}`, source,
    savedAt: source === 'new' ? now : options.savedAt ?? null,
    createdAt: source === 'new' ? now : null, importedAt: source === 'import' ? now : null,
    snapshot: encode(state), ...(options.origin ? { origin: options.origin } : {}),
  };
  // Keep the original validated bytes, including legacy envelope formatting.
  if (options.origin) { decode(options.origin.bytes); record.snapshot = options.origin.bytes; }
  const raw = JSON.stringify(record);
  readRecord(key, raw);
  writeVerified(storage, key, raw);
  return readRecord(key, raw);
}

export function migrateLegacySaves(storage: Storage = localStorage) {
  const library = readSaveLibrary(storage);
  for (const entry of [...library.saves, ...library.backups].filter(entry => legacyKeys.includes(entry.key))) {
    if ([...library.saves, ...library.backups].some(saved => saved.key.startsWith(EXPEDITION_PREFIX) && !saved.key.endsWith('.previous') && saved.origin?.key === entry.key && saved.origin.bytes === entry.snapshot)) continue;
    createRecord(entry.state, entry.source, storage, { name: entry.name, origin: { key: entry.key, bytes: entry.snapshot } });
  }
}

export function createSavedExpedition(state: GameState, source: 'new' | 'import' | 'recovery' = 'new', storage: Storage = localStorage, original?: SavedExpedition) {
  encode(state);
  migrateLegacySaves(storage);
  return createRecord(state, source, storage, original ? { savedAt: original.savedAt } : {});
}

export function findSavedExpedition(key: string, storage: Storage = localStorage) {
  const library = readSaveLibrary(storage);
  const entries = [...library.saves, ...library.backups];
  return entries.find(entry => entry.key === key) ?? (legacyKeys.includes(key) ? entries.find(entry => entry.origin?.key === key && !entry.key.endsWith('.previous')) : undefined);
}
export function loadSavedExpedition(key: string, storage: Storage = localStorage) {
  const entry = findSavedExpedition(key, storage);
  if (!entry) throw new Error('This saved expedition could not be opened. Other expeditions and recovery copies are unchanged.');
  if (entry.recovery) return createSavedExpedition(entry.state, 'recovery', storage, entry);
  if (legacyKeys.includes(entry.key)) {
    migrateLegacySaves(storage);
    const migrated = readSaveLibrary(storage).saves.find(saved => saved.origin?.key === entry.key && saved.origin.bytes === entry.snapshot);
    if (!migrated) throw new Error('Earlier save could not be verified. Original bytes were kept.');
    return migrated;
  }
  return entry;
}

export function updateSavedExpedition(entry: SavedExpedition, state: GameState, storage: Storage = localStorage) {
  if (entry.recovery || legacyKeys.includes(entry.key)) throw new Error('Load this recovery copy as a separate expedition before saving progress.');
  const snapshot = encode(state), currentRaw = storage.getItem(entry.key);
  if (currentRaw === null) throw new Error('This expedition is no longer available. Save current progress as a separate expedition.');
  const current = readRecord(entry.key, currentRaw);
  if (current.snapshot === snapshot && current.savedAt !== null) return current;
  if (currentRaw !== entry.raw) throw new Error('This expedition changed in another window. Save current progress as a separate expedition to keep both versions.');
  const backupKey = `${entry.key}.previous`, backupRaw = storage.getItem(backupKey);
  if (backupRaw !== null) {
    try { readRecord(backupKey, backupRaw); }
    catch {
      const retainedKey = `${RECOVERY_PREFIX}${crypto.randomUUID()}`;
      writeVerified(storage, retainedKey, JSON.stringify({ key: backupKey, bytes: backupRaw }));
    }
  }
  writeVerified(storage, backupKey, currentRaw);
  if (storage.getItem(entry.key) !== currentRaw) throw new Error('This expedition changed while saving. Other copies were kept; save current progress as a separate expedition.');
  const { key: _key, raw: _raw, state: _state, recovery: _recovery, ...record } = current;
  const raw = JSON.stringify({ ...record, snapshot, savedAt: new Date().toISOString() });
  readRecord(entry.key, raw);
  writeVerified(storage, entry.key, raw);
  return readRecord(entry.key, raw);
}

export function exportSaveBackup(storage: Storage = localStorage) {
  const entries = keys(storage).filter(key => legacyKeys.includes(key) || key.startsWith(EXPEDITION_PREFIX) || key.startsWith(RECOVERY_PREFIX))
    .map(key => ({ key, bytes: storage.getItem(key)! }));
  return JSON.stringify({ format: 'starship-backup', schema: 1, entries }, null, 2);
}

export function importSaveBackup(text: string, storage: Storage = localStorage) {
  if (text.length > 16777216) throw new Error('Recovery backup exceeds 16 MiB.');
  const parsed: unknown = JSON.parse(text);
  const current = z.object({ format: z.literal('starship-backup'), schema: z.literal(1), entries: z.array(z.object({ key: z.string().max(200), bytes: z.string() })).max(10000) }).safeParse(parsed);
  const old = z.object({ schema: z.literal(1), primary: z.string().nullable(), previous: z.string().nullable(), quarantined: z.string().nullable() }).safeParse(parsed);
  if (!current.success && !old.success) throw new Error('This is not a Starship recovery backup.');
  const items = current.success ? current.data.entries : old.success ? [
    { key: SAVE_KEY, bytes: old.data.primary }, { key: PREVIOUS_KEY, bytes: old.data.previous }, { key: CORRUPT_KEY, bytes: old.data.quarantined },
  ].filter((item): item is { key: string; bytes: string } => item.bytes !== null) : [];
  const candidates: { key: string; snapshot: string; state: GameState; savedAt: string | null }[] = [];
  let unreadable = 0, added = 0;
  for (const item of items) {
    try {
      if (item.key.startsWith(EXPEDITION_PREFIX)) {
        const record = readRecord(item.key, item.bytes);
        candidates.push({ key: item.key, snapshot: record.snapshot, state: record.state, savedAt: record.savedAt });
        if (record.origin && record.origin.bytes !== record.snapshot) candidates.push({ key: record.origin.key, snapshot: record.origin.bytes, state: decode(record.origin.bytes), savedAt: null });
      } else if (legacyKeys.includes(item.key)) candidates.push({ key: item.key, snapshot: item.bytes, state: decode(item.bytes), savedAt: null });
      else unreadable++;
    } catch { unreadable++; }
  }
  if (!candidates.length) throw new Error('No readable expeditions were found. Keep the original backup file; its damaged bytes have not been changed.');
  migrateLegacySaves(storage);
  for (const candidate of candidates) {
    const existing = readSaveLibrary(storage);
    if ([...existing.saves, ...existing.backups].some(entry => entry.origin?.key === candidate.key && entry.origin.bytes === candidate.snapshot)) continue;
    try {
      createRecord(candidate.state, 'recovery', storage, { savedAt: candidate.savedAt, origin: { key: candidate.key, bytes: candidate.snapshot } });
      added++;
    } catch (error) {
      throw new Error(`Recovery stopped after ${added} verified copies. ${error instanceof Error ? error.message : String(error)}. Original backup file and other expeditions were kept.`);
    }
  }
  return { added, unreadable };
}
