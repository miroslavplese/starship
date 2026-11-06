import { WEAPONS } from '../content/weapons';
import { GOODS } from '../content/region';
import { currentSystem, event, hasInterceptWork, income, interceptTarget, player, random } from './core';
import type { Bearing, Command, Crew, GameState, Projectile, Result, Room, Ship, System, SystemKind, Task } from './types';

const ok: Result = { ok: true };
const reject = (message: string): Result => ({ ok: false, message });
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const ordered = <T extends { id: string }>(entities: T[]): T[] => [...entities].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const system = (ship: Ship, kind: SystemKind) => ship.systems.find(candidate => candidate.kind === kind);
const working = (unit: System | undefined): unit is System => !!unit && unit.health > 0 && unit.ion <= 0;
const powered = (ship: Ship, kind: SystemKind): number => {
  const unit = system(ship, kind);
  return working(unit) ? unit.power : 0;
};
const alive = (state: GameState, home: string, shipId = home) => state.crew.filter(crew => crew.home === home && crew.shipId === shipId && crew.health > 0);
const hostile = (ship: Ship) => ship.doctrine === 'pirate' || ship.doctrine === 'military';
const budget = (ship: Ship) => {
  const reactor = system(ship, 'reactor');
  return working(reactor) ? Math.floor(ship.reactor * reactor.health / reactor.max) : 0;
};
const capacity = (unit: System) => working(unit) ? Math.min(unit.cap, Math.ceil(unit.cap * unit.health / unit.max)) : 0;
const tasks: Task[] = ['idle', 'move', 'repair', 'extinguish', 'heal', 'operate', 'search', 'fight', 'sabotage', 'return'];
const bearings: Bearing[] = ['bow', 'stern', 'port', 'starboard'];
const encounterKey = (state: GameState, ship: Ship) => `${state.systemId}:${state.locationId}:${ship.id}`;

function canControl(state: GameState, actor: Ship, ship: Ship, stations: string[]): boolean {
  if (actor.id === ship.id) return true;
  return actor.doctrine === 'player' && ship.doctrine === 'derelict' && ship.hull > 0
    && state.crew.some(crew => crew.home === actor.id && crew.shipId === ship.id && crew.health > 0 && !crew.path.length && stations.includes(crew.room));
}

/** Room steps exclude the starting room. Closed, unlocked doors can be opened by crew. */
export function path(ship: Ship, from: string, to: string): string[] | null {
  if (!ship.rooms.some(room => room.id === from) || !ship.rooms.some(room => room.id === to)) return null;
  const queue = [from];
  const previous = new Map<string, string | null>([[from, null]]);
  for (let index = 0; index < queue.length; index++) {
    const here = queue[index];
    if (here === to) {
      const steps: string[] = [];
      let next = to;
      while (next !== from) {
        steps.unshift(next);
        next = previous.get(next)!;
      }
      return steps;
    }
    for (const door of ordered(ship.doors)) {
      if (door.locked || door.health <= 0 || !door.b) continue;
      const neighbor = door.a === here ? door.b : door.b === here ? door.a : null;
      if (!neighbor || previous.has(neighbor) || !ship.rooms.some(room => room.id === neighbor)) continue;
      previous.set(neighbor, here);
      queue.push(neighbor);
    }
  }
  return null;
}

function crewOrder(state: GameState, actor: Ship, command: Extract<Command, { type: 'crew' }>): Result {
  const crew = state.crew.find(candidate => candidate.id === command.crew);
  if (!crew || crew.home !== actor.id || crew.health <= 0) return reject('Select a living crew member under your command.');
  const ship = state.ships.find(candidate => candidate.id === crew.shipId && candidate.hull > 0);
  const room = ship?.rooms.find(candidate => candidate.id === command.room);
  if (!ship || !room || !tasks.includes(command.task)) return reject('Invalid room or crew task.');
  if (ship.doctrine === 'withdrawn') return reject('Contact withdrawn beyond command/docking range. Use priced emergency tether extraction or explicitly abandon the expedition.');
  if (command.task === 'return' && crew.shipId !== crew.home) return reject('Use recall to cross the docking tether.');
  if (command.task === 'heal' && (room.system !== 'medbay' || !powered(ship, 'medbay'))) return reject('Healing requires an operational powered medbay.');
  if (command.task === 'sabotage' && (ship.id === actor.id || !hostile(ship) && actor.doctrine === 'player')) return reject('Sabotage requires a hostile ship.');
  if (command.task === 'search' && (ship.id === actor.id || room.searched)) return reject('This compartment has no uncollected salvage.');
  if (command.task === 'search' && state.crew.some(candidate => candidate.shipId === ship.id && candidate.room === room.id && candidate.home !== actor.id && candidate.health > 0)) return reject('Clear the defending crew before searching.');
  const route = path(ship, crew.room, room.id);
  if (!route) return reject('No safe route: unlock or repair the connecting doors.');
  crew.path = command.task === 'idle' ? [] : route;
  crew.task = command.task;
  crew.progress = 0;
  event(state, 'order', `${crew.name}: ${command.task} in ${room.name}.`);
  return ok;
}

function targetOrder(state: GameState, actor: Ship, command: Extract<Command, { type: 'target' }>): Result {
  const weapon = actor.weapons.find(candidate => candidate.id === command.weapon);
  if (!weapon) return reject('That weapon is not under your command.');
  if (typeof command.auto !== 'boolean') return reject('Invalid auto-fire setting.');
  if (command.room === '' && !command.auto) {
    weapon.target = null;
    weapon.auto = false;
    return ok;
  }
  const target = state.ships.find(candidate => candidate.id !== actor.id && candidate.hull > 0 && candidate.rooms.some(room => room.id === command.room));
  if (state.encounter !== 'hostile' || !target || (actor.doctrine === 'player' ? !hostile(target) : target.doctrine !== 'player')) return reject('Select a room on a live hostile vessel.');
  weapon.target = command.room;
  weapon.auto = command.auto;
  event(state, 'target', `${actor.name} targets ${command.room} with ${weapon.family}.`);
  return ok;
}

