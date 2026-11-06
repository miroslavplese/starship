import { COMPARTMENT_OUTCOMES, MISSION_BRIEFINGS, recorderKey } from '../content/expedition';
import { cargoUsed } from '../content/region';
import { createCrew, createShip } from '../content/ships';
import { currentSystem, event, income, pendingIntercepts, player } from './core';
import type { Command, Contract, GameState, Result, Ship } from './types';

const ok: Result = { ok: true };
const reject = (message: string): Result => ({ ok: false, message });
const reserved = (contract: Contract) => ['courier', 'freight', 'passenger', 'smuggling'].includes(contract.kind);
const targetMission = (contract: Contract) => contract.kind === 'bounty' || contract.kind === 'escort';
const active = (state: GameState) => state.contracts.filter(contract => contract.status === 'active');

export { SURVEY_CATEGORIES, SURVEY_DESCRIPTIONS, SURVEY_VALUES, discoveryKind, surveyKind } from '../content/expedition';

export function convoyShips(state: GameState): Ship[] {
  const ids = new Set(active(state).filter(contract => contract.kind === 'escort').map(contract => contract.convoyId));
  return state.ships.filter(ship => ids.has(ship.id));
}

function release(state: GameState, contract: Contract): void {
  if (contract.convoyId) {
    state.ships = state.ships.filter(ship => ship.id !== contract.convoyId);
    state.projectiles = state.projectiles.filter(projectile => projectile.source !== contract.convoyId && projectile.target !== contract.convoyId);
  }
  delete contract.reservedManifest;
  contract.inspectionPending = false;
}

function fail(state: GameState, contract: Contract, reason: string): void {
  if (contract.status !== 'active') return;
  contract.status = 'failed';
  contract.failureReason = reason;
  release(state, contract);
  event(state, 'contract', `${contract.name} failed: ${reason}. Reserved capacity released.`);
}

function ready(state: GameState, contract: Contract): string | null {
  const p = player(state);
  if (contract.deadline > 0 && state.tick > contract.deadline) return 'The delivery deadline has passed.';
  if (state.travel || state.customs || state.encounter === 'hostile' || state.encounter === 'surrender') return 'Resolve travel, hostiles and customs before completing a contract.';
  const atDestination = state.locationId === contract.destination;
  switch (contract.kind) {
    case 'courier':
    case 'freight':
      return atDestination && contract.reservedManifest ? null : 'Deliver the reserved manifest to the named destination.';
    case 'emergency':
      return atDestination && (p.cargo.medicine ?? 0) >= contract.quantity ? null : 'Bring the required medicine to the outbreak destination.';
    case 'passenger':
      return atDestination && contract.passenger?.status === 'aboard' && contract.passenger.health > 0 ? null : 'The named passenger must arrive alive.';
    case 'exploration':
      return contract.progress >= 1 ? null : 'Complete a new survey of the specified location after acceptance.';
    case 'salvage':
      return state.locationId === contract.origin && (contract.salvageRecovered ?? 0) >= contract.quantity && (p.cargo.parts ?? 0) >= contract.quantity
        ? null : 'Recover the component quota physically from the named wreck and return those parts to the origin station.';
    case 'recovery':
      return state.locationId === contract.origin && (p.cargo[contract.recorderId ?? recorderKey(contract.destination)] ?? 0) >= 1
        ? null : 'Return the unique flight recorder from the named wreck to the origin station.';
    case 'bounty':
      return contract.targetDefeated ? null : 'The uniquely marked raider has not been defeated.';
    case 'escort': {
      const convoy = state.ships.find(ship => ship.id === contract.convoyId);
      return contract.targetDefeated && convoy && convoy.hull > 0 && atDestination ? null : 'Defeat the marked attacker and reach the destination with the actual convoy alive.';
    }
    case 'smuggling':
      return atDestination && contract.reservedManifest && (contract.inspections ?? 0) > 0
        ? null : 'Cross a customs inspection with the reserved manifest intact before delivery.';
    case 'investigation':
      return contract.investigationIntercepted && contract.progress >= 1 ? null : 'Intercept the code first, then investigate the specified relay.';
  }
}

