import type { GameState, Ship } from './types';

export function random(state: GameState): number {
  let value = state.rng >>> 0 || 0x9e3779b9;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng / 0x100000000;
}

export function event(state: GameState, kind: string, message: string): void {
  state.events.push({ id: state.nextId++, tick: state.tick, kind, message: message.slice(0, 512) });
  if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
}

export function player(state: GameState): Ship {
  const ship = state.ships.find(candidate => candidate.doctrine === 'player');
  if (!ship) throw new Error('Player ship is missing');
  return ship;
}

export function currentSystem(state: GameState) {
  const system = state.region.find(candidate => candidate.id === state.systemId);
  if (!system) throw new Error('Current star system is missing');
  return system;
}

export function currentLocation(state: GameState) {
  const location = currentSystem(state).locations.find(candidate => candidate.id === state.locationId);
  if (!location) throw new Error('Current location is missing');
  return location;
}

export function hasSensorWork(state: GameState): boolean {
  const system = currentSystem(state);
  return system.locations.some(location => location.known < 2)
    || system.routes.some(id => !state.region.find(candidate => candidate.id === id)?.known)
    || !state.discoveries.includes(`route:${system.id}`);
}

export function interceptTarget(state: GameState) {
  return [...currentSystem(state).locations].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .find(location => location.known < 2 || !state.discoveries.includes(`intercept:${location.id}`));
}

export function pendingIntercepts(state: GameState) {
  const system = currentSystem(state);
  return state.contracts.filter(contract => contract.status === 'active' && contract.kind === 'investigation'
    && !contract.investigationIntercepted && system.locations.some(location => location.id === contract.destination));
}

export function hasInterceptWork(state: GameState): boolean {
  return Boolean(interceptTarget(state) || !state.code || pendingIntercepts(state).length);
}

export function income(state: GameState, amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Income must be finite and nonnegative');
  const ship = player(state);
  const repayment = Math.min(ship.debt, amount * .25);
  ship.debt -= repayment;
  ship.credits += amount - repayment;
}