function ewOrder(state: GameState, actor: Ship, command: Extract<Command, { type: 'ew' }>): Result {
  const unit = system(actor, 'ew');
  if (!actor.modules.includes('ew') || !working(unit) || unit.power < 1 || !alive(state, actor.id).length) return reject('EW requires an installed, powered, crewed EW suite.');
  if (!['jam', 'disrupt', 'interfere', 'hack', 'hijack', 'intercept'].includes(command.mode)) return reject('Invalid electronic warfare mode.');
  const target = ordered(state.ships).find(candidate => candidate.id !== actor.id && candidate.hull > 0 && (actor.doctrine === 'player' ? hostile(candidate) : candidate.id === player(state).id));
  if (command.mode !== 'intercept' && (state.encounter !== 'hostile' || !target)) return reject('No hostile contact in EW range.');
  const kind: SystemKind = command.mode === 'jam' ? 'sensors' : command.mode === 'disrupt' ? 'weapons' : command.mode === 'interfere' ? 'shields' : 'doors';
  const victim = target && system(target, kind);
  if (command.mode === 'hijack' && !target?.modules.includes('drones')) return reject('The contact has no drone module to hijack.');
  if (command.mode === 'hijack' && !actor.modules.includes('drones') && actor.modules.length >= 6) return reject('A free module slot is required for the hijacked drone controller.');
  if (command.mode !== 'hijack' && command.mode !== 'intercept' && !victim) return reject('The contact lacks that system.');
  if (command.mode === 'intercept' && (!powered(actor, 'sensors') || actor.doctrine !== 'player')) return reject('Interception requires powered sensors.');
  if (command.mode === 'intercept' && !hasInterceptWork(state)) return reject('No new contact or transmission data remains in this system.');

  if (command.mode === 'intercept') {
    const location = interceptTarget(state);
    if (location) {
      if (location.known < 2) location.known++;
      if (!state.discoveries.includes(`intercept:${location.id}`)) state.discoveries.push(`intercept:${location.id}`);
    }
  } else if (command.mode === 'hijack') {
    target!.modules = target!.modules.filter(module => module !== 'drones');
    if (!actor.modules.includes('drones')) actor.modules.push('drones');
  } else {
    victim!.ion = Math.max(victim!.ion, 100);
    victim!.power = 0;
    if (command.mode === 'interfere') target!.shields = 0;
    if (command.mode === 'hack') {
      for (const door of target!.doors) {
        if (door.b && door.health > 0) {
          door.locked = false;
          door.open = true;
        }
      }
    }
  }
  unit.ion = 100;
  unit.power = 0;
  event(state, 'ew', `${actor.name}: ${command.mode}; EW suite cooling for 100 ticks, then reallocate power.`);
  return ok;
}

function issue(state: GameState, actor: Ship, command: Command): Result | null {
  if (!['crew', 'door', 'power', 'target', 'weapon-priority', 'ew', 'maneuver', 'surrender'].includes(command.type)) return null;
  if (state.phase !== 'expedition' || actor.hull <= 0) return reject('The expedition or ship is no longer operational.');
  switch (command.type) {
    case 'crew': return crewOrder(state, actor, command);
    case 'target': return targetOrder(state, actor, command);
    case 'weapon-priority': {
      const index = actor.weapons.findIndex(weapon => weapon.id === command.weapon);
      if (index < 0) return reject('That weapon is not under your command.');
      if (command.direction !== -1 && command.direction !== 1) return reject('Weapon priority direction must be -1 or 1.');
      const next = index + command.direction;
      if (next < 0 || next >= actor.weapons.length) return reject('That weapon is already at the priority boundary.');
      [actor.weapons[index], actor.weapons[next]] = [actor.weapons[next], actor.weapons[index]];
      event(state, 'power', `${actor.name}: ${actor.weapons[next].family} moved to weapon power priority ${next + 1}.`);
      return ok;
    }
    case 'ew': return ewOrder(state, actor, command);
    case 'door': {
      const ship = state.ships.find(candidate => candidate.id === command.ship && candidate.hull > 0);
      if (!ship) return reject('That ship is no longer operational.');
      const door = ship.doors.find(candidate => candidate.id === command.door);
      if (!door || door.health <= 0) return reject('That door must be physically repaired.');
      const stations = [door.a, ...(door.b ? [door.b] : []), ...ship.rooms.filter(room => room.system === 'doors').map(room => room.id)];
      if (!canControl(state, actor, ship, stations)) return reject('Derelict doors require living stationary crew beside the door or at its control station; hostile doors cannot be commanded.');
      if (command.lock !== undefined && typeof command.lock !== 'boolean') return reject('Invalid door lock setting.');
      if (!working(system(ship, 'doors'))) return reject('Repair or clear ion interference from door control first.');
      if (command.lock === undefined && door.locked) return reject('Unlock the door first.');
      if (command.lock !== undefined) {
        door.locked = command.lock;
        if (door.locked) door.open = false;
      } else door.open = !door.open;
      event(state, 'door', `${ship.name}: ${door.id} ${door.locked ? 'locked' : door.open ? 'open' : 'closed'}.`);
      return ok;
    }
    case 'power': {
      const ship = state.ships.find(candidate => candidate.id === command.ship && candidate.hull > 0);
      if (!ship) return reject('That ship is no longer operational.');
      const stations = ship.rooms.filter(room => room.system === command.system || room.system === 'reactor').map(room => room.id);
      if (!canControl(state, actor, ship, stations)) return reject('Derelict power requires living stationary crew at the system or reactor; hostile reactors cannot be commanded.');
      const unit = system(ship, command.system);
      if (!unit || !Number.isInteger(command.delta) || command.delta === 0 || unit.cap === 0) return reject('Power changes must be nonzero integers on an allocatable system.');
      const proposed = unit.power + command.delta;
      if (proposed < 0 || proposed > capacity(unit)) return reject('Power exceeds the system’s health, capacity or ion limit.');
      const total = ship.systems.reduce((sum, candidate) => sum + candidate.power, 0) + command.delta;
      if (total > budget(ship)) return reject('Not enough spare reactor power.');
      unit.power = proposed;
      if (unit.kind === 'shields') ship.shields = Math.min(ship.shields, Math.floor(proposed / 2));
      event(state, 'power', `${ship.name}: ${unit.kind} power ${proposed}.`);
      return ok;
    }
    case 'maneuver':
      if (!bearings.includes(command.bearing) || command.bearing === actor.bearing || actor.maneuver > 0) return reject('Choose a different bearing after the current maneuver completes.');
      if (!working(system(actor, 'cockpit')) || powered(actor, 'engines') < 1 || !alive(state, actor.id).length) return reject('Maneuver requires cockpit, crew and one committed engine power.');
      actor.maneuver = 100;
      actor.maneuverTarget = command.bearing;
      event(state, 'maneuver', `${actor.name} maneuvering to ${command.bearing}; one engine power committed for 100 ticks.`);
      return ok;
    case 'surrender': {
      if (actor.doctrine !== 'player' || state.encounter !== 'surrender' || typeof command.accept !== 'boolean') return reject('There is no surrender or ceasefire offer.');
      const enemies = state.ships.filter(candidate => hostile(candidate) && candidate.hull > 0);
      if (!enemies.length) return reject('The surrendering contact is gone.');
      if (!command.accept) {
        for (const enemy of enemies) {
          const token = `refused:${encounterKey(state, enemy)}`;
          if (!state.rewards.includes(token)) state.rewards.push(token);
          enemy.aiTick = 0;
        }
        state.encounter = 'hostile';
        event(state, 'surrender', 'Offer refused. Hostilities resumed.');
      } else {
        const ceasefire = enemies.some(enemy => state.rewards.includes(`stalemate:${encounterKey(state, enemy)}`));
        for (const enemy of enemies) finish(state, enemy, ceasefire ? 'ceasefire' : 'surrender');
        state.encounter = ceasefire ? 'none' : 'won';
      }
      return ok;
    }
    default: return null;
  }
}

