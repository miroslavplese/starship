import { describe, expect, it } from 'vitest';
import { createCrew, createShip } from '../../src/content/ships';
import { WEAPONS } from '../../src/content/weapons';
import { currentLocation, currentSystem, event, income, player, random } from '../../src/sim/core';
import { path, tacticalCommand, tacticalTick } from '../../src/sim/tactical';
import { createGame, step } from '../../src/sim/game';
import type { Command, Family, GameState, Ship, SystemKind } from '../../src/sim/types';

function fixture(combat = true): GameState {
  const home = createShip('p');
  const enemy = createShip('e', true);
  return {
    version: 1, contentVersion: 1, seed: 1, rng: 1, tick: 1, nextId: 1,
    phase: 'expedition', difficulty: 'standard', ships: combat ? [home, enemy] : [home],
    crew: [...createCrew(home.id), ...(combat ? createCrew(enemy.id, true) : [])],
    projectiles: [], region: [{
      id: 'sol', name: 'Sol', risk: 0, faction: 'neutral', economy: 'industrial',
      routes: [], known: true,
      locations: [{ id: 'station', name: 'Station', kind: 'station', known: 3, surveyed: false, depleted: false, archive: false, deposit: 0 }],
    }], systemId: 'sol', locationId: 'station', markets: [], contracts: [],
    reputation: {}, discoveries: [], soldData: [], coordinates: [], archive: false,
    guardian: false, code: false, beacon: false, encounter: combat ? 'hostile' : 'none',
    rewards: [], travel: null, action: null, customs: false, events: [], queue: [],
    sequence: 0, tutorial: 0,
  };
}
const unit = (ship: Ship, kind: SystemKind) => ship.systems.find(candidate => candidate.kind === kind)!;
const room = (ship: Ship, kind: SystemKind) => ship.rooms.find(candidate => candidate.system === kind)!;
function advance(state: GameState, ticks = 1): void {
  for (let count = 0; count < ticks; count++) { state.tick++; tacticalTick(state); }
}
function impact(state: GameState, family: Family, target = player(state), kind: SystemKind = 'weapons'): void {
  const source = state.ships.find(ship => ship.id !== target.id)!;
  state.projectiles.push({ id: `test-${state.nextId++}`, source: source.id, target: target.id, room: room(target, kind).id, family, remaining: 1, total: 1 });
  advance(state);
}
function noEvasion(ship: Ship): void {
  unit(ship, 'engines').power = 0;
  unit(ship, 'shields').power = 0;
  ship.shields = 0;
}
function away(state: GameState, destination: Ship, kind: SystemKind = 'cockpit') {
  const crew = state.crew.find(candidate => candidate.home === player(state).id)!;
  crew.shipId = destination.id;
  crew.room = room(destination, kind).id;
  crew.path = [];
  crew.task = 'idle';
  return crew;
}

describe('content and core contracts', () => {
  it('creates independent valid unlike layouts, systems, doors and persistent crew', () => {
    const home = createShip('p');
    const enemy = createShip('e', true);
    const wreck = createShip('wreck', false, true);
    expect(home.hull).toBe(30);
    expect(home.credits).toBe(60);
    expect(home.fuel).toBe(7);
    expect(home.missiles).toBe(4);
    expect(new Set(home.rooms.map(candidate => candidate.id)).size).toBe(home.rooms.length);
    expect(home.rooms.map(candidate => [candidate.x, candidate.y])).not.toEqual(enemy.rooms.map(candidate => [candidate.x, candidate.y]));
    for (const ship of [home, enemy, wreck]) {
      for (const candidate of ship.rooms) {
        expect(unit(ship, candidate.system)).toBeDefined();
        expect(path(ship, ship.rooms[0].id, candidate.id)).not.toBeNull();
        expect(ship.rooms.filter(other => other !== candidate && other.x < candidate.x + candidate.w && other.x + other.w > candidate.x && other.y < candidate.y + candidate.h && other.y + other.h > candidate.y)).toHaveLength(0);
      }
      for (const door of ship.doors) {
        expect(ship.rooms.some(candidate => candidate.id === door.a)).toBe(true);
        expect(door.b === null || ship.rooms.some(candidate => candidate.id === door.b)).toBe(true);
      }
      expect(ship.systems.reduce((sum, candidate) => sum + candidate.power, 0)).toBeLessThanOrEqual(ship.reactor);
    }
    expect(wreck.doctrine).toBe('derelict');
    expect(wreck.rooms.some(candidate => candidate.fire > 0)).toBe(true);
    home.rooms[0].oxygen = 0;
    expect(createShip('p').rooms[0].oxygen).toBe(1);
    for (const crew of createCrew(home.id)) {
      expect(crew.home).toBe(home.id);
      expect(home.rooms.some(candidate => candidate.id === crew.room)).toBe(true);
      expect(crew.health).toBe(100);
    }
    expect(Object.keys(WEAPONS)).toHaveLength(6);
  });

  it('uses serializable xorshift32 including zero normalization', () => {
    const state = fixture();
    state.rng = 12345;
    expect(random(state)).toBeCloseTo(.776938705239445, 14);
    const clone = structuredClone(state);
    expect(Array.from({ length: 20 }, () => random(state))).toEqual(Array.from({ length: 20 }, () => random(clone)));
    state.rng = 0;
    expect(random(state)).toBeGreaterThan(0);
    expect(state.rng).toBeGreaterThan(0);
  });

  it('bounds journal messages/history and repays exactly 25% of ordinary income', () => {
    const state = fixture(false);
    for (let index = 0; index < 205; index++) event(state, 'test', 'x'.repeat(600));
    expect(state.events).toHaveLength(200);
    expect(state.events[0].id).toBe(6);
    expect(state.events[0].message).toHaveLength(512);
    const home = player(state);
    home.debt = 12;
    income(state, 40);
    expect(home.debt).toBe(2);
    expect(home.credits).toBe(90);
    income(state, 20);
    expect(home.debt).toBe(0);
    expect(home.credits).toBe(108);
    expect(() => income(state, -1)).toThrow();
    expect(() => income(state, Infinity)).toThrow();
    expect(currentSystem(state).id).toBe('sol');
    expect(currentLocation(state).id).toBe('station');
  });
});

