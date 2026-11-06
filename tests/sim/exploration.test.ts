import { describe, expect, it } from 'vitest';
import { decode, encode } from '../../src/game/persistence';
import { currentSystem, hasInterceptWork, hasSensorWork, player } from '../../src/sim/core';
import { command, createGame, step } from '../../src/sim/game';
import type { GameState } from '../../src/sim/types';

function identified(known = 2) {
  const state = createGame(12345), system = currentSystem(state);
  system.locations.forEach(location => { location.known = known; });
  system.routes.forEach(id => { state.region.find(candidate => candidate.id === id)!.known = true; });
  state.discoveries.push(`route:${system.id}`);
  return state;
}
function finish(state: GameState, ticks: number) {
  for (let i = 0; i < ticks - 1; i++) step(state);
  expect(state.action?.remaining).toBe(1);
  step(state); expect(state.action).toBeNull();
}
function ew(state: GameState) {
  player(state).modules.push('ew');
  player(state).systems.find(system => system.kind === 'ew')!.power = 1;
}
function transmissionsComplete(state: GameState) {
  state.code = true;
  state.discoveries.push(...currentSystem(state).locations.map(location => `intercept:${location.id}`));
}

describe('useful exploration work', () => {
  it.each(['scan', 'probe'] as const)('rejects a no-result %s atomically, without charging or starting a timer', action => {
    const state = identified(), before = structuredClone(state);
    expect(hasSensorWork(state)).toBe(false);
    expect(command(state, { type: 'action', action })).toEqual({ ok: false, message: 'All contacts are identified and routes charted. No new scan data remains in this system.' });
    expect(state).toEqual(before);
  });
  it.each(['scan', 'probe'] as const)('stops %s at real identification and preserves legacy 3', action => {
    const state = identified();
    const [hidden, detected, legacy] = currentSystem(state).locations;
    hidden.known = 0; detected.known = 1; legacy.known = 3;
    const credits = player(state).credits;
    expect(command(state, { type: 'action', action })).toEqual({ ok: true });
    expect(player(state).credits).toBe(credits - (action === 'probe' ? 5 : 0));
    finish(state, 160);
    expect(hidden.known).toBe(action === 'probe' ? 2 : 1);
    expect(detected.known).toBe(2); expect(legacy.known).toBe(3);
    expect(state.discoveries.filter(id => id === 'route:s0')).toHaveLength(1);
  });
  it.each(['scan', 'probe'] as const)('retains the upgraded %s duration of 80 ticks', action => {
    const state = createGame(12345); player(state).modules.push('sensors');
    expect(command(state, { type: 'action', action })).toEqual({ ok: true });
    finish(state, 80);
  });
  it.each(['route record', 'neighbor'] as const)('keeps useful %s discovery available even when all contacts are legacy-identified', missing => {
    const state = identified(3);
    if (missing === 'route record') state.discoveries = [];
    else state.region.find(system => system.id === 's1')!.known = false;
    expect(hasSensorWork(state)).toBe(true);
    expect(command(state, { type: 'action', action: 'probe' })).toEqual({ ok: true });
    finish(state, 160);
    expect(currentSystem(state).locations.every(location => location.known === 3)).toBe(true);
    expect(state.region.find(system => system.id === 's1')!.known).toBe(true);
    expect(state.discoveries.filter(id => id === 'route:s0')).toHaveLength(1);
    const before = structuredClone(state);
    expect(command(state, { type: 'action', action: 'probe' }).ok).toBe(false);
    expect(state).toEqual(before);
  });
  it('preserves legacy 3, earned discoveries, sales and rewards through decoding and a useful operation', () => {
    const original = identified(3);
    original.discoveries.push('intercept:s0-station'); original.soldData.push('route:s0', 'intercept:s0-station');
    original.rewards.push('approach:s0-signal0');
    const bytes = encode(original), state = decode(bytes);
    expect(encode(state)).toBe(bytes);
    state.region.find(system => system.id === 's1')!.known = false;
    expect(command(state, { type: 'action', action: 'scan' })).toEqual({ ok: true });
    finish(state, 160);
    expect(state.discoveries).toEqual(original.discoveries);
    expect(state.soldData).toEqual(original.soldData); expect(state.rewards).toEqual(original.rewards);
    expect(currentSystem(state).locations.every(location => location.known === 3)).toBe(true);
    expect(decode(encode(state))).toEqual(state);
  });
  it('allows one unearned interception record at legacy 3, then rejects without cooldown or state changes', () => {
    const state = identified(3); transmissionsComplete(state); ew(state);
    const token = 'intercept:s0-station'; state.discoveries = state.discoveries.filter(id => id !== token);
    const credits = player(state).credits;
    expect(command(state, { type: 'ew', mode: 'intercept' })).toEqual({ ok: true });
    expect(state.discoveries.filter(id => id === token)).toHaveLength(1);
    expect(currentSystem(state).locations.every(location => location.known === 3)).toBe(true);
    expect(player(state).credits).toBe(credits);
    const unit = player(state).systems.find(system => system.kind === 'ew')!;
    expect(unit.ion).toBe(100); expect(unit.power).toBe(0);
    unit.ion = 0; unit.power = 1;
    expect(hasInterceptWork(state)).toBe(false);
    const before = structuredClone(state);
    expect(command(state, { type: 'ew', mode: 'intercept' })).toEqual({ ok: false, message: 'No new contact or transmission data remains in this system.' });
    expect(state).toEqual(before);
  });
  it('allows an intercepted detected contact to become identified, but never raises it to a new tier', () => {
    const state = identified(); transmissionsComplete(state); ew(state);
    const location = currentSystem(state).locations[0]; location.known = 1;
    expect(command(state, { type: 'ew', mode: 'intercept' })).toEqual({ ok: true });
    expect(location.known).toBe(2); expect(hasInterceptWork(state)).toBe(false);
    expect(state.discoveries.filter(id => id === `intercept:${location.id}`)).toHaveLength(1);
  });
  it.each(['code', 'investigation'] as const)('preserves remaining %s work after all contact and record work is complete', missing => {
    const state = identified(3); transmissionsComplete(state); ew(state);
    if (missing === 'code') state.code = false;
    else expect(command(state, { type: 'contract', id: 's0-investigation', action: 'accept' })).toEqual({ ok: true });
    const discoveries = [...state.discoveries];
    expect(hasInterceptWork(state)).toBe(true);
    expect(command(state, { type: 'ew', mode: 'intercept' })).toEqual({ ok: true });
    expect(state.code).toBe(true);
    if (missing === 'investigation') expect(state.contracts.find(contract => contract.id === 's0-investigation')!.investigationIntercepted).toBe(true);
    expect(state.discoveries).toEqual(discoveries); expect(hasInterceptWork(state)).toBe(false);
  });
});