export function tacticalCommand(state: GameState, command: Command): Result | null {
  return issue(state, player(state), command);
}

function enforcePower(state: GameState, ship: Ship): void {
  let remaining = budget(ship);
  for (const unit of ship.systems) {
    const before = unit.power;
    unit.power = Math.max(0, Math.min(unit.power, capacity(unit), remaining));
    remaining -= unit.power;
    if (before !== unit.power) event(state, 'power', `${ship.name}: ${unit.kind} forced to ${unit.power} power.`);
  }
  ship.shields = Math.min(ship.shields, Math.floor(powered(ship, 'shields') / 2));
}

function stationSkill(state: GameState, ship: Ship, kind: SystemKind, skill: keyof Crew['skills']): number {
  if (!working(system(ship, kind))) return 0;
  return Math.max(0, ...alive(state, ship.id).filter(crew => !crew.path.length && ship.rooms.find(room => room.id === crew.room)?.system === kind).map(crew => crew.skills[skill]));
}

function moveCrew(state: GameState): void {
  for (const crew of ordered(state.crew)) {
    if (crew.health <= 0) {
      crew.path = [];
      crew.task = 'idle';
      crew.progress = 0;
      continue;
    }
    if (!crew.path.length) continue;
    const ship = state.ships.find(candidate => candidate.id === crew.shipId);
    if (!ship || ship.hull <= 0 || ship.doctrine === 'withdrawn') continue;
    const destination = crew.path[crew.path.length - 1];
    const route = path(ship, crew.room, destination);
    if (!route) {
      crew.path = [];
      crew.progress = 0;
      crew.task = 'idle';
      event(state, 'blocked', `${crew.name}: route blocked. Unlock or physically repair the door.`);
      continue;
    }
    crew.path = route;
    if (!route.length) continue;
    crew.progress += crew.trait === 'swift' ? 1.25 : 1;
    if (crew.progress < 20) continue;
    const door = ordered(ship.doors).find(candidate => candidate.health > 0 && !candidate.locked && (candidate.a === crew.room && candidate.b === route[0] || candidate.b === crew.room && candidate.a === route[0]))!;
    door.open = true;
    crew.room = crew.path.shift()!;
    crew.progress = 0;
    if (!crew.path.length && crew.task === 'move') crew.task = 'idle';
  }
}

function weaponPower(ship: Ship): Set<string> {
  let remaining = powered(ship, 'weapons');
  const active = new Set<string>();
  for (const weapon of ship.weapons) {
    const cost = WEAPONS[weapon.family].power;
    if (remaining < cost) continue;
    remaining -= cost;
    active.add(weapon.id);
  }
  return active;
}

function chargeWeapons(state: GameState, ship: Ship): void {
  if (state.encounter !== 'hostile' || ship.hull <= 0 || ship.doctrine === 'derelict' || ship.doctrine === 'withdrawn' || !alive(state, ship.id).length) return;
  const active = weaponPower(ship);
  const bonus = 1 + stationSkill(state, ship, 'weapons', 'weapons') * .1;
  for (const weapon of ship.weapons) {
    if (!active.has(weapon.id)) continue;
    const stats = WEAPONS[weapon.family];
    const before = weapon.charge;
    weapon.charge = Math.min(stats.chargeTicks, weapon.charge + bonus);
    if (before < stats.chargeTicks && weapon.charge >= stats.chargeTicks) event(state, 'ready', `${ship.name}: ${weapon.family} ready.`);
    const target = state.ships.find(candidate => candidate.hull > 0 && candidate.id !== ship.id && candidate.rooms.some(room => room.id === weapon.target) && (ship.doctrine === 'player' ? hostile(candidate) : candidate.doctrine === 'player'));
    if (!target || weapon.charge < stats.chargeTicks || ship.missiles < stats.ammo || state.projectiles.length + stats.projectiles > 256) continue;
    ship.missiles -= stats.ammo;
    weapon.charge = 0;
    for (let index = 0; index < stats.projectiles; index++) {
      state.projectiles.push({ id: `projectile-${state.nextId++}`, source: ship.id, target: target.id, room: weapon.target!, family: weapon.family, remaining: stats.travelTicks, total: stats.travelTicks });
    }
    event(state, weapon.family === 'missile' ? 'missile' : 'shot', `${ship.name} fires ${weapon.family} at ${target.name}.`);
    if (!weapon.auto) weapon.target = null;
  }
}

