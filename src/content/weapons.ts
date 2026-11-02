import type { Family } from '../sim/types';

export interface WeaponStats {
  power: number;
  chargeTicks: number;
  travelTicks: number;
  projectiles: number;
  accuracy: number;
  hull: number;
  system: number;
  crew: number;
  ion: number;
  ammo: number;
  fire: number;
  breach: number;
}

export const WEAPONS: Readonly<Record<Family, Readonly<WeaponStats>>> = {
  laser: { power: 1, chargeTicks: 60, travelTicks: 16, projectiles: 1, accuracy: .95, hull: 3, system: 22, crew: 7, ion: 0, ammo: 0, fire: .12, breach: .06 },
  ion: { power: 1, chargeTicks: 80, travelTicks: 20, projectiles: 1, accuracy: 1, hull: 0, system: 0, crew: 0, ion: 80, ammo: 0, fire: 0, breach: 0 },
  missile: { power: 2, chargeTicks: 100, travelTicks: 26, projectiles: 1, accuracy: .9, hull: 6, system: 35, crew: 18, ion: 0, ammo: 1, fire: .2, breach: .4 },
  beam: { power: 2, chargeTicks: 120, travelTicks: 8, projectiles: 1, accuracy: 1, hull: 3, system: 18, crew: 10, ion: 0, ammo: 0, fire: .15, breach: 0 },
  kinetic: { power: 2, chargeTicks: 110, travelTicks: 14, projectiles: 3, accuracy: .85, hull: 2, system: 10, crew: 4, ion: 0, ammo: 0, fire: .03, breach: .12 },
  experimental: { power: 3, chargeTicks: 200, travelTicks: 32, projectiles: 1, accuracy: .9, hull: 4, system: 30, crew: 12, ion: 100, ammo: 0, fire: .3, breach: .3 },
};
