import { describe, expect, it } from 'vitest';
import { COMPARTMENT_OUTCOMES, discoveryKind, SURVEY_CATEGORIES, SURVEY_VALUES, surveyKind } from '../../src/content/expedition';
import { cargoUsed } from '../../src/content/region';
import { createCrew, createShip } from '../../src/content/ships';
import { createGame } from '../../src/sim/game';
import { convoyShips, missionArrival, missionCommand, missionCustoms, missionIntercept, missionSearch, missionSurvey, missionTick } from '../../src/sim/missions';
import { tacticalCommand, tacticalTick } from '../../src/sim/tactical';
import type { Contract, GameState, MissionKind, Ship, SystemKind } from '../../src/sim/types';

function contract(state: GameState, kind: MissionKind): Contract {
  return state.contracts.find(candidate => candidate.id === `s0-${kind}`)!;
}
function issue(state: GameState, target: Contract, action: 'accept' | 'complete' | 'abandon' = 'accept') {
  return missionCommand(state, { type: 'contract', id: target.id, action });
}
function accept(state: GameState, kind: MissionKind): Contract {
  const target = contract(state, kind);
  expect(issue(state, target)).toEqual({ ok: true });
  return target;
}
function destination(state: GameState, target: Contract) {
  state.locationId = target.destination;
  state.systemId = state.region.find(system => system.locations.some(location => location.id === target.destination))!.id;
}
function wreck(state: GameState): Ship {
  const ship = createShip('derelict', false, true);
  state.ships.push(ship); state.locationId = 's0-wreck'; state.encounter = 'derelict';
  return ship;
}
function search(state: GameState, ship: Ship, kind: SystemKind) {
  const crew = state.crew[0], room = ship.rooms.find(candidate => candidate.system === kind)!;
  crew.shipId = ship.id; crew.room = room.id; crew.path = []; crew.task = 'search'; crew.progress = 100;
  return missionSearch(state, ship.id, room.id, crew.id);
}
function attacker(state: GameState, target: Contract): Ship {
  destination(state, target);
  const enemy = createShip('enemy', true);
  state.ships.push(enemy); state.crew.push(...createCrew('enemy', true)); state.encounter = 'hostile';
  missionArrival(state, target.destination);
  return enemy;
}
function defeated(state: GameState, enemy: Ship) {
  enemy.hull = 0; state.encounter = 'won'; missionTick(state);
}
function unchanged(state: GameState, operation: () => unknown) {
  const before = JSON.stringify(state);
  expect(operation()).toMatchObject({ ok: false });
  expect(JSON.stringify(state)).toBe(before);
}