function evasion(state: GameState, ship: Ship): number {
  if (!working(system(ship, 'cockpit')) || !alive(state, ship.id).length) return 0;
  const engines = Math.max(0, powered(ship, 'engines') - (ship.maneuver > 0 ? 1 : 0));
  if (!engines) return 0;
  const cargo = Object.entries(ship.cargo).reduce((sum, [id, quantity]) => sum + quantity * (GOODS.find(good => good.id === id)?.mass ?? 1), 0);
  return clamp(engines * .07 + stationSkill(state, ship, 'cockpit', 'piloting') * .025 + stationSkill(state, ship, 'engines', 'engines') * .015 - Math.min(.1, cargo / Math.max(1, ship.capacity) * .1), 0, .6);
}

function ionize(ship: Ship, room: Room, ticks: number): void {
  const unit = system(ship, room.system);
  if (!unit) return;
  unit.ion = Math.max(unit.ion, ticks);
  unit.power = 0;
  if (unit.kind === 'shields') ship.shields = 0;
}

function combatProgress(state: GameState): void {
  for (const ship of state.ships) if (hostile(ship)) ship.aiTick = 0;
}

function damageRoom(state: GameState, ship: Ship, room: Room, family: Projectile['family'], approach: Bearing): void {
  const stats = WEAPONS[family];
  const sectors: Bearing[] = ['bow', 'starboard', 'stern', 'port'];
  const section = sectors[(sectors.indexOf(ship.bearing) + sectors.indexOf(approach)) % sectors.length];
  const armor = ship.armor[section];
  const damage = stats.hull ? Math.max(1, stats.hull - Math.min(1, armor)) : 0;
  ship.hull = Math.max(0, ship.hull - damage);
  if (damage) ship.armor[section] = Math.max(0, armor - .25);
  const unit = system(ship, room.system);
  const systemBefore = unit?.health ?? 0;
  if (unit) unit.health = Math.max(0, unit.health - stats.system);
  if (room.system === 'doors' && stats.system) {
    for (const door of ship.doors) if (door.a === room.id || door.b === room.id) door.health = Math.max(0, door.health - stats.system);
  }
  if (stats.ion) ionize(ship, room, stats.ion);
  for (const crew of state.crew.filter(candidate => candidate.shipId === ship.id && candidate.room === room.id && candidate.health > 0)) crew.health = Math.max(0, crew.health - stats.crew);
  if (stats.fire && random(state) < stats.fire) {
    room.fire = clamp(room.fire + .25);
    event(state, 'fire', `${ship.name}: fire in ${room.name}.`);
  }
  if (stats.breach && random(state) < stats.breach) {
    room.breach = clamp(room.breach + .3);
    event(state, 'breach', `${ship.name}: breach in ${room.name}.`);
  }
  if (family === 'experimental') room.oxygen = Math.max(0, room.oxygen - .3);
  if (damage > 0 || (unit?.health ?? 0) < systemBefore) combatProgress(state);
  event(state, 'hit', `${ship.name} (${ship.id}) ${room.name}, ${section} armor: ${damage} hull damage${stats.ion ? ', ion lock' : ''}.`);
  if (unit?.health === 0) event(state, 'failure', `${ship.name}: ${unit.kind} disabled.`);
}

function impact(state: GameState, projectile: Projectile): void {
  const target = state.ships.find(ship => ship.id === projectile.target && ship.hull > 0);
  const room = target?.rooms.find(candidate => candidate.id === projectile.room);
  const source = state.ships.find(ship => ship.id === projectile.source);
  if (!target || !room || !source || state.encounter !== 'hostile' && state.encounter !== 'surrender') return;
  const stats = WEAPONS[projectile.family];
  const location = state.region.find(candidate => candidate.id === state.systemId)?.locations.find(candidate => candidate.id === state.locationId);
  const accuracy = clamp(stats.accuracy - evasion(state, target) - (!powered(source, 'sensors') ? .2 : 0) - (location?.kind === 'belt' ? .1 : 0), .1, 1);
  if (projectile.family !== 'beam' && random(state) >= accuracy) {
    event(state, 'miss', `${source.name}: ${projectile.family} missed ${target.name}.`);
    return;
  }
  if (projectile.family !== 'missile' && target.shields > 0) {
    if (projectile.family !== 'beam') target.shields--;
    target.shieldProgress = 0;
    event(state, 'shield', `${target.name}: shields blocked ${projectile.family}.`);
    return;
  }
  damageRoom(state, target, room, projectile.family, source.bearing);
  if (projectile.family === 'beam' && target.hull > 0) {
    const neighborIds = target.doors.filter(door => door.b && (door.a === room.id || door.b === room.id)).map(door => door.a === room.id ? door.b! : door.a);
    const next = ordered(target.rooms).find(candidate => neighborIds.includes(candidate.id));
    if (next) damageRoom(state, target, next, projectile.family, source.bearing);
  }
  enforcePower(state, target);
}

function projectiles(state: GameState): void {
  if (state.tick % 100 === 0) {
    for (const ship of ordered(state.ships)) {
      if (ship.hull <= 0 || !ship.modules.includes('drones') || !powered(ship, 'ew') || !alive(state, ship.id).length) continue;
      const incoming = ordered(state.projectiles).find(projectile => projectile.target === ship.id);
      if (incoming) {
        state.projectiles = state.projectiles.filter(projectile => projectile.id !== incoming.id);
        event(state, 'shield', `${ship.name}: defense drone intercepted incoming ${incoming.family}.`);
      }
    }
  }
  const inFlight: Projectile[] = [];
  for (const projectile of ordered(state.projectiles)) {
    projectile.remaining--;
    if (projectile.remaining <= 0) impact(state, projectile);
    else if (state.ships.some(ship => ship.id === projectile.target && ship.hull > 0)) inFlight.push(projectile);
  }
  state.projectiles = inFlight;
}

