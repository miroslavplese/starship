import type { GameState, Location, MissionKind, SystemKind } from '../sim/types';

export const SURVEY_CATEGORIES = ['planetary', 'mineral', 'route', 'anomaly', 'biological', 'ruin', 'faction'] as const;
export type SurveyKind = typeof SURVEY_CATEGORIES[number];

export const SURVEY_VALUES: Record<SurveyKind, number> = {
  planetary: 25, mineral: 20, route: 15, anomaly: 35, biological: 30, ruin: 35, faction: 20,
};

export const SURVEY_DESCRIPTIONS: Record<SurveyKind, string> = {
  planetary: 'Surface radar resolves stable landing ground, weather cells and gravitational hazards.',
  mineral: 'Spectrograph cores chart finite titanium seams and the fractures around them.',
  route: 'Repeated timing pulses establish a navigable corridor through the interference.',
  anomaly: 'A controlled probe records an impossible spectral echo without entering its lethal core.',
  biological: 'Sterile samplers isolate a viable ecosystem; its contamination markers travel with the record.',
  ruin: 'Layered inscriptions expose a vanished expedition’s chronology and preserved archive bearings.',
  faction: 'Traffic signatures identify the installation’s allegiance, patrol schedules and restricted approaches.',
};

export function surveyKind(location: Location, systemIndex = 0): SurveyKind {
  if (location.kind === 'belt') return 'mineral';
  if (location.kind === 'derelict') return 'ruin';
  if (location.kind === 'beacon') return 'route';
  if (location.kind === 'station' || location.kind === 'pirate') return 'faction';
  const suffix = Number(location.id.match(/(\d+)$/)?.[1] ?? Math.abs(systemIndex));
  if (location.kind === 'planet') return (['planetary', 'biological', 'ruin'] as const)[suffix % 3];
  return (['anomaly', 'route', 'faction'] as const)[suffix % 3];
}

export function discoveryKind(state: GameState, id: string): SurveyKind {
  if (id.startsWith('route:')) return 'route';
  if (id.startsWith('intercept:')) return 'faction';
  const declared = SURVEY_CATEGORIES.find(kind => id.startsWith(`${kind}:`) || id.startsWith(`survey:${kind}:`));
  if (declared) return declared;
  for (const [index, system] of state.region.entries()) {
    const location = system.locations.find(candidate => candidate.id === id || `survey:${candidate.id}` === id);
    if (location) return surveyKind(location, index);
  }
  return 'faction';
}

export const MISSION_BRIEFINGS: Record<MissionKind, string> = {
  courier: 'Carry a sealed dispatch to the named destination. Its reserved berth cannot be traded.',
  freight: 'Deliver the bonded goods in your reserved hold. Your own market stock is separate.',
  emergency: 'Supply your own medicine before the outbreak deadline. Acceptance does not provide free medicine.',
  passenger: 'A named researcher boards your life-support compartment. Keep their cabin breathable and fire-free until arrival.',
  exploration: 'Investigate the specified unsurveyed location after accepting. Earlier surveys and other sites do not qualify.',
  salvage: 'Physically search engineering compartments for at least three components. Return the recovered parts to the issuing station.',
  bounty: 'Defeat the uniquely identified raider at the marked site. Other battles, escape and ceasefire do not satisfy the warrant.',
  escort: 'A real unarmed convoy accompanies you. Defeat its marked attacker with the convoy hull intact; its loss fails the escort.',
  recovery: 'Board the specified wreck, search its cockpit for the unique flight recorder, and return it to the issuing station.',
  smuggling: 'Carry a reserved restricted manifest through an actual customs inspection, then deliver it at the destination. Confiscation fails the job.',
  investigation: 'First intercept a code with powered EW, then physically investigate the specified silent relay. A survey alone is not evidence.',
};

export type CompartmentOutcome =
  | { kind: 'logs'; text: string }
  | { kind: 'recorder'; text: string }
  | { kind: 'components'; quantity: number; text: string }
  | { kind: 'cargo'; item: string; quantity: number; text: string }
  | { kind: 'fuel'; quantity: number; text: string }
  | { kind: 'survivor'; name: string; text: string }
  | { kind: 'threat'; text: string };

export const COMPARTMENT_OUTCOMES: Record<SystemKind, CompartmentOutcome> = {
  cockpit: { kind: 'recorder', text: 'The captain’s harness is empty. A crash-protected flight recorder still holds the Surveyor’s final trajectory; this is a unique recovery item, not machine parts.' },
  sensors: { kind: 'logs', text: 'The sensor spool describes an artificial echo ahead of the ship. Its last entry warns: the weapons locker was opened from inside.' },
  weapons: { kind: 'threat', text: 'A stranded armed scavenger bursts from the ammunition locker. A ruptured cell ignites the room and consumes its remaining air. Fight, withdraw, or vent the compartment.' },
  shields: { kind: 'components', quantity: 2, text: 'Two intact emitter couplings can be disconnected without energizing the ruined shield grid.' },
  engines: { kind: 'components', quantity: 2, text: 'The cracked drive casing holds two usable actuator assemblies. The existing hull breach still needs repair.' },
  doors: { kind: 'cargo', item: 'food', quantity: 2, text: 'Behind a manually released bulkhead are two sealed emergency ration crates.' },
  medbay: { kind: 'survivor', name: 'Dr. Sable', text: 'A failing stasis cot contains Dr. Sable, alive but injured. They join the expedition here on the wreck: escort them to the tether before leaving.' },
  oxygen: { kind: 'cargo', item: 'medicine', quantity: 1, text: 'A sterile maintenance locker contains one sealed medical culture. This does not restore the failed oxygen plant; power and repair are still required.' },
  ew: { kind: 'logs', text: 'A hardened message buffer preserves the crew’s evacuation order and archive-bearing fragments. The knowledge survives even if the recovered cargo is later lost.' },
  reactor: { kind: 'fuel', quantity: 2, text: 'Two isolated fuel cells are safe to transfer. The cold reactor remains damaged; searching does not repair or power it.' },
};