export function missionCommand(state: GameState, command: Command): Result | null {
  if (command.type !== 'contract') return null;
  if (state.phase !== 'expedition') return reject('This expedition has ended.');
  const contract = state.contracts.find(candidate => candidate.id === command.id);
  if (!contract) return reject('Unknown contract.');
  const p = player(state);
  if (command.action === 'accept') {
    if (contract.status !== 'offered' || state.locationId !== contract.origin || state.travel || state.customs || state.encounter === 'hostile' || state.encounter === 'surrender') return reject('Contract unavailable at this location or while operations are blocked.');
    if (active(state).length >= 12) return reject('Maximum twelve active contracts.');
    const destination = state.region.flatMap(system => system.locations).find(location => location.id === contract.destination);
    if (!destination) return reject('Contract destination is missing.');
    if ((contract.kind === 'exploration' || contract.kind === 'investigation') && destination.surveyed) return reject('The specified site has already been surveyed.');
    if ((targetMission(contract) || contract.kind === 'salvage' || contract.kind === 'recovery') && destination.depleted) return reject('The specified target has already been exhausted.');
    if (reserved(contract) && cargoUsed(state) + contract.quantity > p.capacity) return reject('Insufficient free reserved cargo capacity.');
    if (contract.kind === 'emergency' && (p.cargo.medicine ?? 0) < contract.quantity) return reject('Buy your own medicine before accepting outbreak relief.');
    if (contract.kind === 'escort' && state.ships.length >= 3) return reject('The convoy needs a free ship slot and one reserved for its attacker (maximum four ships).');
    const wreck = state.wrecks?.[contract.destination];
    if (contract.kind === 'salvage' && wreck) {
      const available = wreck.rooms.filter(room => !room.searched).reduce((sum, room) => {
        const outcome = COMPARTMENT_OUTCOMES[room.system];
        return sum + (outcome.kind === 'components' ? outcome.quantity : 0);
      }, 0);
      if (available < Math.max(3, contract.quantity)) return reject('Too few unsearched physical components remain for this salvage quota.');
    }
    if (contract.kind === 'recovery' && wreck?.rooms.some(room => room.system === 'cockpit' && room.searched) && !(p.cargo[recorderKey(contract.destination)] > 0)) return reject('This wreck’s recorder has already been removed and is no longer aboard.');
    const passengerRoom = p.rooms.find(room => room.system === 'oxygen') ?? p.rooms[0];
    if (contract.kind === 'passenger' && !passengerRoom) return reject('No passenger cabin exists.');
    contract.status = 'active';
    contract.acceptedTick = state.tick;
    contract.deadline = state.tick + (contract.kind === 'emergency' ? 6000 : 18000);
    contract.progress = 0;
    delete contract.failureReason;
    if (reserved(contract)) contract.reservedManifest = { item: contract.kind === 'courier' ? `dispatch:${contract.id}` : contract.kind === 'passenger' ? `passenger:${contract.id}` : contract.commodity, quantity: contract.quantity };
    if (contract.kind === 'passenger') contract.passenger = { name: `Researcher ${contract.id}`, health: 100, roomId: passengerRoom.id, status: 'aboard' };
    if (contract.kind === 'salvage') { contract.quantity = Math.max(3, contract.quantity); contract.salvageRecovered = 0; }
    if (contract.kind === 'recovery') contract.recorderId = recorderKey(contract.destination);
    if (contract.kind === 'smuggling') { contract.inspections = 0; contract.inspectionPending = false; }
    if (contract.kind === 'investigation') { contract.investigationIntercepted = false; contract.investigationRelay = contract.destination; }
    if (targetMission(contract)) { contract.targetId = `mission-target:${contract.destination}`; contract.targetDefeated = false; }
    if (contract.kind === 'escort') {
      const convoy = createShip(`convoy-${contract.id}`);
      convoy.name = `Relief convoy ${contract.id}`; convoy.weapons = []; convoy.hull = convoy.maxHull = 18;
      contract.convoyId = convoy.id;
      state.ships.push(convoy);
    }
    event(state, 'contract', `${contract.name} accepted. ${MISSION_BRIEFINGS[contract.kind]} Deadline tick ${contract.deadline}; abandon costs 5 credits/debt.`);
    return ok;
  }
  if (contract.status !== 'active') return reject('Only active contracts can be completed or abandoned.');
  if (command.action === 'abandon') {
    const paid = Math.min(5, p.credits);
    p.credits -= paid; p.debt = Math.min(150, p.debt + 5 - paid);
    fail(state, contract, 'abandoned by captain; compensation 5 credits/debt');
    return ok;
  }
  const reason = ready(state, contract);
  if (reason) return reject(reason);
  const token = `contract:${contract.id}`;
  if (state.rewards.includes(token)) return reject('This contract reward has already been paid.');
  if (contract.kind === 'emergency') p.cargo.medicine -= contract.quantity;
  if (contract.kind === 'salvage') p.cargo.parts -= contract.quantity;
  if (contract.kind === 'recovery') delete p.cargo[contract.recorderId ?? recorderKey(contract.destination)];
  if (contract.passenger) contract.passenger.status = 'delivered';
  contract.status = 'complete';
  contract.progress = Math.max(1, contract.progress);
  release(state, contract);
  state.rewards.push(token);
  income(state, contract.reward);
  const faction = state.region.find(system => system.locations.some(location => location.id === contract.origin))?.faction ?? currentSystem(state).faction;
  state.reputation[faction] = (state.reputation[faction] ?? 0) + 3;
  event(state, 'contract', `${contract.name} complete. Reward ${contract.reward}; ${faction} reputation +3.`);
  return ok;
}