function atmosphere(state: GameState, ship: Ship): void {
  const rooms = ordered(ship.rooms);
  const masses = new Map(rooms.map(room => [room.id, room.oxygen * room.w * room.h]));
  const outgoing = new Map(rooms.map(room => [room.id, 0]));
  const transfers: { from: string; to: string | null; mass: number }[] = [];
  const transfer = (from: string, to: string | null, mass: number) => {
    if (mass <= 0) return;
    transfers.push({ from, to, mass });
    outgoing.set(from, outgoing.get(from)! + mass);
  };
  for (const door of ordered(ship.doors)) {
    if (!door.open && door.health > 0) continue;
    const a = ship.rooms.find(room => room.id === door.a);
    const b = ship.rooms.find(room => room.id === door.b);
    if (!a) continue;
    if (!door.b) transfer(a.id, null, a.oxygen * a.w * a.h * .05);
    else if (b) {
      const difference = a.oxygen - b.oxygen;
      const amount = Math.abs(difference) * Math.min(a.w * a.h, b.w * b.h) * .1;
      transfer(difference > 0 ? a.id : b.id, difference > 0 ? b.id : a.id, amount);
    }
  }
  for (const room of rooms) transfer(room.id, null, room.oxygen * room.w * room.h * room.breach * .025);
  const changes = new Map(rooms.map(room => [room.id, 0]));
  const incoming = new Map(rooms.map(room => [room.id, 0]));
  const flows = transfers.map(flow => {
    const available = masses.get(flow.from)!;
    const mass = flow.mass * Math.min(1, available / outgoing.get(flow.from)!);
    if (flow.to) incoming.set(flow.to, incoming.get(flow.to)! + mass);
    return { ...flow, mass };
  });
  for (const flow of flows) {
    const destination = flow.to && rooms.find(room => room.id === flow.to);
    const space = destination ? destination.w * destination.h - masses.get(destination.id)! : 0;
    const actual = flow.mass * (flow.to ? Math.min(1, Math.max(0, space) / incoming.get(flow.to)!) : 1);
    changes.set(flow.from, changes.get(flow.from)! - actual);
    if (flow.to) changes.set(flow.to, changes.get(flow.to)! + actual);
  }
  const serviced = new Set<string>();
  const oxygenRoom = rooms.find(room => room.system === 'oxygen');
  if (powered(ship, 'oxygen') && oxygenRoom) {
    const queue = [oxygenRoom.id];
    serviced.add(oxygenRoom.id);
    for (let i = 0; i < queue.length; i++) {
      for (const door of ship.doors) {
        if ((!door.open && door.health > 0) || !door.b) continue;
        const next = door.a === queue[i] ? door.b : door.b === queue[i] ? door.a : null;
        if (next && !serviced.has(next)) { serviced.add(next); queue.push(next); }
      }
    }
  }
  for (const room of rooms) {
    const before = room.oxygen;
    room.oxygen = clamp((masses.get(room.id)! + changes.get(room.id)!) / (room.w * room.h) + (serviced.has(room.id) ? .001 : 0) - room.fire * .001);
    if (before >= .2 && room.oxygen < .2) event(state, 'oxygen', `${ship.name}: low oxygen in ${room.name}.`);
  }
}

function emergencies(state: GameState, ship: Ship): void {
  const spread: Room[] = [];
  for (const room of ordered(ship.rooms)) {
    if (room.oxygen < .05) room.fire = 0;
    else if (room.fire > 0 && room.oxygen >= .15) room.fire = clamp(room.fire + .0003);
    if (room.fire > 0) {
      const unit = system(ship, room.system);
      if (unit && unit.health > 0) {
        unit.health = Math.max(0, unit.health - room.fire * .03);
        combatProgress(state);
      }
      if (state.tick % 20 === 0 && room.oxygen >= .15) {
        for (const door of ordered(ship.doors)) {
          if ((!door.open && door.health > 0) || !door.b) continue;
          const other = ship.rooms.find(candidate => candidate.id === (door.a === room.id ? door.b : door.b === room.id ? door.a : null));
          if (other && !other.fire && other.oxygen >= .15 && random(state) < room.fire * .08) spread.push(other);
        }
      }
    }
    for (const crew of state.crew.filter(candidate => candidate.shipId === ship.id && candidate.room === room.id && candidate.health > 0)) {
      const damage = room.fire * .08 + (room.oxygen < .2 ? crew.trait === 'resilient' ? .075 : .1 : 0);
      const before = crew.health;
      crew.health = Math.max(0, crew.health - damage);
      if (before >= 30 && crew.health < 30) event(state, 'injury', `${crew.name} critically injured in ${room.name}.`);
    }
  }
  for (const room of spread) {
    if (room.fire) continue;
    room.fire = .1;
    event(state, 'fire', `${ship.name}: fire spread to ${room.name}.`);
  }
}