describe('atomic commands and physical routing', () => {
  it('routes deterministically through closed unlocked doors, not locked/destroyed edges', () => {
    const ship = createShip('p');
    const from = ship.rooms[0].id;
    const to = ship.rooms[1].id;
    for (const door of ship.doors) door.open = false;
    expect(path(ship, from, to)).toEqual(path(ship, from, to));
    expect(path(ship, from, from)).toEqual([]);
    expect(path(ship, 'unknown', to)).toBeNull();
    for (const door of ship.doors) if (door.a === from || door.b === from) door.locked = true;
    expect(path(ship, from, to)).toBeNull();
    for (const door of ship.doors) { door.locked = false; if (door.a === from || door.b === from) door.health = 0; }
    expect(path(ship, from, to)).toBeNull();
  });

  it('rejects invalid and enemy-owned orders without any mutation, cost, event or RNG draw', () => {
    const state = fixture();
    const enemy = state.ships[1];
    const invalid: Command[] = [
      { type: 'power', ship: 'e', system: 'engines', delta: 1 },
      { type: 'power', ship: 'p', system: 'engines', delta: .5 },
      { type: 'power', ship: 'p', system: 'reactor', delta: 1 },
      { type: 'power', ship: 'p', system: 'weapons', delta: 99 },
      { type: 'power', ship: 'p', system: 'engines', delta: -3 },
      { type: 'crew', crew: 'e-crew-1', room: enemy.rooms[1].id, task: 'move' },
      { type: 'crew', crew: 'p-crew-1', room: enemy.rooms[1].id, task: 'move' },
      { type: 'crew', crew: 'p-crew-1', room: room(player(state), 'cockpit').id, task: 'sabotage' },
      { type: 'door', ship: 'e', door: enemy.doors[0].id },
      { type: 'door', ship: 'p', door: 'missing' },
      { type: 'target', weapon: enemy.weapons[0].id, room: player(state).rooms[0].id, auto: true },
      { type: 'target', weapon: player(state).weapons[0].id, room: player(state).rooms[0].id, auto: true },
      { type: 'ew', mode: 'jam' },
      { type: 'maneuver', bearing: 'bow' },
      { type: 'surrender', accept: true },
    ];
    for (const command of invalid) {
      const before = structuredClone(state);
      expect(tacticalCommand(state, command)?.ok, command.type).toBe(false);
      expect(state).toEqual(before);
    }
    const before = structuredClone(state);
    expect(tacticalCommand(state, { type: 'board', crew: 'p-crew-1' })).toBeNull();
    expect(state).toEqual(before);
  });

  it('opens doors during real movement and does no remote repairs', () => {
    const state = fixture(false);
    const ship = player(state);
    const crew = state.crew[0];
    const target = ship.rooms[1];
    unit(ship, target.system).health = 20;
    ship.doors.forEach(door => { door.open = false; });
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: target.id, task: 'repair' })?.ok).toBe(true);
    advance(state, 15);
    expect(crew.room).not.toBe(target.id);
    expect(unit(ship, target.system).health).toBe(20);
    advance(state);
    expect(crew.room).toBe(target.id);
    expect(unit(ship, target.system).health).toBeGreaterThan(20);
    expect(ship.doors.find(door => door.a === ship.rooms[0].id && door.b === target.id || door.b === ship.rooms[0].id && door.a === target.id)?.open).toBe(true);
  });

  it('recomputes a blocked route and repairs destroyed adjacent doors physically', () => {
    const state = fixture(false);
    const ship = player(state);
    const crew = state.crew[0];
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: ship.rooms[1].id, task: 'move' })?.ok).toBe(true);
    const adjacent = ship.doors.filter(door => door.a === crew.room || door.b === crew.room);
    adjacent.forEach(door => { door.locked = true; door.health = 0; });
    advance(state);
    expect(crew.path).toEqual([]);
    expect(crew.task).toBe('idle');
    expect(state.events.some(candidate => candidate.kind === 'blocked')).toBe(true);
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: crew.room, task: 'repair' })?.ok).toBe(true);
    advance(state);
    expect(adjacent.some(door => door.health > 0)).toBe(true);
    expect(adjacent.every(door => door.locked)).toBe(true);
  });

  it('locks close doors; locked doors reject toggles atomically', () => {
    const state = fixture(false);
    const door = player(state).doors[0];
    expect(tacticalCommand(state, { type: 'door', ship: 'p', door: door.id, lock: true })?.ok).toBe(true);
    expect(door.open).toBe(false);
    const before = structuredClone(state);
    expect(tacticalCommand(state, { type: 'door', ship: 'p', door: door.id })?.ok).toBe(false);
    expect(state).toEqual(before);
    expect(tacticalCommand(state, { type: 'door', ship: 'p', door: door.id, lock: false })?.ok).toBe(true);
    expect(tacticalCommand(state, { type: 'door', ship: 'p', door: door.id })?.ok).toBe(true);
    expect(door.open).toBe(true);
  });
});

describe('atmosphere, emergencies and stations', () => {
  it('conserves closed-network air, including extreme outgoing and incoming flows', () => {
    const state = fixture(false);
    const ship = player(state);
    unit(ship, 'oxygen').power = 0;
    ship.rooms.forEach((candidate, index) => { candidate.oxygen = index === 0 ? 1 : .01; });
    const first = ship.rooms[0], second = ship.rooms[1];
    for (let index = 0; index < 100; index++) ship.doors.push({ id: `extra-${index}`, a: first.id, b: second.id, open: true, locked: false, health: 100 });
    const total = () => ship.rooms.reduce((sum, candidate) => sum + candidate.oxygen * candidate.w * candidate.h, 0);
    const initial = total();
    advance(state);
    expect(total()).toBeCloseTo(initial, 10);
    expect(ship.rooms.every(candidate => candidate.oxygen >= 0 && candidate.oxygen <= 1)).toBe(true);
  });

  it('vents, closes, repairs and refills; closed compartments are not magically serviced', () => {
    const state = fixture(false);
    const ship = player(state);
    ship.doors.forEach(door => { door.open = false; });
    const oxygen = room(ship, 'oxygen');
    const isolated = room(ship, 'cockpit');
    oxygen.oxygen = .5;
    isolated.oxygen = .5;
    advance(state);
    expect(oxygen.oxygen).toBeCloseTo(.501, 6);
    expect(isolated.oxygen).toBe(.5);
    const airlock = ship.doors.find(door => door.b === null)!;
    const airlockRoom = ship.rooms.find(candidate => candidate.id === airlock.a)!;
    airlock.open = true;
    const before = airlockRoom.oxygen;
    advance(state, 10);
    expect(airlockRoom.oxygen).toBeLessThan(before);
    airlock.open = false;
    ship.doors.forEach(door => { if (door.b) door.open = true; });
    ship.rooms.forEach(candidate => { candidate.oxygen = .5; });
    advance(state, 10);
    expect(ship.rooms.every(candidate => candidate.oxygen > .5)).toBe(true);
  });

  it('uses oxygen thresholds and physical extinguishing, severity repair and powered healing', () => {
    const state = fixture(false);
    const ship = player(state);
    ship.doors.forEach(door => { door.open = false; });
    unit(ship, 'oxygen').power = 0;
    const crew = state.crew[1];
    const current = ship.rooms.find(candidate => candidate.id === crew.room)!;
    current.oxygen = .04;
    current.fire = .8;
    const health = crew.health;
    advance(state);
    expect(current.fire).toBe(0);
    expect(crew.health).toBeCloseTo(health - .1, 8);
    current.oxygen = .8;
    current.fire = .5;
    current.breach = .2;
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: current.id, task: 'extinguish' })?.ok).toBe(true);
    advance(state, 80);
    expect(current.fire).toBe(0);
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: current.id, task: 'repair' })?.ok).toBe(true);
    advance(state, 80);
    expect(current.breach).toBe(0);
    const bay = room(ship, 'medbay');
    crew.room = bay.id;
    crew.path = [];
    crew.health = 50;
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: bay.id, task: 'heal' })?.ok).toBe(false);
    unit(ship, 'medbay').power = 1;
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: bay.id, task: 'heal' })?.ok).toBe(true);
    advance(state, 20);
    expect(crew.health).toBeCloseTo(53, 8);
    unit(ship, 'medbay').power = 0;
    advance(state, 20);
    expect(crew.health).toBeCloseTo(53, 8);
  });

  it('methodical repair and swift movement have real effects; fire cannot grow in thin air', () => {
    const state = fixture(false);
    const ship = player(state);
    unit(ship, 'oxygen').power = 0;
    ship.doors.forEach(door => { door.open = false; });
    const crew = state.crew[1];
    const current = ship.rooms.find(candidate => candidate.id === crew.room)!;
    current.oxygen = .1;
    current.fire = .4;
    advance(state);
    expect(current.fire).toBe(.4);
    current.fire = 0;
    unit(ship, current.system).health = 50;
    crew.task = 'repair';
    const clone = structuredClone(state);
    clone.crew[1].trait = 'none';
    advance(state);
    advance(clone);
    expect(unit(ship, current.system).health).toBeGreaterThan(unit(player(clone), current.system).health);
  });

  it('physically manned weapon and shield skills alter charge/recharge, not remote assignments', () => {
    const state = fixture();
    state.ships[1].weapons = [];
    const unstaffed = structuredClone(state);
    unstaffed.crew[2].room = room(player(unstaffed), 'medbay').id;
    advance(state, 10);
    advance(unstaffed, 10);
    expect(player(state).weapons[0].charge).toBeGreaterThan(player(unstaffed).weapons[0].charge);
    const staffed = fixture(false);
    const ordinary = structuredClone(staffed);
    player(staffed).shields = 0;
    player(ordinary).shields = 0;
    staffed.crew[0].room = room(player(staffed), 'shields').id;
    advance(staffed, 74);
    advance(ordinary, 74);
    expect(player(staffed).shields).toBe(1);
    expect(player(ordinary).shields).toBe(0);
  });
});