/** Call after the arrival encounter has been created, before the next tactical tick. */
export function missionArrival(state: GameState, locationId: string): void {
  const contracts = active(state);
  const objectives = contracts.filter(contract => targetMission(contract) && contract.destination === locationId && !contract.targetDefeated);
  const target = state.ships.find(ship => (ship.doctrine === 'pirate' || ship.doctrine === 'military') && ship.hull > 0);
  if (objectives.length && target) {
    const previousId = target.id;
    target.id = `mission-target:${locationId}`;
    target.name = `Marked raider at ${locationId}`;
    const rooms = new Map(target.rooms.map(room => [room.id, `${target.id}-${room.system}`]));
    for (const room of target.rooms) room.id = rooms.get(room.id)!;
    for (const [index, door] of target.doors.entries()) {
      door.id = `${target.id}-door-${index}`;
      door.a = rooms.get(door.a)!;
      if (door.b) door.b = rooms.get(door.b)!;
    }
    for (const [index, weapon] of target.weapons.entries()) weapon.id = `${target.id}-weapon-${index}`;
    for (const ship of state.ships) {
      for (const weapon of ship.weapons) if (weapon.target && rooms.has(weapon.target)) weapon.target = rooms.get(weapon.target)!;
    }
    for (const crew of state.crew) {
      if (crew.shipId === previousId) {
        crew.shipId = target.id;
        crew.room = rooms.get(crew.room) ?? crew.room;
        crew.path = crew.path.map(room => rooms.get(room) ?? room);
      }
      if (crew.home === previousId) crew.home = target.id;
    }
    for (const projectile of state.projectiles) {
      if (projectile.source === previousId) projectile.source = target.id;
      if (projectile.target === previousId) projectile.target = target.id;
      projectile.room = rooms.get(projectile.room) ?? projectile.room;
    }
    objectives.forEach(contract => contract.targetId = target.id);
  }
  const location = state.region.flatMap(system => system.locations).find(candidate => candidate.id === locationId);
  if (location?.kind === 'station') {
    for (const contract of contracts.filter(candidate => candidate.kind === 'smuggling' && candidate.origin !== locationId && (candidate.inspections ?? 0) === 0)) {
      contract.inspectionPending = true;
      state.customs = true;
    }
  }
}