function crewTasks(state: GameState): void {
  const combat = new Map<string, number>();
  const crewOrder = ordered(state.crew);
  for (const crew of crewOrder) {
    if (crew.health <= 0) continue;
    const ship = state.ships.find(candidate => candidate.id === crew.shipId && candidate.hull > 0);
    const room = ship?.rooms.find(candidate => candidate.id === crew.room);
    if (!ship || !room || ship.doctrine === 'withdrawn') continue;
    const defenders = crewOrder.filter(candidate => candidate.health > 0 && candidate.shipId === ship.id && candidate.room === room.id && candidate.home !== crew.home);
    if (defenders.length && (ship.id === player(state).id || state.encounter === 'hostile' || state.encounter === 'derelict')
      && (crew.task === 'fight' || crew.home === ship.id || defenders.some(defender => defender.task === 'fight'))) {
      const target = defenders[0];
      combat.set(target.id, (combat.get(target.id) ?? 0) + .075 * (1 + crew.skills.combat * .2) * (target.trait === 'resilient' ? .85 : 1));
    }
    if (crew.path.length) continue;
    const speed = (1 + crew.skills.repair * .15) * (crew.trait === 'methodical' ? 1.25 : 1);
    const unit = system(ship, room.system);
    switch (crew.task) {
      case 'repair': {
        room.breach = Math.max(0, room.breach - .002 * speed);
        if (unit) unit.health = Math.min(unit.max, unit.health + .1 * speed);
        const door = ordered(ship.doors).find(candidate => (candidate.a === room.id || candidate.b === room.id) && candidate.health < 100);
        if (door) door.health = Math.min(100, door.health + .2 * speed);
        if (!room.breach && (!unit || unit.health === unit.max) && !ship.doors.some(candidate => (candidate.a === room.id || candidate.b === room.id) && candidate.health < 100)) crew.task = 'idle';
        break;
      }
      case 'extinguish':
        room.fire = Math.max(0, room.fire - .006 * speed);
        if (!room.fire) crew.task = 'idle';
        break;
      case 'sabotage':
        if (!defenders.length && unit && crew.home !== ship.id && state.encounter === 'hostile') {
          const before = unit.health;
          unit.health = Math.max(0, unit.health - .12 * (1 + crew.skills.combat * .2));
          if (unit.health < before) combatProgress(state);
        }
        break;
      case 'operate':
        if (crew.home !== ship.id && ship.doctrine === 'derelict' && unit && working(unit) && unit.power < capacity(unit)) {
          crew.progress++;
          if (crew.progress >= 20 && ship.systems.reduce((sum, candidate) => sum + candidate.power, 0) < budget(ship)) {
            unit.power++;
            crew.progress = 0;
            event(state, 'power', `${crew.name} physically restored ${ship.name} ${unit.kind} power.`);
            if (unit.kind === 'doors') {
              for (const door of ship.doors) if (door.health > 0) door.locked = false;
              event(state, 'door', `${crew.name} restored the abandoned door controller; intact locks released.`);
            }
          }
        }
        break;
      case 'search':
        if (room.searched) { crew.task = 'idle'; break; }
        if (defenders.length) break;
        crew.progress = Math.min(100, crew.progress + 1 + crew.skills.science * .15);
        break;
      default: break;
    }
    if (room.system === 'medbay' && powered(ship, 'medbay')) {
      crew.health = Math.min(100, crew.health + .15);
      if (crew.health === 100 && crew.task === 'heal') crew.task = 'idle';
    }
  }
  for (const [id, damage] of combat) {
    const crew = state.crew.find(candidate => candidate.id === id)!;
    crew.health = Math.max(0, crew.health - damage);
  }
}

function recharge(state: GameState, ship: Ship): void {
  const shields = Math.floor(powered(ship, 'shields') / 2);
  if (ship.shields < shields) {
    ship.shieldProgress += 1 + stationSkill(state, ship, 'shields', 'shields') * .1;
    if (ship.shieldProgress >= 80) {
      ship.shields++;
      ship.shieldProgress = 0;
      event(state, 'shield', `${ship.name}: shield layer restored.`);
    }
  } else ship.shieldProgress = 0;
  if (powered(ship, 'engines') && working(system(ship, 'cockpit')) && alive(state, ship.id).length) {
    const maneuvering = ship.maneuver > 0;
    if (maneuvering) {
      ship.maneuver--;
      if (ship.maneuver === 0) {
        ship.bearing = ship.maneuverTarget;
        event(state, 'maneuver', `${ship.name}: ${ship.bearing} bearing established.`);
      }
    }
    if (powered(ship, 'engines') > (maneuvering ? 1 : 0) && ship.ftl < 600) {
      ship.ftl++;
      if (ship.ftl === 600) event(state, 'jump', `${ship.name}: FTL ready.`);
    }
  }
}

function finish(state: GameState, ship: Ship, outcome: 'destroyed' | 'capture' | 'surrender' | 'escape' | 'ceasefire'): void {
  const token = `encounter:${encounterKey(state, ship)}`;
  const paid = state.rewards.includes(token);
  if (!paid) state.rewards.push(token);
  if (outcome === 'escape') {
    const retreat = `retreat:${state.systemId}:${state.locationId}`;
    if (!state.rewards.includes(retreat)) state.rewards.push(retreat);
  }
  if (!paid && outcome !== 'escape' && outcome !== 'ceasefire') income(state, outcome === 'capture' ? 40 : outcome === 'surrender' ? 20 : 25);
  ship.capture = 0;
  ship.doctrine = outcome === 'escape' ? 'withdrawn' : 'derelict';
  if (outcome === 'escape') {
    for (const crew of state.crew.filter(crew => crew.shipId === ship.id)) {
      crew.path = []; crew.task = 'idle'; crew.progress = 0;
    }
    if (state.crew.some(crew => crew.home === player(state).id && crew.shipId === ship.id && crew.health > 0)) {
      event(state, 'stranded', 'Away team stranded on withdrawn contact. Normal docking is unavailable; emergency tether costs 20 CR/debt, 10 HP and loose cargo. Explicit abandonment remains available.');
    }
  } else for (const unit of ship.systems) unit.power = 0;
  for (const vessel of state.ships) {
    for (const weapon of vessel.weapons) {
      if (vessel.id === ship.id || ship.rooms.some(room => room.id === weapon.target)) { weapon.target = null; weapon.auto = false; }
    }
  }
  state.projectiles = state.projectiles.filter(projectile => projectile.source !== ship.id && projectile.target !== ship.id);
  event(state, 'encounter', `${ship.name}: ${outcome}${outcome === 'escape' || outcome === 'ceasefire' ? '; no salvage reward' : '; salvage paid once'}.`);
}

