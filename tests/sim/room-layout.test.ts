import { expect, it } from 'vitest';
import { createShip } from '../../src/content/ships';
import { displayRoomBounds } from '../../src/render/layout';
import { decode, encode } from '../../src/game/persistence';
import { createGame, step } from '../../src/sim/game';
import { path } from '../../src/sim/tactical';
import type { Ship } from '../../src/sim/types';

function layout(ship: Ship) {
  const minX = Math.min(...ship.rooms.map(room => room.x)), minY = Math.min(...ship.rooms.map(room => room.y));
  const width = Math.max(...ship.rooms.map(room => room.x + room.w)) - minX;
  const height = Math.max(...ship.rooms.map(room => room.y + room.h)) - minY;
  const unit = Math.min(540 / width, 285 / height);
  const grid = { x: -(minX + width / 2) * unit, y: -(minY + height / 2) * unit, unit };
  return new Map(ship.rooms.map(room => [room.id, displayRoomBounds(room, grid, ship.id === 'player')]));
}

it('puts Wayfarer engines/reactor beside left exhaust and bridge/sensors toward the right bow without changing rooms', () => {
  const ship = createShip('player'), original = structuredClone(ship), bounds = layout(ship);
  const center = (kind: string) => { const room = bounds.get(`player-${kind}`)!; return room.x + room.w / 2; };
  expect(center('engines')).toBe(-216); expect(center('reactor')).toBe(-216);
  expect(center('cockpit')).toBe(216); expect(center('sensors')).toBe(108);
  expect(center('weapons')).toBe(0); expect(center('oxygen')).toBe(0);
  expect(center('medbay')).toBe(108);
  expect(ship).toEqual(original);
});

it('reflects nonzero-origin room envelopes and preserves every connected wall and path', () => {
  const ship = createShip('player');
  for (const room of ship.rooms) { room.x += 7; room.y += 3; }
  const bounds = layout(ship);
  for (const door of ship.doors) {
    if (!door.b) continue;
    const a = bounds.get(door.a)!, b = bounds.get(door.b)!;
    expect((a.y === b.y && Math.abs(a.x - b.x) === a.w) || (a.x === b.x && Math.abs(a.y - b.y) === a.h)).toBe(true);
  }
  for (const a of ship.rooms) for (const b of ship.rooms) expect(path(ship, a.id, b.id)).not.toBeNull();
});

it('keeps Corsair/derelict geometry and target identities unchanged in the shared renderer', () => {
  for (const ship of [createShip('enemy', true), createShip('wreck', false, true)]) {
    const bounds = layout(ship), left = bounds.get(`${ship.id}-cockpit`)!;
    expect(left.x).toBeLessThan(0);
    expect([...bounds.values()].every(room => room.w > 0 && room.h > 0)).toBe(true);
    expect([...bounds.keys()]).toEqual(ship.rooms.map(room => room.id));
  }
});

it('leaves old save bytes, crew locations, queued targets and deterministic simulation continuation intact', () => {
  const state = createGame(12345); state.tick = 1203;
  state.queue = [{ type: 'crew', crew: 'player-crew-2', room: 'player-reactor', task: 'repair' }];
  state.queueMeta = [{ tick: state.tick, sequence: state.sequence }];
  const bytes = encode(state), saved = decode(bytes), control = decode(bytes);
  layout(saved.ships[0]);
  expect(encode(saved)).toBe(bytes);
  expect(saved.crew[1].room).toBe('player-engines');
  expect(path(saved.ships[0], 'player-engines', 'player-reactor')).toEqual(['player-reactor']);
  saved.userPaused = false; control.userPaused = false;
  for (let tick = 0; tick < 100; tick++) { step(saved); step(control); expect(saved).toEqual(control); }
  expect(saved.crew[1].room).toBe('player-reactor');
  expect(saved.queue).toHaveLength(0);
});