/** Call only after a successful EW intercept command, not after purchasing a code. */
export function missionIntercept(state: GameState): void {
  state.code = true;
  for (const contract of pendingIntercepts(state)) {
    contract.investigationIntercepted = true;
    event(state, 'contract', `${contract.name}: intercepted cipher identifies ${contract.investigationRelay ?? contract.destination}. Investigate that relay to corroborate it.`);
  }
}

/** Call after a successful customs command has applied seizure/payment/encounter outcomes. */
export function missionCustoms(state: GameState, choice: Extract<Command, { type: 'customs' }>['choice']): void {
  for (const contract of state.contracts.filter(candidate => candidate.kind === 'smuggling' && candidate.inspectionPending)) {
    contract.inspectionPending = false;
    if (contract.status === 'failed') { release(state, contract); continue; }
    if (contract.status !== 'active' || state.customs || choice === 'flee' || choice === 'fight') continue;
    contract.inspections = (contract.inspections ?? 0) + 1;
    event(state, 'contract', `${contract.name}: customs inspection cleared; manifest intact.`);
  }
}

/** Call only when a new physical investigation/survey finishes. */
export function missionSurvey(state: GameState, locationId: string): void {
  for (const contract of active(state).filter(candidate => candidate.destination === locationId)) {
    if (contract.kind === 'exploration' || contract.kind === 'investigation' && contract.investigationIntercepted && (contract.investigationRelay ?? contract.destination) === locationId) {
      contract.progress = 1;
      event(state, 'contract', `${contract.name}: ${contract.kind === 'investigation' ? 'intercept corroborated by the relay’s physical log' : 'specified new survey recorded'}.`);
    }
  }
}

export function missionTick(state: GameState): void {
  if (state.phase !== 'expedition') return;
  const p = player(state);
  for (const contract of state.contracts) {
    if (contract.status === 'failed' && (contract.reservedManifest || state.ships.some(ship => ship.id === contract.convoyId))) release(state, contract);
  }
  for (const contract of active(state)) {
    if (contract.deadline > 0 && state.tick > contract.deadline) { fail(state, contract, 'deadline missed'); continue; }
    if (contract.passenger?.status === 'aboard') {
      const passenger = contract.passenger, room = p.rooms.find(candidate => candidate.id === passenger.roomId);
      const damage = room ? (room.oxygen < .2 ? .1 : 0) + room.fire * .08 : 100;
      passenger.health = p.hull <= 0 ? 0 : Math.max(0, passenger.health - damage);
      if (passenger.health <= 0) { passenger.status = 'dead'; fail(state, contract, `${passenger.name} died in transit`); continue; }
    }
    if (contract.kind === 'escort') {
      const convoy = state.ships.find(ship => ship.id === contract.convoyId);
      if (!convoy || convoy.hull <= 0) { fail(state, contract, 'convoy vessel lost'); continue; }
    }
    if (targetMission(contract) && contract.targetId && state.locationId === contract.destination) {
      const target = state.ships.find(ship => ship.id === contract.targetId);
      const token = `encounter:${state.systemId}:${contract.destination}:${contract.targetId}`;
      if (target && (target.hull <= 0 || target.doctrine === 'derelict' && state.encounter === 'won' && state.rewards.includes(token))) {
        contract.targetDefeated = true;
        contract.progress = 1;
      }
    }
  }
}

