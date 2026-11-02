import { describe, expect, it } from 'vitest';
import { recorderKey } from '../../src/content/expedition';
import { CORRUPT_KEY, PREVIOUS_KEY, SAVE_KEY, decode, discardCorruptSaves, encode, recoveryDiagnostics, save } from '../../src/game/persistence';
import { createGame } from '../../src/sim/game';

describe('saved content references', () => {
  it('rejects cargo that has no authored commodity definition', () => {
    const state = createGame(12345);
    state.ships[0].cargo['unknown-commodity'] = 1;
    expect(() => encode(state)).toThrow(/Unknown cargo commodity/);
  });

  function memoryStorage(): Storage {
    const values = new Map<string, string>();
    return {
      get length() { return values.size; },
      clear() { values.clear(); },
      getItem(key) { return values.get(key) ?? null; },
      key(index) { return [...values.keys()][index] ?? null; },
      removeItem(key) { values.delete(key); },
      setItem(key, value) { values.set(key, value); },
    };
  }

  describe('continued saving after corrupt-slot recovery', () => {
    it('quarantines the exact corrupt primary before saving and preserves the good previous slot', () => {
      const state = createGame(12345), good = encode(state), storage = memoryStorage();
      storage.setItem(SAVE_KEY, '{broken');
      storage.setItem(PREVIOUS_KEY, good);
      expect(save(decode(good), storage)).toEqual({ ok: true, quarantined: true });
      expect(storage.getItem(SAVE_KEY)).toBe(good);
      expect(storage.getItem(PREVIOUS_KEY)).toBe(good);
      expect(storage.getItem(CORRUPT_KEY)).toBe('{broken');
      expect(JSON.parse(recoveryDiagnostics(storage))).toMatchObject({ primary: good, previous: good, quarantined: '{broken' });
      state.ships[0].credits++;
      expect(save(state, storage)).toEqual({ ok: true });
      expect(decode(storage.getItem(SAVE_KEY)!)).toEqual(state);
      expect(storage.getItem(PREVIOUS_KEY)).toBe(good);
      expect(storage.getItem(CORRUPT_KEY)).toBe('{broken');
    });

    it('never overwrites a different quarantined artifact and supports explicit discard after export', () => {
      const state = createGame(12345), good = encode(state), storage = memoryStorage();
      storage.setItem(SAVE_KEY, '{second');
      storage.setItem(PREVIOUS_KEY, good);
      storage.setItem(CORRUPT_KEY, '{first');
      expect(save(state, storage)).toMatchObject({ ok: false, message: expect.stringContaining('different corrupt save') });
      expect(JSON.parse(recoveryDiagnostics(storage))).toMatchObject({ primary: '{second', previous: good, quarantined: '{first' });
      expect(discardCorruptSaves(storage)).toEqual({ ok: true });
      expect(storage.getItem(PREVIOUS_KEY)).toBe(good);
      expect(storage.getItem(SAVE_KEY)).toBeNull();
      expect(storage.getItem(CORRUPT_KEY)).toBeNull();
      expect(save(state, storage)).toEqual({ ok: true });
    });

    it('explicit diagnostic discard never removes a valid primary or previous slot', () => {
      const state = createGame(12345), good = encode(state), storage = memoryStorage();
      storage.setItem(SAVE_KEY, good);
      storage.setItem(PREVIOUS_KEY, good);
      storage.setItem(CORRUPT_KEY, '{broken');
      expect(discardCorruptSaves(storage)).toEqual({ ok: true });
      expect(storage.getItem(SAVE_KEY)).toBe(good);
      expect(storage.getItem(PREVIOUS_KEY)).toBe(good);
      expect(storage.getItem(CORRUPT_KEY)).toBeNull();
    });

    it('leaves oversized corrupt bytes in place until their explicit export/discard', () => {
      const state = createGame(12345), storage = memoryStorage(), oversized = 'x'.repeat(1048577);
      storage.setItem(SAVE_KEY, oversized);
      expect(save(state, storage)).toMatchObject({ ok: false, message: expect.stringContaining('1 MiB diagnostic limit') });
      expect(storage.getItem(SAVE_KEY)).toBe(oversized);
      expect(storage.getItem(CORRUPT_KEY)).toBeNull();
    });

    it('does not replace the primary when diagnostic storage hits quota', () => {
      const state = createGame(12345), good = encode(state), storage = memoryStorage();
      storage.setItem(SAVE_KEY, '{broken');
      storage.setItem(PREVIOUS_KEY, good);
      const write = storage.setItem.bind(storage);
      storage.setItem = (key, value) => {
        if (key === CORRUPT_KEY) throw new DOMException('Quota exhausted.', 'QuotaExceededError');
        write(key, value);
      };
      expect(save(state, storage).ok).toBe(false);
      expect(storage.getItem(SAVE_KEY)).toBe('{broken');
      expect(storage.getItem(PREVIOUS_KEY)).toBe(good);
    });

    it('does not replace the primary when diagnostic read-back is invalid', () => {
      const state = createGame(12345), storage = memoryStorage();
      storage.setItem(SAVE_KEY, '{broken');
      const write = storage.setItem.bind(storage), read = storage.getItem.bind(storage);
      let written = false;
      storage.setItem = (key, value) => { write(key, value); if (key === CORRUPT_KEY) written = true; };
      storage.getItem = key => key === CORRUPT_KEY && written ? '{truncated' : read(key);
      expect(save(state, storage)).toMatchObject({ ok: false, message: expect.stringContaining('diagnostic read-back failed') });
      expect(storage.getItem(SAVE_KEY)).toBe('{broken');
    });

    it('reports a failed diagnostic removal rather than claiming success', () => {
      const storage = memoryStorage();
      storage.setItem(CORRUPT_KEY, '{broken');
      storage.removeItem = () => {};
      expect(discardCorruptSaves(storage)).toMatchObject({ ok: false, message: expect.stringContaining('could not be removed') });
      expect(storage.getItem(CORRUPT_KEY)).toBe('{broken');
    });
  });

  it('rejects fitted modules that have no authored upgrade definition', () => {
    const state = createGame(12345);
    state.ships[0].modules.push('unknown-upgrade');
    expect(() => encode(state)).toThrow('Unknown fitted upgrade.');
  });

  it('preserves the unique recorder of an actual derelict through save/load', () => {
    const state = createGame(12345);
    state.ships[0].cargo[recorderKey('s0-wreck')] = 1;
    expect(decode(encode(state))).toEqual(state);
  });

  it.each([
    { item: recorderKey('missing-wreck'), quantity: 1 },
    { item: recorderKey('s0-station'), quantity: 1 },
    { item: recorderKey('s0-wreck'), quantity: 2 },
  ])('rejects invalid recorder reference/quantity $item/$quantity', ({ item, quantity }) => {
    const state = createGame(12345);
    state.ships[0].cargo[item] = quantity;
    expect(() => encode(state)).toThrow(/invalid flight recorder/);
  });
});
