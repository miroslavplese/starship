import { createGame } from '../sim/game';
import { createShip } from '../content/ships';
import type { GameState } from '../sim/types';

export function createDrill(kind: 'emergency' | 'boarding'): GameState {
  const s = createGame(7001);
  s.tutorial = 20;
  if (kind === 'emergency') {
    const room = s.ships[0].rooms.find(r => r.system === 'weapons')!;
    room.fire = 0.35; room.breach = 0.35; room.oxygen = 0.55;
    s.ships[0].systems.find(x => x.kind === 'weapons')!.health = 45;
    s.crew[1].room = s.ships[0].rooms.find(r => r.system === 'engines')!.id;
  } else {
    const wreck = createShip('derelict', false, true);
    s.ships.push(wreck); s.encounter = 'derelict'; s.locationId = 's0-wreck';
    s.crew[1].shipId = 'derelict'; s.crew[1].room = wreck.rooms.at(-1)!.id;
    s.crew[1].path = []; s.crew[1].task = 'idle';
    wreck.rooms.forEach(r => { r.oxygen = 0.8; r.fire = 0; r.breach = 0; });
  }
  return s;
}