describe('power, FTL and maneuver', () => {
  it('clamps damaged/reactor/ion allocations without free power on recovery', () => {
    const state = fixture(false);
    const ship = player(state);
    const weapons = unit(ship, 'weapons');
    weapons.ion = 3;
    advance(state);
    expect(weapons.power).toBe(0);
    advance(state, 2);
    expect(weapons.ion).toBe(0);
    expect(weapons.power).toBe(0);
    unit(ship, 'reactor').health = 20;
    advance(state);
    expect(ship.systems.reduce((sum, candidate) => sum + candidate.power, 0)).toBeLessThanOrEqual(2);
    expect(tacticalCommand(state, { type: 'power', ship: ship.id, system: 'weapons', delta: 1 })?.ok).toBe(false);
  });

  it('charges only with cockpit/engines/living aboard crew; stranding is not defeat', () => {
    const state = fixture(false);
    const ship = player(state);
    advance(state, 10);
    expect(ship.ftl).toBe(10);
    unit(ship, 'cockpit').health = 0;
    advance(state, 10);
    expect(ship.ftl).toBe(10);
    unit(ship, 'cockpit').health = 100;
    const wreck = createShip('w', false, true);
    wreck.rooms.forEach(candidate => { candidate.fire = 0; candidate.breach = 0; candidate.oxygen = 1; });
    state.ships.push(wreck);
    state.crew.forEach(crew => { crew.shipId = wreck.id; crew.room = wreck.rooms[0].id; });
    advance(state, 10);
    expect(ship.ftl).toBe(10);
    expect(state.phase).toBe('expedition');
  });

  it('commits engine power for exactly 100 powered ticks and pauses on damage', () => {
    const state = fixture(false);
    const ship = player(state);
    unit(ship, 'engines').power = 1;
    expect(tacticalCommand(state, { type: 'maneuver', bearing: 'stern' })?.ok).toBe(true);
    advance(state, 50);
    expect(ship.bearing).toBe('bow');
    expect(ship.maneuver).toBe(50);
    expect(ship.ftl).toBe(0);
    unit(ship, 'engines').health = 0;
    advance(state, 20);
    expect(ship.maneuver).toBe(50);
    unit(ship, 'engines').health = 100;
    unit(ship, 'engines').power = 1;
    advance(state, 50);
    expect(ship.maneuver).toBe(0);
    expect(ship.bearing).toBe('stern');
    advance(state);
    expect(ship.ftl).toBe(1);
  });

  it('changes the attacked armor section only after a paid 100-tick attacker maneuver', () => {
    const state = fixture();
    const attacker = player(state), defender = state.ships[1];
    defender.weapons = [];
    defender.armor.bow = 3;
    defender.armor.port = 0;
    defender.shields = 0;
    unit(defender, 'shields').power = 0;
    unit(defender, 'shields').ion = 1000;
    unit(defender, 'cockpit').ion = 1000;
    const baseline = structuredClone(state);
    impact(baseline, 'laser', baseline.ships[1]);
    expect(baseline.ships[1].hull).toBe(22);
    expect(baseline.ships[1].armor.bow).toBe(2.75);
    unit(attacker, 'engines').power = 1;
    expect(tacticalCommand(state, { type: 'maneuver', bearing: 'port' })?.ok).toBe(true);
    advance(state, 99);
    expect(attacker.bearing).toBe('bow');
    expect(attacker.maneuver).toBe(1);
    expect(attacker.ftl).toBe(0);
    advance(state);
    expect(attacker.bearing).toBe('port');
    state.rng = 1;
    const hull = defender.hull;
    impact(state, 'laser', defender);
    expect(defender.hull).toBe(hull - 3);
    expect(defender.armor.bow).toBe(3);
    expect(defender.armor.port).toBe(0);
    expect(state.events.some(candidate => candidate.kind === 'hit' && candidate.message.includes('port armor'))).toBe(true);
  });
});