describe('distinct authored missions', () => {
  it.each(['courier', 'freight'] as const)('reserves an actual %s manifest separately from player goods and pays once through debt', kind => {
    const state = createGame(1), target = accept(state, kind), p = state.ships[0];
    expect(target.reservedManifest?.quantity).toBe(target.quantity);
    expect(target.reservedManifest?.item).toBe(kind === 'courier' ? `dispatch:${target.id}` : target.commodity);
    expect(cargoUsed(state)).toBe(target.quantity);
    expect(p.cargo[target.commodity] ?? 0).toBe(0);
    unchanged(state, () => issue(state, target, 'complete'));
    destination(state, target); p.debt = 100;
    const before = p.credits;
    expect(issue(state, target, 'complete')).toEqual({ ok: true });
    expect(p.credits - before).toBeCloseTo(target.reward * .75);
    expect(cargoUsed(state)).toBe(0);
    expect(target.reservedManifest).toBeUndefined();
    unchanged(state, () => issue(state, target, 'complete'));
    const loaded: GameState = JSON.parse(JSON.stringify(state));
    unchanged(loaded, () => issue(loaded, contract(loaded, kind), 'complete'));
  });

  it('requires owned medicine and timely delivery, without supplying or reserving free medicine', () => {
    const state = createGame(1), target = contract(state, 'emergency');
    unchanged(state, () => issue(state, target));
    state.ships[0].cargo.medicine = target.quantity;
    expect(issue(state, target)).toEqual({ ok: true });
    expect(target.deadline).toBe(6000);
    destination(state, target);
    state.ships[0].cargo.medicine = 0;
    unchanged(state, () => issue(state, target, 'complete'));
    state.ships[0].cargo.medicine = target.quantity; state.tick = target.deadline;
    expect(issue(state, target, 'complete')).toEqual({ ok: true });
    expect(state.ships[0].cargo.medicine).toBe(0);
    const late = createGame(1); late.ships[0].cargo.medicine = 1;
    const overdue = accept(late, 'emergency'); late.tick = overdue.deadline + 1;
    missionTick(late);
    expect(overdue.status).toBe('failed'); expect(overdue.failureReason).toContain('deadline');
    expect(late.ships[0].cargo.medicine).toBe(1);
  });

  it('uses the named passenger’s health rather than unrelated living crew', () => {
    const state = createGame(1), target = accept(state, 'passenger');
    const cabin = state.ships[0].rooms.find(room => room.id === target.passenger!.roomId)!;
    cabin.oxygen = 0; cabin.fire = 1; target.passenger!.health = .1;
    missionTick(state);
    expect(target.status).toBe('failed'); expect(target.passenger?.status).toBe('dead');
    expect(state.crew.every(crew => crew.health > 0)).toBe(true);
    expect(cargoUsed(state)).toBe(0);
    destination(state, target); unchanged(state, () => issue(state, target, 'complete'));
    const safe = createGame(2), passenger = accept(safe, 'passenger');
    missionTick(safe); expect(passenger.passenger?.health).toBe(100);
    destination(safe, passenger);
    expect(issue(safe, passenger, 'complete')).toEqual({ ok: true });
    expect(passenger.passenger?.status).toBe('delivered');
  });

  it('requires a new specified exploration survey, not some other survey or an old one', () => {
    const state = createGame(3), target = accept(state, 'exploration');
    missionSurvey(state, 's0-planet1'); expect(target.progress).toBe(0);
    unchanged(state, () => issue(state, target, 'complete'));
    missionSurvey(state, target.destination);
    expect(issue(state, target, 'complete')).toEqual({ ok: true });
    const stale = createGame(3);
    stale.region[0].locations.find(location => location.id === contract(stale, 'exploration').destination)!.surveyed = true;
    unchanged(stale, () => issue(stale, contract(stale, 'exploration')));
  });

  it('requires physical component recovery quota and return, not bought parts or a single room', () => {
    const state = createGame(4), target = accept(state, 'salvage'), p = state.ships[0];
    p.cargo.parts = 10;
    unchanged(state, () => issue(state, target, 'complete'));
    const ship = wreck(state);
    expect(search(state, ship, 'engines')).toEqual({ ok: true });
    expect(target.salvageRecovered).toBe(2); expect(target.progress).toBeLessThan(1);
    expect(search(state, ship, 'shields')).toEqual({ ok: true });
    expect(target.salvageRecovered).toBe(4);
    state.encounter = 'none';
    unchanged(state, () => issue(state, target, 'complete'));
    state.locationId = target.origin;
    expect(issue(state, target, 'complete')).toEqual({ ok: true });
    expect(p.cargo.parts).toBe(11);
  });

  it('rejects salvage offers if a previously visited wreck has insufficient components left', () => {
    const state = createGame(5), ship = createShip('derelict', false, true);
    ship.rooms.find(room => room.system === 'engines')!.searched = true;
    state.wrecks = { 's0-wreck': ship };
    unchanged(state, () => issue(state, contract(state, 'salvage')));
  });

  it('binds a bounty to a real unique raider identity, not a generic won encounter', () => {
    const state = createGame(5), target = accept(state, 'bounty');
    destination(state, target); state.encounter = 'won'; missionTick(state);
    expect(target.progress).toBe(0);
    unchanged(state, () => issue(state, target, 'complete'));
    const enemy = attacker(state, target);
    expect(enemy.id).toBe(target.targetId);
    expect(enemy.id).not.toBe('enemy');
    expect(state.crew.some(crew => crew.home === enemy.id && crew.shipId === enemy.id)).toBe(true);
    enemy.doctrine = 'derelict'; state.encounter = 'none';
    state.rewards.push(`encounter:${state.systemId}:${target.destination}:${target.targetId}`);
    missionTick(state);
    expect(target.progress).toBe(0); // Escape and ceasefire do not fulfill the warrant.
    state.encounter = 'won'; missionTick(state);
    expect(target.targetDefeated).toBe(true);
    expect(issue(state, target, 'complete')).toEqual({ ok: true });
  });

  it('spawns and maintains every active convoy and fails escort when its own actual vessel dies', () => {
    const state = createGame(6), target = accept(state, 'escort');
    const second = { ...contract(state, 'escort'), id: 's0-escort-second', status: 'offered' as const };
    state.contracts.push(second);
    expect(issue(state, second)).toEqual({ ok: true });
    expect(convoyShips(state).map(ship => ship.id)).toEqual([`convoy-${target.id}`, `convoy-${second.id}`]);
    expect(convoyShips(state).every(ship => ship.doctrine === 'player' && ship.weapons.length === 0)).toBe(true);
    const third = { ...second, id: 'third-escort', status: 'offered' as const }; state.contracts.push(third);
    unchanged(state, () => issue(state, third)); // Preserve a slot for a real attacker.
    const enemy = attacker(state, target);
    expect(state.ships).toHaveLength(4);
    convoyShips(state)[0].hull = 0; defeated(state, enemy);
    expect(target.status).toBe('failed');
    expect(second.status).toBe('active'); expect(second.targetDefeated).toBe(true);
    expect(convoyShips(state)).toHaveLength(1);
    unchanged(state, () => issue(state, target, 'complete'));
    expect(issue(state, second, 'complete')).toEqual({ ok: true });
    expect(convoyShips(state)).toHaveLength(0);
  });

  it('does not complete escort before the marked attacker is defeated', () => {
    const state = createGame(6), target = accept(state, 'escort'), enemy = attacker(state, target);
    unchanged(state, () => issue(state, target, 'complete'));
    state.encounter = 'won'; missionTick(state);
    expect(target.progress).toBe(0);
    defeated(state, enemy);
    expect(issue(state, target, 'complete')).toEqual({ ok: true });
  });

  it('recovers a unique cockpit recorder and consumes it on return, never generic parts', () => {
    const state = createGame(7), target = accept(state, 'recovery');
    state.ships[0].cargo.parts = 5;
    unchanged(state, () => issue(state, target, 'complete'));
    const ship = wreck(state);
    expect(search(state, ship, 'sensors')).toEqual({ ok: true });
    expect(state.ships[0].cargo[target.recorderId!] ?? 0).toBe(0);
    expect(search(state, ship, 'cockpit')).toEqual({ ok: true });
    expect(state.ships[0].cargo[target.recorderId!]).toBe(1);
    state.locationId = target.origin; state.encounter = 'none';
    expect(issue(state, target, 'complete')).toEqual({ ok: true });
    expect(state.ships[0].cargo[target.recorderId!]).toBeUndefined();
    expect(state.ships[0].cargo.parts).toBe(5);
  });

  it('requires an actual customs crossing before smuggling delivery, with confiscation failing', () => {
    const state = createGame(8), target = accept(state, 'smuggling');
    destination(state, target);
    unchanged(state, () => issue(state, target, 'complete'));
    missionArrival(state, target.destination);
    expect(state.customs).toBe(true); expect(target.inspectionPending).toBe(true);
    unchanged(state, () => issue(state, target, 'complete'));
    state.customs = false; missionCustoms(state, 'bribe'); missionTick(state);
    expect(target.inspections).toBe(1);
    expect(issue(state, target, 'complete')).toEqual({ ok: true });
    const seized = createGame(8), failed = accept(seized, 'smuggling');
    destination(seized, failed); missionArrival(seized, failed.destination);
    failed.status = 'failed'; seized.customs = false; missionCustoms(seized, 'submit'); missionTick(seized);
    expect(cargoUsed(seized)).toBe(0);
    expect(failed.reservedManifest).toBeUndefined();
    unchanged(seized, () => issue(seized, failed, 'complete'));
  });

  it.each(['flee', 'fight'] as const)('does not count %s as a cleared customs inspection', choice => {
    const state = createGame(8), target = accept(state, 'smuggling');
    destination(state, target); missionArrival(state, target.destination);
    state.customs = false; missionCustoms(state, choice); missionTick(state);
    expect(target.inspections).toBe(0);
    unchanged(state, () => issue(state, target, 'complete'));
  });

  it('requires intercept-code then the specific relay investigation; purchased code alone is insufficient', () => {
    const state = createGame(9), target = accept(state, 'investigation');
    state.code = true;
    missionSurvey(state, target.destination); expect(target.progress).toBe(0);
    unchanged(state, () => issue(state, target, 'complete'));
    missionIntercept(state);
    expect(target.investigationIntercepted).toBe(true);
    missionSurvey(state, 's0-signal1'); expect(target.progress).toBe(0);
    missionSurvey(state, target.destination);
    expect(issue(state, target, 'complete')).toEqual({ ok: true });
  });

  it('does not apply an intercepted cipher to another system’s investigation', () => {
    const state = createGame(9), target = accept(state, 'investigation');
    state.systemId = 's1'; state.locationId = 's1-station'; missionIntercept(state);
    expect(target.investigationIntercepted).toBe(false);
  });

  it.each(['courier', 'freight', 'emergency', 'passenger', 'exploration', 'salvage', 'bounty', 'escort', 'recovery', 'smuggling', 'investigation'] as const)('makes %s failure/abandon terminal and releases reserved entities/capacity', kind => {
    const state = createGame(10); state.ships[0].cargo.medicine = 1;
    const target = accept(state, kind);
    state.ships[0].credits = 0;
    expect(issue(state, target, 'abandon')).toEqual({ ok: true });
    expect(target.status).toBe('failed'); expect(state.ships[0].debt).toBe(5);
    expect(target.failureReason).toContain('abandoned');
    expect(convoyShips(state)).toHaveLength(0);
    expect(cargoUsed(state)).toBe(1); // The player’s owned medicine is not reserved freight.
    unchanged(state, () => issue(state, target, 'complete'));
    unchanged(state, () => issue(state, target));
  });

  it('expires reservations without charging abandonment compensation and enforces twelve active contracts', () => {
    const state = createGame(11), target = accept(state, 'freight');
    const before = state.ships[0].credits;
    state.tick = target.deadline + 1; missionTick(state);
    expect(target.status).toBe('failed'); expect(cargoUsed(state)).toBe(0);
    expect(state.ships[0].credits).toBe(before);
    const crowded = createGame(11);
    for (let i = 0; i < 12; i++) crowded.contracts.push({ ...contract(crowded, 'courier'), id: `active-${i}`, status: 'active' });
    unchanged(crowded, () => issue(crowded, contract(crowded, 'courier')));
  });

  it('rejects unavailable freight capacity atomically and leaves unrelated commands for other systems', () => {
    const state = createGame(12); state.ships[0].capacity = 2;
    unchanged(state, () => issue(state, contract(state, 'freight')));
    const before = JSON.stringify(state);
    expect(missionCommand(state, { type: 'power', ship: 'player', system: 'engines', delta: 1 })).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('physical authored derelict outcomes', () => {
  it('authors finite, compartment-specific logs, recorder, components, cargo, fuel, survivor and threat', () => {
    expect(new Set(Object.values(COMPARTMENT_OUTCOMES).map(outcome => outcome.kind)).size).toBe(7);
    const state = createGame(12), ship = wreck(state);
    state.ships[0].fuel = 6;
    const before = state.ships[0].credits;
    for (const kind of ['sensors', 'cockpit', 'engines', 'shields', 'doors', 'oxygen', 'reactor', 'ew', 'medbay', 'weapons'] as const) expect(search(state, ship, kind)).toEqual({ ok: true });
    expect(state.ships[0].cargo).toEqual({ 'flight-recorder:s0-wreck': 1, parts: 4, food: 2, medicine: 1 });
    expect(state.ships[0].fuel).toBe(8); expect(state.ships[0].credits).toBe(before);
    expect(state.rewards).toContain('wreck-log:s0-wreck:sensors');
    expect(state.crew.find(crew => crew.name === 'Dr. Sable')).toMatchObject({ health: 35, home: 'player', shipId: ship.id });
    const threat = state.crew.find(crew => crew.name === 'Marooned scavenger')!;
    expect(threat).toMatchObject({ health: 55, home: 'enemy', shipId: ship.id, task: 'fight' });
    expect(ship.rooms.find(room => room.system === 'weapons')).toMatchObject({ searched: true, fire: .35, oxygen: .3 });
    expect(state.region[0].locations.find(location => location.id === state.locationId)?.depleted).toBe(true);
    expect(state.crew[0].task).toBe('fight');
    const room = ship.rooms.find(candidate => candidate.system === 'cockpit')!;
    unchanged(state, () => missionSearch(state, ship.id, room.id, state.crew[0].id));
    const restored: GameState = JSON.parse(JSON.stringify(state));
    unchanged(restored, () => missionSearch(restored, ship.id, room.id, restored.crew[0].id));
  });

  it('requires live, present, stationary crew and a physically completed search task', () => {
    const state = createGame(13), ship = wreck(state), room = ship.rooms[0], crew = state.crew[0];
    const attempt = () => missionSearch(state, ship.id, room.id, crew.id);
    unchanged(state, attempt);
    crew.shipId = ship.id; crew.room = room.id; crew.task = 'search'; crew.progress = 99;
    unchanged(state, attempt);
    crew.progress = 100; crew.path = [room.id]; unchanged(state, attempt);
    crew.path = []; crew.health = 0; unchanged(state, attempt);
    crew.health = 100; crew.task = 'move'; unchanged(state, attempt);
    crew.task = 'search'; crew.room = ship.rooms[1].id; unchanged(state, attempt);
    crew.room = room.id;
    const defender = createCrew(ship.id, true)[0]; defender.home = 'enemy'; defender.room = room.id;
    state.crew.push(defender); unchanged(state, attempt);
    defender.health = 0;
    expect(attempt()).toEqual({ ok: true });
  });

  it('rejects whole cargo/fuel outcomes without partial mutation and lets cargo-free logs fit a full hold', () => {
    const state = createGame(14), ship = wreck(state), p = state.ships[0];
    p.capacity = 1;
    const room = ship.rooms.find(candidate => candidate.system === 'engines')!, crew = state.crew[0];
    crew.shipId = ship.id; crew.room = room.id; crew.task = 'search'; crew.progress = 100;
    unchanged(state, () => missionSearch(state, ship.id, room.id, crew.id));
    p.cargo.food = 1;
    expect(search(state, ship, 'sensors')).toEqual({ ok: true });
    const fuel = ship.rooms.find(candidate => candidate.system === 'reactor')!;
    crew.room = fuel.id; crew.task = 'search'; crew.progress = 100; p.fuel = p.maxFuel - 1;
    unchanged(state, () => missionSearch(state, ship.id, fuel.id, crew.id));
    p.fuel = p.maxFuel - 2;
    expect(missionSearch(state, ship.id, fuel.id, crew.id)).toEqual({ ok: true });
    expect(p.fuel).toBe(p.maxFuel);
  });

  it.each(['medbay', 'weapons'] as const)('rejects %s entity creation at 32 crew without consuming the room', kind => {
    const state = createGame(15), ship = wreck(state), crew = state.crew[0], room = ship.rooms.find(candidate => candidate.system === kind)!;
    while (state.crew.length < 32) state.crew.push({ ...createCrew('player')[0], id: `extra-${state.crew.length}` });
    crew.shipId = ship.id; crew.room = room.id; crew.task = 'search'; crew.progress = 100;
    unchanged(state, () => missionSearch(state, ship.id, room.id, crew.id));
  });

  it('uses actual tactical search progress before paying a compartment once', () => {
    const state = createGame(16), ship = wreck(state), crew = state.crew[0], room = ship.rooms.find(candidate => candidate.system === 'sensors')!;
    crew.shipId = ship.id; crew.room = room.id; crew.task = 'search'; crew.progress = 0;
    for (let tick = 0; tick < 100; tick++) { state.tick++; tacticalTick(state); }
    expect(crew.progress).toBe(100);
    expect(missionSearch(state, ship.id, room.id, crew.id)).toEqual({ ok: true });
    expect(room.searched).toBe(true);
  });

  it('spawns a genuine interior combat/fire/air hazard, not an event-only threat', () => {
    const state = createGame(17), ship = wreck(state), room = ship.rooms.find(candidate => candidate.system === 'weapons')!;
    expect(search(state, ship, 'weapons')).toEqual({ ok: true });
    const crew = state.crew[0], hostile = state.crew.find(candidate => candidate.home === 'enemy')!;
    for (const door of ship.doors) door.open = false;
    const before = { crew: crew.health, hostile: hostile.health, oxygen: room.oxygen };
    state.tick++; tacticalTick(state);
    expect(crew.health).toBeLessThan(before.crew);
    expect(hostile.health).toBeLessThan(before.hostile);
    expect(before.crew - crew.health).toBeGreaterThan(.05);
    expect(before.hostile - hostile.health).toBeGreaterThan(.05);
    expect(room.fire).toBeGreaterThan(0);
    expect(room.oxygen).toBeLessThan(before.oxygen);
  });

  it('keeps survivors on the wreck as persistent, commandable crew until physically recalled', () => {
    const state = createGame(18), ship = wreck(state);
    expect(search(state, ship, 'medbay')).toEqual({ ok: true });
    const survivor = state.crew.find(crew => crew.name === 'Dr. Sable')!;
    const loaded: GameState = JSON.parse(JSON.stringify(state));
    expect(loaded.crew.find(crew => crew.id === survivor.id)).toEqual(survivor);
    expect(tacticalCommand(state, { type: 'crew', crew: survivor.id, room: ship.rooms[0].id, task: 'move' })).toEqual({ ok: true });
    expect(survivor.shipId).toBe(ship.id);
    expect(survivor.path.length).toBeGreaterThan(0);
  });

  it('provides all seven distinct survey categories across actual generated content', () => {
    const state = createGame(19);
    const kinds = new Set(state.region.flatMap((system, index) => system.locations.map(location => surveyKind(location, index))));
    expect([...kinds].sort()).toEqual([...SURVEY_CATEGORIES].sort());
    expect(surveyKind(state.region[0].locations.find(location => location.id === 's0-planet1')!, 0)).toBe('biological');
    expect(surveyKind(state.region[0].locations.find(location => location.id === 's0-signal1')!, 0)).toBe('route');
    expect(surveyKind(state.region[0].locations.find(location => location.id === 's0-belt')!)).toBe('mineral');
    expect(discoveryKind(state, 'route:s0')).toBe('route');
    expect(discoveryKind(state, 'intercept:s0-signal1')).toBe('faction');
    expect(discoveryKind(state, 's0-planet1')).toBe('biological');
    expect(discoveryKind(state, 'survey:ruin:s0-planet2')).toBe('ruin');
    expect(discoveryKind(state, 'survey:s0-belt')).toBe('mineral');
    expect(Object.keys(SURVEY_VALUES).sort()).toEqual([...SURVEY_CATEGORIES].sort());
    expect(new Set(Object.values(SURVEY_VALUES)).size).toBeGreaterThan(1);
  });
});
