import type { Room } from '../sim/types';

export function displayRoomBounds(room: Pick<Room, 'x' | 'y' | 'w' | 'h'>, grid: { x: number; y: number; unit: number }, aftLeft: boolean) {
  const x = grid.x + room.x * grid.unit, w = room.w * grid.unit;
  // Simulation/save coordinates stay unchanged; reflect the complete compartment, not its label.
  return { x: aftLeft ? -x - w : x, y: grid.y + room.y * grid.unit, w, h: room.h * grid.unit };
}