describe('six weapon families, power priority and damage ordering', () => {
  it('rejects invalid priority edits and enemy weapon ownership atomically', () => {
    const state = fixture();
    const home = player(state);
    const invalid: Command[] = [
      { type: 'weapon-priority', weapon: state.ships[1].weapons[0].id, direction: -1 },
      { type: 'weapon-priority', weapon: 'missing', direction: 1 },
      { type: 'weapon-priority', weapon: home.weapons[0].id, direction: -1 },
      { type: 'weapon-priority', weapon: home.weapons[home.weapons.length - 1].id, direction: 1 },
      { type: 'weapon-priority', weapon: home.weapons[0].id, direction: 0 } as unknown as Command,
    ];
    for (const command of invalid) {
      const before = structuredClone(state);
      expect(tacticalCommand(state, command)?.ok).toBe(false);
      expect(state).toEqual(before);
    }
    const original = home.weapons.map(weapon => weapon.id);
    expect(tacticalCommand(state, { type: 'weapon-priority', weapon: original[1], direction: -1 })?.ok).toBe(true);
    expect(home.weapons.map(weapon => weapon.id)).toEqual([...original].reverse());
    expect(tacticalCommand(state, { type: 'weapon-priority', weapon: original[1], direction: 1 })?.ok).toBe(true);
    expect(home.weapons.map(weapon => weapon.id)).toEqual(original);
  });

  it.each(Object.keys(WEAPONS) as Family[])('powers and fires a later-installed %s after explicit priority promotion', family => {
    const state = fixture();
    const home = player(state), enemy = state.ships[1];
    enemy.weapons = [];
    const stats = WEAPONS[family];
    const gun = { id: 'later-installation', family, charge: stats.chargeTicks - 1, target: null, auto: false };
    home.weapons.push(gun);
    unit(home, 'weapons').power = stats.power;
    const original = home.weapons.slice(0, -1);
    expect(tacticalCommand(state, { type: 'weapon-priority', weapon: gun.id, direction: -1 })?.ok).toBe(true);
    expect(tacticalCommand(state, { type: 'weapon-priority', weapon: gun.id, direction: -1 })?.ok).toBe(true);
    expect(home.weapons[0]).toBe(gun);
    expect(tacticalCommand(state, { type: 'target', weapon: gun.id, room: enemy.rooms[0].id, auto: false })?.ok).toBe(true);
    advance(state);
    expect(state.projectiles.filter(projectile => projectile.family === family)).toHaveLength(stats.projectiles);
    expect(gun.charge).toBe(0);
    expect(original.every(weapon => weapon.charge === 0)).toBe(true);
    expect(home.missiles).toBe(4 - stats.ammo);
  });

  it('reprioritizing transfers future charge allocation without changing stored charge or target orders', () => {
    const state = fixture();
    state.ships[1].weapons = [];
    const home = player(state), [laser, ion] = home.weapons;
    unit(home, 'weapons').power = 1;
    laser.charge = 20;
    ion.charge = 30;
    tacticalCommand(state, { type: 'target', weapon: ion.id, room: state.ships[1].rooms[0].id, auto: true });
    const target = ion.target;
    expect(tacticalCommand(state, { type: 'weapon-priority', weapon: ion.id, direction: -1 })?.ok).toBe(true);
    expect(ion.charge).toBe(30);
    expect(laser.charge).toBe(20);
    expect(ion.target).toBe(target);
    expect(ion.auto).toBe(true);
    advance(state, 10);
    expect(ion.charge).toBeGreaterThan(30);
    expect(laser.charge).toBe(20);
  });

  it('does not charge unpowered weapons or spend ammo before launch; manual fire fires once', () => {
    const state = fixture();
    const ship = player(state);
    const enemy = state.ships[1];
    enemy.weapons = [];
    const gun = ship.weapons[0];
    unit(ship, 'weapons').power = 0;
    expect(tacticalCommand(state, { type: 'target', weapon: gun.id, room: enemy.rooms[0].id, auto: false })?.ok).toBe(true);
    advance(state, 10);
    expect(gun.charge).toBe(0);
    unit(ship, 'weapons').power = 1;
    gun.charge = WEAPONS.laser.chargeTicks;
    advance(state);
    expect(state.projectiles).toHaveLength(1);
    expect(gun.target).toBeNull();
    expect(ship.weapons[1].charge).toBe(0);
    expect(ship.missiles).toBe(4);
    gun.family = 'missile';
    gun.charge = WEAPONS.missile.chargeTicks;
    unit(ship, 'weapons').power = 2;
    ship.missiles = 0;
    expect(tacticalCommand(state, { type: 'target', weapon: gun.id, room: enemy.rooms[0].id, auto: true })?.ok).toBe(true);
    advance(state);
    expect(ship.missiles).toBe(0);
    expect(state.projectiles).toHaveLength(1);
    ship.missiles = 1;
    advance(state);
    expect(ship.missiles).toBe(0);
    expect(state.projectiles).toHaveLength(2);
  });

  it('laser consumes a shield layer; ion drains shields or locks power for 80 ticks', () => {
    const state = fixture();
    const ship = player(state);
    state.ships[1].weapons = [];
    unit(ship, 'engines').power = 0;
    const hull = ship.hull;
    impact(state, 'laser');
    expect(ship.hull).toBe(hull);
    expect(ship.shields).toBe(0);
    state.rng = 1;
    impact(state, 'ion');
    expect(unit(ship, 'weapons').ion).toBe(80);
    expect(unit(ship, 'weapons').power).toBe(0);
    expect(ship.hull).toBe(hull);
    advance(state, 80);
    expect(unit(ship, 'weapons').ion).toBe(0);
    expect(unit(ship, 'weapons').power).toBe(0);
  });

  it('missiles bypass shields and armor reduces only hull, not listed system damage', () => {
    const state = fixture();
    const ship = player(state);
    state.ships[1].weapons = [];
    unit(ship, 'engines').power = 0;
    ship.armor.bow = 3;
    impact(state, 'missile');
    expect(ship.hull).toBe(25);
    expect(ship.shields).toBe(1);
    expect(unit(ship, 'weapons').health).toBeCloseTo(65, 1);
    expect(ship.armor.bow).toBe(2.75);
  });

  it('beams never evade, are blocked without draining shields and cross adjacent rooms', () => {
    const state = fixture();
    const ship = player(state);
    state.ships[1].weapons = [];
    state.rng = 12345;
    impact(state, 'beam');
    expect(ship.hull).toBe(30);
    expect(ship.shields).toBe(1);
    noEvasion(ship);
    impact(state, 'beam');
    expect(ship.hull).toBe(26);
    expect(ship.systems.filter(candidate => candidate.health < 100).length).toBeGreaterThanOrEqual(2);
  });

  it('kinetic projectiles strip layers individually and resolve once', () => {
    const state = fixture();
    const ship = player(state);
    state.ships[1].weapons = [];
    unit(ship, 'engines').power = 0;
    unit(ship, 'shields').power = 4;
    ship.shields = 2;
    for (let index = 0; index < 3; index++) state.projectiles.push({ id: `kinetic-${index}`, source: 'e', target: 'p', room: room(ship, 'weapons').id, family: 'kinetic', remaining: 1, total: 1 });
    advance(state);
    expect(ship.shields).toBe(0);
    expect(ship.hull).toBe(29);
    expect(state.projectiles).toHaveLength(0);
    const hull = ship.hull;
    advance(state);
    expect(ship.hull).toBe(hull);
    expect(WEAPONS.kinetic.projectiles).toBe(3);
  });

  it('experimental weapons have a long charge and disrupt both systems and atmosphere', () => {
    const state = fixture();
    const ship = player(state);
    state.ships[1].weapons = [];
    noEvasion(ship);
    impact(state, 'experimental');
    expect(ship.hull).toBe(27);
    expect(unit(ship, 'weapons').ion).toBe(100);
    expect(room(ship, 'weapons').oxygen).toBeLessThan(.8);
    expect(WEAPONS.experimental.chargeTicks).toBeGreaterThan(WEAPONS.laser.chargeTicks * 3);
    expect(WEAPONS.experimental.power).toBeGreaterThan(WEAPONS.laser.power);
  });

  it('cockpit/pilot/engine evasion changes seeded accuracy and disabled cockpit removes it', () => {
    const enabled = fixture();
    const disabled = structuredClone(enabled);
    for (const state of [enabled, disabled]) {
      state.rng = 12345;
      state.ships[1].weapons = [];
      unit(player(state), 'shields').power = 0;
      player(state).shields = 0;
    }
    unit(player(disabled), 'cockpit').health = 0;
    impact(enabled, 'laser');
    impact(disabled, 'laser');
    expect(player(enabled).hull).toBe(30);
    expect(player(disabled).hull).toBe(28);
  });

  it('caps projectile batches without partial ammunition spending', () => {
    const state = fixture();
    const ship = player(state);
    state.ships[1].weapons = [];
    ship.weapons = [{ id: 'gun', family: 'kinetic', charge: 999, target: state.ships[1].rooms[0].id, auto: true }];
    for (let index = 0; index < 255; index++) state.projectiles.push({ id: `old-${index}`, source: 'p', target: 'e', room: state.ships[1].rooms[0].id, family: 'laser', remaining: 100, total: 100 });
    advance(state);
    expect(state.projectiles).toHaveLength(255);
    expect(ship.weapons[0].charge).toBe(WEAPONS.kinetic.chargeTicks);
  });
});

