import { describe, expect, it } from 'vitest';
import { createScenario, SCENARIOS } from '../../src/game/scenarios';
import { decode, encode } from '../../src/game/persistence';
import { createGame, step } from '../../src/sim/game';

describe('initial expedition objectives', () => {
  it('keeps the original full campaign unchanged', () => {
    expect(createScenario(12345, 'standard', 'campaign')).toEqual(createGame(12345, 'standard'));
  });
  for (const scenario of SCENARIOS.filter(choice => choice.id !== 'campaign')) {
    it(`persists the actual ${scenario.id} objective and deterministic continuation`, () => {
      const state = createScenario(12346, 'relaxed', scenario.id);
      const active = state.contracts.filter(contract => contract.status === 'active');
      expect(active).toHaveLength(1);
      expect(active[0].kind).toBe(scenario.id === 'random' ? 'recovery' : scenario.id);
      expect(active[0].deadline).toBe(18000);
      expect(active[0].destination).not.toBe(active[0].origin);
      if (scenario.id === 'escort') expect(state.ships.some(ship => ship.id === active[0].convoyId)).toBe(true);
      const restored = decode(encode(state));
      for (let tick = 0; tick < 100; tick++) { step(state); step(restored); }
      expect(restored).toEqual(state);
    });
  }
  it('generates distinct objective mechanics, not only different region seeds', () => {
    expect([0, 1, 2].map(seed => createScenario(seed, 'standard', 'random').contracts.find(contract => contract.status === 'active')!.kind))
      .toEqual(['exploration', 'recovery', 'escort']);
  });
});
