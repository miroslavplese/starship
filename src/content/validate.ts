import { createShip } from './ships';
import { generateRegion } from './region';
import { WEAPONS } from './weapons';
import type { Ship } from '../sim/types';

function assertLayout(ship: Ship) {
  const ids = new Set(ship.rooms.map(r => r.id));
  if (ids.size !== ship.rooms.length || ship.rooms.length === 0) throw new Error(`Content: duplicate/empty rooms in ${ship.name}.`);
  for (const room of ship.rooms) {
    if (![room.x, room.y, room.w, room.h].every(Number.isFinite) || room.w <= 0 || room.h <= 0) throw new Error(`Content: invalid geometry in ${room.id}.`);
    if (!ship.systems.some(x => x.kind === room.system)) throw new Error(`Content: missing ${room.system} in ${ship.name}.`);
    for (const other of ship.rooms) if (room.id !== other.id && room.x < other.x + other.w && room.x + room.w > other.x && room.y < other.y + other.h && room.y + room.h > other.y) throw new Error(`Content: overlapping rooms ${room.id}/${other.id}.`);
  }
  const reached = new Set([ship.rooms[0].id]);
  for (let i = 0; i < ship.rooms.length; i++) for (const door of ship.doors) {
    if (!ids.has(door.a) || (door.b !== null && !ids.has(door.b))) throw new Error(`Content: broken door ${door.id}.`);
    if (door.b !== null && (reached.has(door.a) || reached.has(door.b))) { reached.add(door.a); reached.add(door.b); }
  }
  if (reached.size !== ship.rooms.length) throw new Error(`Content: disconnected layout ${ship.name}.`);
}
export function validateContent(seed: number) {
  assertLayout(createShip('player')); assertLayout(createShip('enemy', true)); assertLayout(createShip('derelict', false, true));
  for (const kind of ['reactor', 'cockpit', 'engines', 'shields', 'weapons', 'oxygen', 'medbay', 'sensors', 'doors']) if (!createShip('player').systems.some(x => x.kind === kind)) throw new Error(`Content: missing core system ${kind}.`);
  for (const family of ['laser', 'ion', 'missile', 'beam', 'kinetic', 'experimental'] as const) if (!WEAPONS[family]) throw new Error(`Content: missing weapon family ${family}.`);
  const { region, contracts } = generateRegion(seed), locations = region.flatMap(r => r.locations);
  if (new Set(locations.map(l => l.id)).size !== locations.length) throw new Error('Content: duplicate locations.');
  if (contracts.some(c => !locations.some(l => l.id === c.destination) || !locations.some(l => l.id === c.origin && l.kind === 'station'))) throw new Error('Content: broken mission endpoint.');
  if (region.filter(r => r.locations.some(l => l.archive)).length !== 3 || !locations.some(l => l.kind === 'beacon')) throw new Error('Content: incomplete expedition objective.');
}