describe('boarding, capture, surrender, AI and encounter rewards', () => {
  it('orders owned away crew, advances search work and leaves salvage completion to strategy', () => {
    const state = fixture(false);
    const wreck = createShip('w', false, true);
    wreck.rooms.forEach(candidate => { candidate.fire = 0; candidate.breach = 0; candidate.oxygen = 1; });
    state.ships.push(wreck);
    state.encounter = 'derelict';
    const crew = away(state, wreck);
    const command: Command = { type: 'crew', crew: crew.id, room: crew.room, task: 'search' };
    player(state).cargo.parts = 20;
    expect(tacticalCommand(state, command)?.ok).toBe(true);
    advance(state, 100);
    expect(crew.progress).toBe(100);
    expect(wreck.rooms[0].searched).toBe(false);
    expect(player(state).cargo.parts).toBe(20);
    player(state).cargo.parts = 19;
    expect(tacticalCommand(state, command)?.ok).toBe(true);
    advance(state, 100);
    expect(wreck.rooms[0].searched).toBe(false);
    expect(player(state).cargo.parts).toBe(19);
    expect(crew.progress).toBe(100);
    expect(crew.task).toBe('search');
    expect(player(state).credits).toBe(60);
  });

  it('science skill accelerates only physically occupied search work', () => {
    const state = fixture(false);
    const wreck = createShip('w', false, true);
    wreck.rooms.forEach(candidate => { candidate.fire = 0; candidate.breach = 0; candidate.oxygen = 1; });
    state.ships.push(wreck);
    const crew = away(state, wreck);
    tacticalCommand(state, { type: 'crew', crew: crew.id, room: crew.room, task: 'search' });
    const trained = structuredClone(state);
    trained.crew[0].skills.science = 3;
    advance(state, 10);
    advance(trained, 10);
    expect(trained.crew[0].progress).toBeGreaterThan(crew.progress);
  });

  it('integrates finite salvage completion with the parent game loop', () => {
    const state = createGame(12345);
    state.locationId = `${state.systemId}-wreck`;
    const wreck = createShip('derelict', false, true);
    wreck.rooms.forEach(candidate => { candidate.fire = 0; candidate.breach = 0; candidate.oxygen = 1; });
    state.ships.push(wreck);
    state.encounter = 'derelict';
    const crew = away(state, wreck);
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: crew.room, task: 'search' })?.ok).toBe(true);
    for (let count = 0; count < 101; count++) step(state);
    expect(wreck.rooms[0].searched).toBe(true);
    const credits = player(state).credits;
    const cargo = structuredClone(player(state).cargo);
    for (let count = 0; count < 101; count++) step(state);
    expect(player(state).credits).toBe(credits);
    expect(player(state).cargo).toEqual(cargo);
  });

  it('lets an away engineer allocate and physically operate abandoned power', () => {
    const state = fixture(false);
    const wreck = createShip('w', false, true);
    wreck.rooms.forEach(candidate => { candidate.fire = 0; candidate.breach = 0; candidate.oxygen = 1; });
    unit(wreck, 'oxygen').health = 100;
    state.ships.push(wreck);
    const crew = away(state, wreck, 'oxygen');
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'oxygen', delta: 1 })?.ok).toBe(true);
    expect(unit(wreck, 'oxygen').power).toBe(1);
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'oxygen', delta: -1 })?.ok).toBe(true);
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: crew.room, task: 'operate' })?.ok).toBe(true);
    advance(state, 20);
    expect(unit(wreck, 'oxygen').power).toBe(1);
  });

  it('requires local living stationary player crew for derelict power and door authority', () => {
    const state = fixture(false);
    const wreck = createShip('w', false, true);
    state.ships.push(wreck);
    const oxygen = unit(wreck, 'oxygen');
    oxygen.health = 100;
    const airlock = wreck.doors.find(door => !door.b)!;
    const powerOrder: Command = { type: 'power', ship: wreck.id, system: 'oxygen', delta: 1 };
    const doorOrder: Command = { type: 'door', ship: wreck.id, door: airlock.id };
    const rejectedWithoutMutation = (command: Command) => {
      const before = structuredClone(state);
      expect(tacticalCommand(state, command)?.ok).toBe(false);
      expect(state).toEqual(before);
    };
    rejectedWithoutMutation(powerOrder);
    rejectedWithoutMutation(doorOrder);
    const crew = away(state, wreck);
    rejectedWithoutMutation(powerOrder);
    rejectedWithoutMutation(doorOrder);
    crew.room = room(wreck, 'oxygen').id;
    crew.path = [room(wreck, 'reactor').id];
    rejectedWithoutMutation(powerOrder);
    crew.path = [];
    crew.health = 0;
    rejectedWithoutMutation(powerOrder);
    crew.health = 100;
    const homePower = player(state).systems.map(candidate => candidate.power);
    expect(tacticalCommand(state, powerOrder)?.ok).toBe(true);
    expect(oxygen.power).toBe(1);
    expect(player(state).systems.map(candidate => candidate.power)).toEqual(homePower);
    rejectedWithoutMutation(doorOrder);
    crew.room = airlock.a;
    crew.path = [wreck.rooms[0].id];
    rejectedWithoutMutation(doorOrder);
    crew.path = [];
    expect(tacticalCommand(state, doorOrder)?.ok).toBe(true);
    expect(airlock.open).toBe(true);
    crew.health = 0;
    rejectedWithoutMutation(doorOrder);
  });

  it('allows reactor/door-controller station access while retaining away reactor and system limits', () => {
    const state = fixture(false);
    const wreck = createShip('w', false, true);
    wreck.rooms.forEach(candidate => { candidate.fire = 0; candidate.breach = 0; });
    unit(wreck, 'oxygen').health = 100;
    state.ships.push(wreck);
    const crew = away(state, wreck, 'reactor');
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'oxygen', delta: 1 })?.ok).toBe(true);
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'shields', delta: 2 })?.ok).toBe(true);
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'engines', delta: 2 })?.ok).toBe(true);
    const before = structuredClone(state);
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'weapons', delta: 1 })?.ok).toBe(false);
    expect(state).toEqual(before);
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'engines', delta: -1 })?.ok).toBe(true);
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'weapons', delta: 1 })?.ok).toBe(true);
    crew.room = room(wreck, 'doors').id;
    const remote = wreck.doors.find(door => door.b && door.a !== crew.room && door.b !== crew.room)!;
    const original = remote.open;
    expect(tacticalCommand(state, { type: 'door', ship: wreck.id, door: remote.id })?.ok).toBe(true);
    expect(remote.open).toBe(!original);
    unit(wreck, 'weapons').ion = 5;
    crew.room = room(wreck, 'reactor').id;
    const locked = structuredClone(state);
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'weapons', delta: 1 })?.ok).toBe(false);
    expect(state).toEqual(locked);
  });

  it('never grants hostile power or door control to a player boarder, even at the relevant stations', () => {
    const state = fixture();
    const enemy = state.ships[1];
    const crew = away(state, enemy, 'reactor');
    const before = structuredClone(state);
    expect(tacticalCommand(state, { type: 'power', ship: enemy.id, system: 'oxygen', delta: -1 })?.ok).toBe(false);
    expect(state).toEqual(before);
    crew.room = room(enemy, 'doors').id;
    const doorBefore = structuredClone(state);
    expect(tacticalCommand(state, { type: 'door', ship: enemy.id, door: enemy.doors[0].id })?.ok).toBe(false);
    expect(state).toEqual(doorBefore);
    enemy.doctrine = 'derelict';
    enemy.hull = 0;
    const destroyed = structuredClone(state);
    expect(tacticalCommand(state, { type: 'door', ship: enemy.id, door: enemy.doors[0].id })?.ok).toBe(false);
    expect(state).toEqual(destroyed);
  });

  it('survives a low-oxygen derelict through real movement, physical engineering and local power restoration', () => {
    const state = fixture(false);
    const wreck = createShip('w', false, true);
    wreck.rooms.forEach(candidate => { candidate.oxygen = .12; });
    state.ships.push(wreck);
    const engineer = state.crew[1];
    engineer.shipId = wreck.id;
    engineer.room = wreck.rooms[0].id;
    engineer.path = [];
    engineer.task = 'idle';
    const oxygenRoom = room(wreck, 'oxygen');
    expect(unit(wreck, 'oxygen').health).toBe(0);
    expect(tacticalCommand(state, { type: 'crew', crew: engineer.id, room: oxygenRoom.id, task: 'repair' })?.ok).toBe(true);
    let walking = 0;
    while (engineer.path.length && walking++ < 200) advance(state);
    expect(engineer.room).toBe(oxygenRoom.id);
    expect(unit(wreck, 'oxygen').health).toBeGreaterThan(0);
    expect(engineer.health).toBeGreaterThan(70);
    expect(engineer.health).toBeLessThan(100);
    expect(tacticalCommand(state, { type: 'power', ship: wreck.id, system: 'oxygen', delta: 1 })?.ok).toBe(true);
    advance(state, 500);
    expect(state.phase).toBe('expedition');
    expect(engineer.health).toBeGreaterThan(50);
    expect(wreck.rooms.every(candidate => candidate.oxygen >= .2)).toBe(true);
    expect(unit(wreck, 'oxygen').power).toBe(1);
  });

  it('requires 100 uninterrupted capture ticks, cancels on defenders and pays income exactly once', () => {
    const state = fixture();
    const enemy = state.ships[1];
    state.crew = state.crew.filter(crew => crew.home === 'p');
    const crew = away(state, enemy);
    player(state).debt = 20;
    advance(state, 50);
    expect(enemy.capture).toBe(50);
    const defender = createCrew('e', true)[0];
    state.crew.push(defender);
    advance(state);
    expect(enemy.capture).toBe(0);
    state.crew.pop();
    advance(state, 99);
    expect(state.encounter).toBe('hostile');
    expect(crew.health).toBeGreaterThan(0);
    advance(state);
    expect(state.encounter).toBe('won');
    expect(player(state).credits).toBe(90);
    expect(player(state).debt).toBe(10);
    expect(enemy.doctrine).toBe('derelict');
    const resumed = JSON.parse(JSON.stringify(state)) as GameState;
    advance(resumed, 150);
    expect(player(resumed).credits).toBe(90);
    expect(resumed.rewards.filter(value => value === 'encounter:sol:station:e')).toHaveLength(1);
  });

  it('hull destruction beats capture and dead crew cannot perform tasks', () => {
    const state = fixture();
    const enemy = state.ships[1];
    state.crew = state.crew.filter(crew => crew.home === 'p');
    const crew = away(state, enemy);
    enemy.capture = 99;
    enemy.hull = 0;
    crew.task = 'repair';
    advance(state);
    expect(crew.health).toBe(0);
    expect(enemy.capture).toBe(0);
    expect(state.encounter).toBe('won');
    expect(player(state).credits).toBe(85);
    advance(state, 10);
    expect(player(state).credits).toBe(85);
  });

  it('accepts or rejects surrender, and retreat/ceasefire grants no loot', () => {
    const state = fixture();
    state.encounter = 'surrender';
    const rejectState = structuredClone(state);
    expect(tacticalCommand(rejectState, { type: 'surrender', accept: false })?.ok).toBe(true);
    expect(rejectState.encounter).toBe('hostile');
    expect(rejectState.rewards).toContain('refused:sol:station:e');
    expect(tacticalCommand(state, { type: 'surrender', accept: true })?.ok).toBe(true);
    expect(player(state).credits).toBe(80);
    expect(state.encounter).toBe('won');
    expect(tacticalCommand(state, { type: 'surrender', accept: true })?.ok).toBe(false);
    const retreat = fixture();
    retreat.ships[1].hull = 8;
    retreat.ships[1].ftl = 600;
    retreat.tick = 39;
    advance(retreat);
    expect(retreat.encounter).toBe('none');
    expect(player(retreat).credits).toBe(60);
    expect(retreat.ships[1].fuel).toBe(6);
    const stalemate = fixture();
    stalemate.ships.forEach(ship => { ship.weapons = []; });
    stalemate.ships[1].aiTick = 1200;
    stalemate.tick = 39;
    advance(stalemate);
    expect(stalemate.encounter).toBe('surrender');
    expect(tacticalCommand(stalemate, { type: 'surrender', accept: true })?.ok).toBe(true);
    expect(stalemate.encounter).toBe('none');
    expect(player(stalemate).credits).toBe(60);
  });

  it('AI uses doctrine, repairs physically and does not target based on hidden interior/cargo', () => {
    const state = fixture();
    const enemy = state.ships[1];
    enemy.hull = enemy.maxHull;
    room(enemy, 'engines').breach = .2;
    state.tick = 39;
    const hidden = structuredClone(state);
    player(hidden).cargo.secret = 19;
    room(player(hidden), 'weapons').fire = .8;
    room(player(hidden), 'oxygen').breach = 1;
    unit(player(hidden), 'weapons').health = 0;
    hidden.crew[0].room = room(player(hidden), 'oxygen').id;
    advance(state);
    advance(hidden);
    expect(enemy.weapons.map(weapon => weapon.target)).toEqual(hidden.ships[1].weapons.map(weapon => weapon.target));
    expect(enemy.weapons[0].target).toBe(room(player(state), 'engines').id);
    expect(state.crew.filter(crew => crew.home === 'e').map(crew => [crew.task, crew.path])).toEqual(hidden.crew.filter(crew => crew.home === 'e').map(crew => [crew.task, crew.path]));
    const military = fixture();
    military.ships[1].doctrine = 'military';
    military.tick = 39;
    advance(military);
    expect(military.ships[1].weapons[0].target).toBe(room(player(military), 'weapons').id);
  });

  it('pirates legally attack active escort convoys using normal charge, ammo and damage rules', () => {
    const state = fixture();
    const convoy = createShip('convoy-escort-contract');
    state.ships.push(convoy);
    noEvasion(convoy);
    state.contracts.push({
      id: 'escort-contract', kind: 'escort', name: 'Escort convoy', origin: 'station', destination: 'destination',
      reward: 30, status: 'active', commodity: '', quantity: 0, progress: 0, deadline: 0,
    });
    const enemy = state.ships[1];
    enemy.weapons = [enemy.weapons[0]];
    enemy.weapons[0].charge = WEAPONS.laser.chargeTicks;
    state.tick = 39;
    const military = structuredClone(state);
    military.ships[1].doctrine = 'military';
    advance(state);
    advance(military);
    expect(enemy.weapons[0].target).toBe(room(convoy, 'engines').id);
    expect(state.projectiles.some(projectile => projectile.source === enemy.id && projectile.target === convoy.id)).toBe(true);
    expect(enemy.missiles).toBe(4);
    expect(military.ships[1].weapons[0].target).toBe(room(player(military), 'weapons').id);
    advance(state, WEAPONS.laser.travelTicks);
    expect(convoy.hull).toBeLessThan(convoy.maxHull);
    expect(player(state).hull).toBe(30);
    const before = structuredClone(state);
    expect(tacticalCommand(state, { type: 'target', weapon: player(state).weapons[0].id, room: convoy.rooms[0].id, auto: true })?.ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('AI vents an unoccupied burning compartment, isolates crew and closes after extinction', () => {
    const state = fixture();
    const enemy = state.ships[1];
    enemy.weapons = [];
    const airlock = enemy.doors.find(door => !door.b)!;
    const burning = enemy.rooms.find(candidate => candidate.id === airlock.a)!;
    burning.fire = .8;
    state.tick = 39;
    advance(state);
    expect(airlock.open).toBe(true);
    expect(enemy.doors.filter(door => door.b && (door.a === burning.id || door.b === burning.id)).every(door => !door.open)).toBe(true);
    expect(state.crew.filter(crew => crew.home === enemy.id).every(crew => crew.path[crew.path.length - 1] !== burning.id)).toBe(true);
    burning.fire = 0;
    state.tick = 79;
    advance(state);
    expect(airlock.open).toBe(false);
  });

  it('AI refuses to vent an occupied compartment', () => {
    const state = fixture();
    const enemy = state.ships[1];
    const airlock = enemy.doors.find(door => !door.b)!;
    const burning = enemy.rooms.find(candidate => candidate.id === airlock.a)!;
    burning.fire = .8;
    state.crew.find(crew => crew.home === enemy.id)!.room = burning.id;
    state.tick = 39;
    advance(state);
    expect(airlock.open).toBe(false);
  });

  it('scopes rewards to encounters rather than a reused enemy ship ID', () => {
    const state = fixture();
    state.encounter = 'surrender';
    tacticalCommand(state, { type: 'surrender', accept: true });
    expect(player(state).credits).toBe(80);
    state.locationId = 'new-contact';
    currentSystem(state).locations.push({ ...currentSystem(state).locations[0], id: state.locationId });
    state.ships[1] = createShip('e', true);
    state.encounter = 'surrender';
    expect(tacticalCommand(state, { type: 'surrender', accept: true })?.ok).toBe(true);
    expect(player(state).credits).toBe(100);
    expect(state.rewards.filter(value => value.startsWith('encounter:'))).toHaveLength(2);
  });

  it('completes the first battle with non-consumable weapons and a single terminal reward', () => {
    const state = fixture();
    state.rng = 12345;
    const home = player(state), enemy = state.ships[1];
    home.missiles = 0;
    tacticalCommand(state, { type: 'target', weapon: home.weapons[0].id, room: room(enemy, 'weapons').id, auto: true });
    tacticalCommand(state, { type: 'target', weapon: home.weapons[1].id, room: room(enemy, 'shields').id, auto: true });
    for (let count = 0; count < 2400 && state.phase === 'expedition' && state.encounter !== 'won'; count++) {
      advance(state);
      if (state.encounter === 'surrender') tacticalCommand(state, { type: 'surrender', accept: true });
    }
    expect(state.phase).toBe('expedition');
    expect(state.encounter).toBe('won');
    expect(home.missiles).toBe(0);
    expect(home.credits).toBeGreaterThan(60);
    expect(state.rewards.filter(value => value.startsWith('encounter:'))).toHaveLength(1);
  });

  it('enemy boarders enter through a tether, fight physically and can capture an undefended mothership', () => {
    const state = fixture();
    const home = player(state), enemy = state.ships[1];
    enemy.modules.push('teleporter');
    noEvasion(home);
    state.tick = 39;
    advance(state);
    const boarder = state.crew.find(crew => crew.home === enemy.id && crew.shipId === home.id)!;
    expect(boarder).toBeDefined();
    expect(boarder.room).toBe(home.rooms[0].id);
    const playerCrew = state.crew.filter(crew => crew.home === home.id);
    for (const crew of playerCrew) { crew.shipId = enemy.id; crew.room = room(enemy, 'oxygen').id; }
    boarder.room = room(home, 'cockpit').id;
    boarder.path = [];
    boarder.task = 'fight';
    enemy.modules = [];
    enemy.weapons = [];
    advance(state, 100);
    expect(home.capture).toBe(100);
    expect(state.phase).toBe('defeat');
  });

  it('boarding crew combat and sabotage respect physical presence and combat skill', () => {
    const state = fixture();
    const enemy = state.ships[1];
    const crew = away(state, enemy, 'weapons');
    const defender = state.crew.find(candidate => candidate.home === 'e' && candidate.room === crew.room)!;
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: crew.room, task: 'fight' })?.ok).toBe(true);
    const before = defender.health;
    advance(state, 10);
    expect(defender.health).toBeLessThan(before);
    expect(crew.health).toBeLessThan(100);
    state.crew = state.crew.filter(candidate => candidate.home !== 'e');
    expect(tacticalCommand(state, { type: 'crew', crew: crew.id, room: crew.room, task: 'sabotage' })?.ok).toBe(true);
    const systemHealth = unit(enemy, 'weapons').health;
    advance(state, 10);
    expect(unit(enemy, 'weapons').health).toBeLessThan(systemHealth);
  });

  it('resolves derelict ambush combat physically even without a hostile space encounter', () => {
    const state = fixture(false);
    const wreck = createShip('w', false, true);
    wreck.rooms.forEach(candidate => { candidate.fire = 0; candidate.breach = 0; candidate.oxygen = 1; });
    state.ships.push(wreck);
    state.encounter = 'derelict';
    const explorer = away(state, wreck, 'weapons');
    explorer.task = 'search';
    const ambusher = createCrew('enemy', true)[0];
    ambusher.shipId = wreck.id;
    ambusher.room = explorer.room;
    ambusher.task = 'fight';
    state.crew.push(ambusher);
    advance(state, 10);
    expect(explorer.health).toBeLessThan(100);
    expect(ambusher.health).toBeLessThan(100);
    expect(explorer.progress).toBe(0);
    expect(state.encounter).toBe('derelict');
    explorer.room = room(wreck, 'oxygen').id;
    const health = explorer.health;
    advance(state, 10);
    expect(explorer.health).toBe(health);
  });
});

