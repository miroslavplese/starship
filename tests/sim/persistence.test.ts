import { describe, expect, it } from 'vitest';
import { recorderKey } from '../../src/content/expedition';
import { decode, encode } from '../../src/game/persistence';
import { createGame } from '../../src/sim/game';

describe('saved content references', () => {
  it('rejects cargo that has no authored commodity definition', () => {
    const state = createGame(12345);
    state.ships[0].cargo['unknown-commodity'] = 1;
    expect(() => encode(state)).toThrow(/Unknown cargo commodity/);
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