function terminals(state: GameState): void {
  const home = player(state);
  for (const ship of ordered(state.ships)) {
    if (ship.hull > 0) continue;
    for (const crew of state.crew.filter(candidate => candidate.shipId === ship.id)) crew.health = 0;
  }
  for (const crew of state.crew) if (crew.health <= 0) {
    crew.path = [];
    crew.task = 'idle';
    crew.progress = 0;
  }
  if (home.hull <= 0 || !state.crew.some(crew => crew.home === home.id && crew.health > 0)) {
    state.phase = 'defeat';
    state.projectiles = [];
    event(state, 'defeat', home.hull <= 0 ? 'Wayfarer destroyed.' : 'All expedition crew lost.');
    return;
  }
  const bridge = home.rooms.find(room => room.system === 'cockpit');
  const invaders = state.crew.some(crew => crew.home !== home.id && crew.shipId === home.id && crew.room === bridge?.id && crew.health > 0 && !crew.path.length);
  home.capture = !alive(state, home.id).length && invaders ? home.capture + 1 : 0;
  if (home.capture >= 100) {
    state.phase = 'defeat';
    state.projectiles = [];
    event(state, 'defeat', 'Wayfarer captured by hostile boarders.');
    return;
  }
  if (state.encounter !== 'hostile' && state.encounter !== 'surrender') return;
  for (const ship of ordered(state.ships).filter(hostile)) {
    if (ship.hull <= 0) {
      ship.capture = 0;
      finish(state, ship, 'destroyed');
      continue;
    }
    const cockpit = ship.rooms.find(room => room.system === 'cockpit');
    const boarders = state.crew.some(crew => crew.home === home.id && crew.shipId === ship.id && crew.room === cockpit?.id && crew.health > 0 && !crew.path.length);
    ship.capture = !alive(state, ship.id).length && boarders ? ship.capture + 1 : 0;
    if (ship.capture >= 100) finish(state, ship, 'capture');
  }
  if (!state.ships.some(ship => hostile(ship) && ship.hull > 0)) state.encounter = 'won';
}

function aiVent(state: GameState, ship: Ship): void {
  if (!working(system(ship, 'doors'))) return;
  const airlock = ordered(ship.doors).find(door => !door.b && door.health > 0);
  if (!airlock) return;
  const fire = ordered(ship.rooms).find(room => room.fire > .6);
  if (!fire) {
    if (airlock.open) issue(state, ship, { type: 'door', ship: ship.id, door: airlock.id });
    if (ship.rooms.every(room => room.fire === 0)) {
      for (const door of ordered(ship.doors)) if (door.b && !door.open && !door.locked && door.health > 0) issue(state, ship, { type: 'door', ship: ship.id, door: door.id });
    }
    return;
  }
  const route = path(ship, fire.id, airlock.a);
  if (!route) return;
  const vented = new Set([fire.id, ...route]);
  if (state.crew.some(crew => crew.home === ship.id && crew.shipId === ship.id && crew.health > 0 && vented.has(crew.room))) {
    if (airlock.open) issue(state, ship, { type: 'door', ship: ship.id, door: airlock.id });
    return;
  }
  for (const door of ordered(ship.doors)) {
    if (!door.b || door.locked || door.health <= 0) continue;
    const both = vented.has(door.a) && vented.has(door.b);
    const boundary = vented.has(door.a) !== vented.has(door.b);
    if (both && !door.open || boundary && door.open) issue(state, ship, { type: 'door', ship: ship.id, door: door.id });
  }
  if (airlock.locked) issue(state, ship, { type: 'door', ship: ship.id, door: airlock.id, lock: false });
  if (!airlock.open) issue(state, ship, { type: 'door', ship: ship.id, door: airlock.id });
}