describe('electronic warfare and deterministic continuation', () => {
  function ewFixture() {
    const state = fixture();
    const home = player(state);
    home.modules.push('ew');
    unit(home, 'ew').power = 1;
    return state;
  }
  it.each([
    ['jam', 'sensors'], ['disrupt', 'weapons'], ['interfere', 'shields'], ['hack', 'doors'],
  ] as const)('%s uses bounded ion locks and a real cooldown', (mode, kind) => {
    const state = ewFixture();
    const enemy = state.ships[1];
    enemy.doors.forEach(door => { door.locked = true; door.open = false; });
    expect(tacticalCommand(state, { type: 'ew', mode })?.ok).toBe(true);
    expect(unit(enemy, kind).ion).toBe(100);
    expect(unit(enemy, kind).power).toBe(0);
    expect(unit(player(state), 'ew').power).toBe(0);
    expect(unit(player(state), 'ew').ion).toBe(100);
    if (mode === 'interfere') expect(enemy.shields).toBe(0);
    if (mode === 'hack') expect(enemy.doors.filter(door => door.b).every(door => door.open && !door.locked)).toBe(true);
    const before = structuredClone(state);
    expect(tacticalCommand(state, { type: 'ew', mode })?.ok).toBe(false);
    expect(state).toEqual(before);
    enemy.weapons = [];
    advance(state, 100);
    expect(unit(player(state), 'ew').ion).toBe(0);
    expect(unit(player(state), 'ew').power).toBe(0);
  });

  it('hijacks only actual drone modules and intercepted signals persist without income duplication', () => {
    const state = ewFixture();
    const before = structuredClone(state);
    expect(tacticalCommand(state, { type: 'ew', mode: 'hijack' })?.ok).toBe(false);
    expect(state).toEqual(before);
    state.ships[1].modules.push('drones');
    expect(tacticalCommand(state, { type: 'ew', mode: 'hijack' })?.ok).toBe(true);
    expect(player(state).modules).toContain('drones');
    expect(state.ships[1].modules).not.toContain('drones');
    const intercepted = ewFixture();
    currentLocation(intercepted).known = 0;
    expect(tacticalCommand(intercepted, { type: 'ew', mode: 'intercept' })?.ok).toBe(true);
    expect(currentLocation(intercepted).known).toBe(1);
    expect(intercepted.discoveries).toContain('intercept:station');
    expect(player(intercepted).credits).toBe(60);
  });

  it('does not silently exceed the module-slot cap on drone hijack', () => {
    const state = ewFixture();
    player(state).modules.push('cargo', 'fuel', 'sensors', 'mining', 'armor');
    state.ships[1].modules.push('drones');
    const before = structuredClone(state);
    expect(tacticalCommand(state, { type: 'ew', mode: 'hijack' })?.ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('leaves return work exclusively to strategy, without double progression', () => {
    const state = fixture(false);
    const wreck = createShip('w', false, true);
    state.ships.push(wreck);
    const crew = away(state, wreck);
    crew.task = 'return';
    crew.progress = 20;
    advance(state, 20);
    expect(crew.progress).toBe(20);
    expect(crew.shipId).toBe(wreck.id);
  });

  it('walks a returning boarder to the docking room and retains return for the strategic crossing timer', () => {
    const state = fixture(false);
    const wreck = createShip('w', false, true);
    wreck.rooms.forEach(candidate => { candidate.fire = 0; candidate.breach = 0; candidate.oxygen = 1; });
    state.ships.push(wreck);
    const crew = away(state, wreck, 'oxygen');
    crew.path = path(wreck, crew.room, wreck.rooms[0].id)!;
    expect(crew.path.length).toBeGreaterThan(0);
    crew.task = 'return';
    let walking = 0;
    while (crew.path.length && walking++ < 200) advance(state);
    expect(crew.room).toBe(wreck.rooms[0].id);
    expect(crew.task).toBe('return');
    expect(crew.progress).toBe(0);
    expect(crew.shipId).toBe(wreck.id);
    advance(state, 20);
    expect(crew.progress).toBe(0);
    expect(crew.task).toBe('return');
  });

  it('runs real hijacked defense drones with crew, power and a bounded intercept cadence', () => {
    const state = ewFixture();
    player(state).modules.push('drones');
    state.projectiles.push({ id: 'incoming', source: 'e', target: 'p', room: room(player(state), 'cockpit').id, family: 'missile', remaining: 10, total: 10 });
    state.tick = 99;
    advance(state);
    expect(state.projectiles.some(projectile => projectile.id === 'incoming')).toBe(false);
    expect(state.events.some(candidate => candidate.message.includes('defense drone intercepted'))).toBe(true);
  });

  it('matches complete state after JSON continuation during projectiles, ion, movement, fire and AI', () => {
    const uninterrupted = fixture();
    const home = player(uninterrupted);
    const enemy = uninterrupted.ships[1];
    tacticalCommand(uninterrupted, { type: 'target', weapon: home.weapons[0].id, room: room(enemy, 'weapons').id, auto: true });
    tacticalCommand(uninterrupted, { type: 'target', weapon: home.weapons[1].id, room: room(enemy, 'shields').id, auto: true });
    tacticalCommand(uninterrupted, { type: 'crew', crew: uninterrupted.crew[1].id, room: room(home, 'oxygen').id, task: 'repair' });
    room(home, 'oxygen').breach = .3;
    room(home, 'engines').fire = .2;
    unit(home, 'sensors').ion = 35;
    advance(uninterrupted, 65);
    const resumed = JSON.parse(JSON.stringify(uninterrupted)) as GameState;
    advance(uninterrupted, 350);
    advance(resumed, 350);
    expect(resumed).toEqual(uninterrupted);
    expect(resumed.events.length).toBeLessThanOrEqual(200);
    expect(resumed.projectiles.length).toBeLessThanOrEqual(256);
  });

  it('terminal phases stop every tactical mutation', () => {
    const state = fixture();
    state.phase = 'abandoned';
    const before = structuredClone(state);
    tacticalTick(state);
    expect(state).toEqual(before);
    expect(tacticalCommand(state, { type: 'maneuver', bearing: 'stern' })?.ok).toBe(false);
    expect(state).toEqual(before);
  });
});
