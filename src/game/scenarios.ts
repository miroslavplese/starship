import { command, createGame } from '../sim/game';
import type { GameState } from '../sim/types';

export const SCENARIOS = [
  { id: 'campaign', name: 'The Cartographer Expedition', description: 'The full frontier expedition: recover three coordinates, reach Terminus, and bring the archive home.' },
  { id: 'exploration', name: 'Planetary Survey', description: 'Accept Haven’s survey commission. Travel to Helios I, investigate it, and claim the survey reward.' },
  { id: 'recovery', name: 'Flight Recorder Recovery', description: 'Accept Haven’s recovery commission. Board the derelict, search its cockpit, and return the unique recorder to Haven.' },
  { id: 'escort', name: 'Convoy Escort', description: 'Depart with a real relief convoy. Defeat its marked attacker and reach the destination with the convoy alive.' },
  { id: 'random', name: 'Generated Exploration', description: 'Let the seed choose a survey, recorder recovery, or convoy objective. The rest of the frontier stays open.' },
] as const;
export type Scenario = typeof SCENARIOS[number]['id'];

export function createScenario(seed: number, difficulty: GameState['difficulty'], scenario: Scenario): GameState {
  const state = createGame(seed, difficulty);
  const objective = scenario === 'random' ? (['exploration', 'recovery', 'escort'] as const)[(seed >>> 0) % 3] : scenario;
  if (objective !== 'campaign') {
    const result = command(state, { type: 'contract', id: `s0-${objective}`, action: 'accept' });
    if (!result.ok) throw new Error(result.message);
  }
  return state;
}