function ai(state: GameState, ship: Ship): void {
  if (!hostile(ship) || ship.hull <= 0 || state.encounter !== 'hostile') return;
  const due = state.difficulty === 'relaxed'
    ? Math.floor(state.tick * 3 / 160) !== Math.floor((state.tick - 1) * 3 / 160)
    : state.tick % 40 === 0;
  if (!due) return;
  const home = player(state);
  if (ship.hull < ship.maxHull * .25 && alive(state, ship.id).length && !state.rewards.includes(`refused:${encounterKey(state, ship)}`)) {
    state.encounter = 'surrender';
    event(state, 'surrender', `${ship.name} offers surrender. Accept salvage or resume hostilities.`);
    return;
  }
  if (ship.hull < ship.maxHull * .4 && ship.ftl >= 600 && ship.fuel > 0 && powered(ship, 'engines') && working(system(ship, 'cockpit')) && alive(state, ship.id).length) {
    ship.fuel--;
    ship.ftl = 0;
    finish(state, ship, 'escape');
    if (!state.ships.some(candidate => hostile(candidate) && candidate.hull > 0)) state.encounter = 'none';
    return;
  }
  if (ship.aiTick >= 1200 && !state.rewards.includes(`refused:${encounterKey(state, ship)}`)) {
    state.rewards.push(`stalemate:${encounterKey(state, ship)}`);
    state.encounter = 'surrender';
    event(state, 'surrender', 'Stalemate: mutual disengagement offered. No salvage will be paid.');
    return;
  }
  aiVent(state, ship);
  const vented = new Set(ship.doors.filter(door => !door.b && (door.open || door.health <= 0)).map(door => door.a));
  const ventilation = [...vented];
  for (let index = 0; index < ventilation.length; index++) {
    for (const door of ship.doors) {
      if ((!door.open && door.health > 0) || !door.b) continue;
      const next = door.a === ventilation[index] ? door.b : door.b === ventilation[index] ? door.a : null;
      if (next && !vented.has(next)) { vented.add(next); ventilation.push(next); }
    }
  }
  for (const unit of ship.systems) {
    const desired = unit.kind === 'shields' ? 2 : unit.kind === 'weapons' ? 2 : unit.kind === 'engines' || unit.kind === 'oxygen' || unit.kind === 'sensors' ? 1 : unit.kind === 'ew' && ship.modules.includes('ew') ? 1 : 0;
    if (unit.power > desired) issue(state, ship, { type: 'power', ship: ship.id, system: unit.kind, delta: desired - unit.power });
  }
  for (const kind of ['oxygen', 'shields', 'weapons', 'engines', 'sensors', 'ew'] as SystemKind[]) {
    const unit = system(ship, kind);
    const desired = kind === 'shields' || kind === 'weapons' ? 2 : kind === 'ew' && !ship.modules.includes('ew') ? 0 : 1;
    if (unit && unit.power < desired) issue(state, ship, { type: 'power', ship: ship.id, system: kind, delta: 1 });
  }
  // Target selection depends on public layout/doctrine, never hidden health, crew or cargo.
  const preferred = ship.doctrine === 'pirate' ? 'engines' : 'weapons';
  const escort = ship.doctrine === 'pirate'
    ? ordered(state.ships).find(candidate => candidate.doctrine === 'player' && candidate.hull > 0
      && state.contracts.some(contract => contract.kind === 'escort' && contract.status === 'active' && candidate.id === `convoy-${contract.id}`)) : undefined;
  const target = escort ?? home;
  const room = target.rooms.find(candidate => candidate.system === preferred) ?? target.rooms[0];
  if (room) for (const weapon of ship.weapons) if (weapon.target !== room.id || !weapon.auto) issue(state, ship, { type: 'target', weapon: weapon.id, room: room.id, auto: true });
  for (const crew of ordered(state.crew).filter(candidate => candidate.home === ship.id && candidate.health > 0)) {
    const aboard = state.ships.find(candidate => candidate.id === crew.shipId);
    if (!aboard) continue;
    const threat = ordered(state.crew).find(candidate => candidate.shipId === aboard.id && candidate.home !== ship.id && candidate.health > 0 && (aboard.id === ship.id || candidate.room === crew.room));
    const emergency = aboard.id === ship.id ? aboard.rooms.filter(candidate => !vented.has(candidate.id) && (candidate.fire > .1 || candidate.breach > .05 || (system(aboard, candidate.system)?.health ?? 100) < 70)) : [];
    const heal = aboard.rooms.find(candidate => candidate.system === 'medbay');
    const current = aboard.rooms.find(candidate => candidate.id === crew.room);
    if (aboard.id === ship.id && (vented.has(crew.room) || (current?.oxygen ?? 1) < .2)) {
      const refuge = ordered(aboard.rooms).find(candidate => !vented.has(candidate.id) && candidate.oxygen >= .5 && !candidate.fire && path(aboard, crew.room, candidate.id) !== null);
      if (refuge) {
        issue(state, ship, { type: 'crew', crew: crew.id, room: refuge.id, task: 'move' });
        continue;
      }
    }
    const destination = threat ? aboard.rooms.find(candidate => candidate.id === threat.room) : aboard.id !== ship.id ? aboard.rooms.find(candidate => candidate.system === 'cockpit') : emergency.find(candidate => path(aboard, crew.room, candidate.id) !== null);
    const task: Task = threat || aboard.id !== ship.id ? 'fight' : destination?.fire ? 'extinguish' : 'repair';
    if (destination && (!crew.path.length || crew.path[crew.path.length - 1] !== destination.id) && (crew.task !== task || crew.room !== destination.id)) {
      issue(state, ship, { type: 'crew', crew: crew.id, room: destination.id, task });
    } else if (!destination && crew.health < 50 && heal) {
      if (!powered(aboard, 'medbay') && aboard.id === ship.id) issue(state, ship, { type: 'power', ship: ship.id, system: 'medbay', delta: 1 });
      issue(state, ship, { type: 'crew', crew: crew.id, room: heal.id, task: 'heal' });
    } else if (!destination && crew.shipId === ship.id && !crew.path.length && ['repair', 'extinguish', 'fight', 'idle'].includes(crew.task)) {
      const station = ship.rooms.find(candidate => candidate.system === (crew.skills.piloting > crew.skills.weapons ? 'cockpit' : crew.skills.repair > crew.skills.weapons ? 'engines' : 'weapons'));
      if (station) issue(state, ship, { type: 'crew', crew: crew.id, room: station.id, task: 'operate' });
    }
  }
  if (ship.modules.includes('ew') && powered(ship, 'ew')) issue(state, ship, { type: 'ew', mode: ship.doctrine === 'military' ? 'disrupt' : 'interfere' });
  if (ship.modules.includes('teleporter') && !home.shields && alive(state, ship.id).length > 1 && !alive(state, ship.id, home.id).length) {
    const boarder = ordered(alive(state, ship.id)).find(crew => !crew.path.length && crew.health >= 50);
    const entry = home.rooms[0];
    if (boarder && entry && working(system(ship, 'doors'))) {
      boarder.shipId = home.id;
      boarder.room = entry.id;
      boarder.path = [];
      boarder.progress = 0;
      boarder.task = 'fight';
      event(state, 'boarding', `${boarder.name} crossed the hostile docking tether.`);
    }
  }
  if (ship.maneuver === 0 && ship.armor[ship.bearing] < 1) {
    const bearing = [...bearings].sort((a, b) => ship.armor[b] - ship.armor[a])[0];
    issue(state, ship, { type: 'maneuver', bearing });
  }
}

/** Called once per fixed 50ms step; the owning game loop advances state.tick. */
export function tacticalTick(state: GameState): void {
  if (state.phase !== 'expedition') return;
  const ships = ordered(state.ships).filter(ship => ship.doctrine !== 'withdrawn');
  for (const ship of ships) if (ship.hull > 0 && ship.doctrine !== 'withdrawn') {
    if (state.encounter === 'hostile' && hostile(ship)) ship.aiTick++;
    ai(state, ship);
    for (const unit of ship.systems) if (unit.ion > 0) unit.ion--;
    enforcePower(state, ship);
  }
  moveCrew(state);
  for (const ship of ships) chargeWeapons(state, ship);
  projectiles(state);
  for (const ship of ships) if (ship.hull > 0 && ship.doctrine !== 'withdrawn') {
    atmosphere(state, ship);
    emergencies(state, ship);
  }
  crewTasks(state);
  for (const ship of ships) if (ship.hull > 0 && ship.doctrine !== 'withdrawn') {
    enforcePower(state, ship);
    recharge(state, ship);
  }
  terminals(state);
}
