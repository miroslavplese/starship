import type { Crew, Room, Ship, SystemKind } from '../sim/types';

const kinds: SystemKind[] = ['cockpit', 'sensors', 'weapons', 'shields', 'engines', 'doors', 'medbay', 'oxygen', 'ew', 'reactor'];
const caps: Record<SystemKind, number> = { reactor: 0, cockpit: 0, engines: 4, shields: 4, weapons: 6, oxygen: 2, medbay: 2, sensors: 2, doors: 1, ew: 2 };
const allocation: Record<SystemKind, number> = { reactor: 0, cockpit: 0, engines: 2, shields: 2, weapons: 2, oxygen: 1, medbay: 0, sensors: 1, doors: 0, ew: 0 };

export function createShip(id: string, enemy = false, derelict = false): Ship {
  const columns = enemy || derelict ? 4 : 5;
  const rooms: Room[] = kinds.map((kind, index) => ({
    id: `${id}-${kind}`, name: kind[0].toUpperCase() + kind.slice(1),
    x: index % columns * 2, y: Math.floor(index / columns) * 2, w: 2, h: 2,
    system: kind, oxygen: derelict ? .35 : 1,
    fire: derelict && kind === 'weapons' ? .25 : 0,
    breach: derelict && kind === 'engines' ? .4 : 0, searched: false,
  }));
  const doors: Ship['doors'] = [];
  for (const a of rooms) {
    for (const b of rooms) {
      if (a.id >= b.id) continue;
      if ((a.x === b.x && Math.abs(a.y - b.y) === 2) || (a.y === b.y && Math.abs(a.x - b.x) === 2)) {
        doors.push({ id: `${id}-door-${doors.length}`, a: a.id, b: b.id, open: true, locked: false, health: 100 });
      }
    }
  }
  doors.push({ id: `${id}-airlock`, a: `${id}-doors`, b: null, open: false, locked: false, health: 100 });
  return {
    id, name: derelict ? 'Silent Meridian' : enemy ? 'Corsair' : 'Wayfarer',
    hull: derelict ? 18 : enemy ? 24 : 30, maxHull: enemy ? 24 : 30,
    armor: { bow: 3, stern: 1, port: 2, starboard: 2 }, bearing: 'bow',
    reactor: enemy ? 8 : 10, fuel: 7, maxFuel: 10, missiles: 4,
    credits: enemy ? 0 : 60, debt: 0, cargo: {}, capacity: 20, modules: [],
    systems: kinds.map(kind => ({
      kind, health: derelict ? kind === 'oxygen' ? 0 : 50 : 100, max: 100,
      power: derelict ? 0 : allocation[kind], cap: caps[kind], ion: 0,
    })),
    rooms, doors, weapons: derelict ? [] : [
      { id: `${id}-laser`, family: 'laser', charge: 0, target: null, auto: false },
      { id: `${id}-ion`, family: 'ion', charge: 0, target: null, auto: false },
    ],
    shields: derelict ? 0 : 1, shieldProgress: 0, ftl: 0, maneuver: 0,
    maneuverTarget: 'bow', aiTick: 0, capture: 0,
    doctrine: derelict ? 'derelict' : enemy ? 'pirate' : 'player',
  };
}

export function createCrew(shipId: string, enemy = false): Crew[] {
  return (enemy ? ['Vex', 'Orra', 'Tal'] : ['Mara', 'Ivo', 'Kade']).map((name, index) => ({
    id: `${shipId}-crew-${index + 1}`, name, species: index === 1 ? 'Vespan' : 'Human',
    trait: ['swift', 'methodical', 'resilient'][index], health: 100,
    shipId, home: shipId, room: `${shipId}-${['cockpit', 'engines', 'weapons'][index]}`,
    path: [], progress: 0, task: 'operate',
    skills: {
      piloting: index === 0 ? 2 : 0, engines: index === 1 ? 2 : 0,
      weapons: index === 2 ? 2 : 0, shields: index === 0 ? 1 : 0,
      repair: index === 1 ? 3 : 1, combat: enemy ? 2 : 1, science: index === 2 ? 3 : 0,
    },
  }));
}