export function missionSearch(state: GameState, shipId: string, roomId: string, crewId: string): Result {
  if (state.phase !== 'expedition' || state.travel) return reject('Search requires an ongoing expedition at a stationary wreck.');
  if (!currentSystem(state).locations.some(location => location.id === state.locationId && location.kind === 'derelict')) return reject('Battle salvage is paid at encounter resolution; unique wreck items require an authored derelict site.');
  const p = player(state), ship = state.ships.find(candidate => candidate.id === shipId);
  const room = ship?.rooms.find(candidate => candidate.id === roomId), crew = state.crew.find(candidate => candidate.id === crewId);
  if (!ship || ship.doctrine !== 'derelict' || ship.hull <= 0 || !room || room.searched) return reject('This compartment has no uncollected wreck salvage.');
  if (!crew || crew.home !== p.id || crew.health <= 0 || crew.shipId !== ship.id || crew.room !== room.id || crew.path.length || crew.task !== 'search' || crew.progress < 100) return reject('A living expedition crew member must physically finish searching this compartment.');
  if (state.crew.some(candidate => candidate.health > 0 && candidate.shipId === ship.id && candidate.room === room.id && candidate.home !== p.id)) return reject('Defeat or remove the compartment’s defenders before searching.');
  const outcome = COMPARTMENT_OUTCOMES[room.system];
  const cargo = outcome.kind === 'components' || outcome.kind === 'cargo' ? outcome.quantity : outcome.kind === 'recorder' ? 1 : 0;
  if (cargoUsed(state) + cargo > p.capacity) return reject(`Free ${cargo} cargo volume before recovering this compartment.`);
  if (outcome.kind === 'fuel' && p.fuel + outcome.quantity > p.maxFuel) return reject(`Make room for all ${outcome.quantity} recovered fuel cells.`);
  if ((outcome.kind === 'survivor' || outcome.kind === 'threat') && state.crew.length >= 32) return reject('Crew entity capacity reached (32); no search outcome has been consumed.');
  const item = recorderKey(state.locationId);
  if (outcome.kind === 'recorder' && (p.cargo[item] ?? 0) > 0) return reject('This wreck’s unique flight recorder is already aboard.');
  room.searched = true;
  crew.task = 'idle'; crew.progress = 0;
  switch (outcome.kind) {
    case 'components':
      p.cargo.parts = (p.cargo.parts ?? 0) + outcome.quantity;
      for (const contract of active(state).filter(candidate => candidate.kind === 'salvage' && candidate.destination === state.locationId)) {
        contract.salvageRecovered = (contract.salvageRecovered ?? 0) + outcome.quantity;
        contract.progress = Math.min(1, contract.salvageRecovered / contract.quantity);
      }
      break;
    case 'cargo': p.cargo[outcome.item] = (p.cargo[outcome.item] ?? 0) + outcome.quantity; break;
    case 'fuel': p.fuel += outcome.quantity; break;
    case 'recorder': p.cargo[item] = 1; break;
    case 'logs': {
      const key = `wreck-log:${state.locationId}:${room.system}`;
      if (!state.rewards.includes(key)) state.rewards.push(key);
      break;
    }
    case 'survivor': {
      const survivor = createCrew(ship.id)[0];
      survivor.id = `survivor:${state.locationId}:${room.id}`; survivor.name = outcome.name;
      survivor.home = p.id; survivor.health = 35; survivor.room = room.id; survivor.task = 'idle';
      state.crew.push(survivor);
      break;
    }
    case 'threat': {
      const defender = createCrew(ship.id, true)[0];
      defender.id = `wreck-threat:${state.locationId}:${room.id}`; defender.name = 'Marooned scavenger';
      defender.home = 'enemy'; defender.room = room.id; defender.health = 55; defender.task = 'fight';
      state.crew.push(defender);
      room.fire = Math.max(room.fire, .35); room.oxygen = Math.min(room.oxygen, .3);
      crew.task = 'fight';
      break;
    }
  }
  event(state, outcome.kind === 'threat' ? 'boarding' : 'salvage', `${crew.name} searched ${room.name}. ${outcome.text}`);
  if (ship.rooms.every(candidate => candidate.searched)) {
    const location = state.region.flatMap(system => system.locations).find(candidate => candidate.id === state.locationId);
    if (location) location.depleted = true;
  }
  return ok;
}
