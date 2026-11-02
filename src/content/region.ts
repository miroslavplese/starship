import type { Contract, GameState, Market, StarSystem } from '../sim/types';

export const GOODS = [
  { id: 'food', name: 'Hydroponic food', base: 8, mass: 1, economy: 'Agricultural', illegal: false },
  { id: 'ore', name: 'Titanium ore', base: 12, mass: 3, economy: 'Mining', illegal: false },
  { id: 'parts', name: 'Machine parts', base: 18, mass: 2, economy: 'Industrial', illegal: false },
  { id: 'medicine', name: 'Med cultures', base: 24, mass: 1, economy: 'High-Tech', illegal: false },
  { id: 'circuits', name: 'Quantum circuits', base: 30, mass: 1, economy: 'High-Tech', illegal: false },
  { id: 'water', name: 'Purified water', base: 5, mass: 2, economy: 'Agricultural', illegal: false },
  { id: 'arms', name: 'Restricted weapons', base: 40, mass: 2, economy: 'Military', illegal: true },
  { id: 'ai', name: 'Banned AI cores', base: 65, mass: 1, economy: 'High-Tech', illegal: true },
  { id: 'samples', name: 'Biological samples', base: 35, mass: 1, economy: 'Colony', illegal: true },
  { id: 'relics', name: 'Alien artifacts', base: 80, mass: 2, economy: 'Colony', illegal: true },
] as const;
export const UPGRADES: Record<string, { name: string; cost: number; description: string }> = {
  reactor: { name: 'Reactor expansion', cost: 60, description: '+2 reactor output (maximum 12)' },
  cargo: { name: 'Cargo lattice', cost: 40, description: '+10 cargo volume; occupies a module slot' },
  fuel: { name: 'Auxiliary fuel tank', cost: 40, description: '+4 fuel capacity; occupies a module slot' },
  sensors: { name: 'Deep-field sensors', cost: 50, description: 'Faster scans and stronger science returns' },
  ew: { name: 'Electronic warfare suite', cost: 60, description: 'Hacking, interference, customs spoof and guardian bypass' },
  mining: { name: 'Prospector drill', cost: 40, description: 'Extract finite mineral deposits' },
  teleporter: { name: 'Boarding tether', cost: 70, description: 'Board hostile ships while shields are down' },
  drones: { name: 'Defense drone', cost: 60, description: 'Intercept incoming projectiles; vulnerable to hijacking' },
  crew: { name: 'Expanded crew berths', cost: 45, description: '+2 recruit capacity, from six to eight; occupies one module slot' },
  engines: { name: 'Engine tuning', cost: 50, description: '+1 engine capacity and faster travel' },
  shields: { name: 'Shield capacitor', cost: 65, description: '+1 shield power capacity' },
  armor: { name: 'Directional plating', cost: 50, description: '+3 armor to all four sections' },
  laser: { name: 'Pulse laser', cost: 45, description: 'Reliable non-consumable shield-stripping shot' },
  ion: { name: 'Ion lance', cost: 45, description: 'Suppress shields and lock system allocations' },
  missile: { name: 'Breach missile', cost: 55, description: 'Ammunition-consuming shield bypass' },
  beam: { name: 'Prism beam', cost: 65, description: 'Room-crossing damage; blocked by shields' },
  kinetic: { name: 'Rail burst', cost: 55, description: 'Multi-projectile shield stripping' },
  experimental: { name: 'Entropy lens', cost: 85, description: 'Long-charge atmospheric disruption' },
};

export function generateRegion(seed: number): { region: StarSystem[]; markets: Market[]; contracts: Contract[] } {
  const names = ['Helios', 'Cinder', 'Verdant', 'Orison', 'Vesper', 'Nacre', 'The Veil', 'Terminus'];
  const economies = ['Agricultural', 'Industrial', 'Mining', 'High-Tech', 'Military', 'Colony'];
  const region: StarSystem[] = names.map((name, i) => ({
    id: `s${i}`, name, risk: Math.min(3, Math.floor(i / 2)), faction: i % 3 === 0 ? 'Concord' : i % 3 === 1 ? 'Freeholds' : 'Syndicate',
    economy: economies[(i + seed % 6) % 6], known: i < 6,
    routes: [...(i > 0 ? [`s${i - 1}`] : []), ...(i < 7 ? [`s${i + 1}`] : []), ...(i === 0 ? ['s3'] : i === 3 ? ['s0', 's6'] : i === 6 ? ['s3'] : [])],
    locations: [
      { id: `s${i}-station`, name: i === 0 ? 'Haven Anchorage' : `${name} Exchange`, kind: 'station', known: 3, surveyed: false, depleted: false, archive: false, deposit: 0 },
      { id: `s${i}-outpost`, name: `${name} Research Outpost`, kind: 'station', known: 2, surveyed: false, depleted: false, archive: false, deposit: 0 },
      ...[0, 1, 2].map(n => ({ id: `s${i}-planet${n}`, name: `${name} ${['I', 'II', 'III'][n]}`, kind: 'planet' as const, known: n === 0 ? 2 : 1, surveyed: false, depleted: false, archive: i === 2 && n === 1, deposit: 0 })),
      { id: `s${i}-belt`, name: `${name} Shattered Belt`, kind: 'belt', known: 2, surveyed: false, depleted: false, archive: false, deposit: 8 + seed % 5 },
      ...[0, 1, 2].map(n => ({ id: `s${i}-signal${n}`, name: ['Echoing anomaly', 'Lost relay', 'Hidden installation'][n], kind: 'signal' as const, known: 0, surveyed: false, depleted: false, archive: i === 4 && n === 1, deposit: 0 })),
      { id: `s${i}-wreck`, name: `Derelict ${name} Surveyor`, kind: 'derelict', known: 1, surveyed: false, depleted: false, archive: i === 5, deposit: 0 },
      { id: `s${i}-pirate`, name: `Raider ${['Kestrel', 'Shrike', 'Vulture'][i % 3]}`, kind: 'pirate', known: 1, surveyed: false, depleted: false, archive: false, deposit: 0 },
      ...(i === 7 ? [{ id: 's7-beacon', name: 'The Cartographer Beacon', kind: 'beacon' as const, known: 3, surveyed: false, depleted: false, archive: false, deposit: 0 }] : []),
    ],
  }));
  for (let i = 1; i < region.length - 2; i++) {
    const destination = Math.min(region.length - 1, i + 2 + ((seed >>> (i * 3)) & 1));
    if (!region[i].routes.includes(`s${destination}`)) region[i].routes.push(`s${destination}`);
    if (!region[destination].routes.includes(`s${i}`)) region[destination].routes.push(`s${i}`);
  }
  region[6].locations = region[6].locations.filter(l => l.id !== 's6-outpost');
  region[7].locations = region[7].locations.filter(l => l.kind !== 'station');
  const markets = region.flatMap((s, i) => s.locations.filter(l => l.kind === 'station').map((l, n) => ({
    id: l.id, stock: Object.fromEntries(GOODS.map(g => [g.id, 12 + ((seed + i * 7 + n * 11 + g.base) % 20)])),
    factor: n ? 1.15 : 1, event: 'Stable', observed: -1, prices: {},
  })));
  const kinds = ['courier', 'freight', 'emergency', 'passenger', 'exploration', 'salvage', 'bounty', 'escort', 'recovery', 'smuggling', 'investigation'] as const;
  const contracts: Contract[] = region.filter(s => s.locations.some(l => l.id === `${s.id}-station`)).flatMap(s => kinds.map((kind, n) => ({
    id: `${s.id}-${kind}`, kind, name: `${['Relay dispatch', 'Supply run', 'Outbreak relief', 'Research passage', 'Planetary survey', 'Wreck reclamation', 'Raider interdiction', 'Convoy escort', 'Flight recorder', 'Shadow manifest', 'Silent relay'][n]}`,
    origin: `${s.id}-station`, destination: kind === 'exploration' ? `${s.id}-planet0` : kind === 'salvage' || kind === 'recovery' ? `${s.id}-wreck` : kind === 'bounty' || kind === 'escort' ? `${s.id}-pirate` : kind === 'investigation' ? `${s.id}-signal0` : s.id === 's6' ? 's5-outpost' : `${s.id}-outpost`,
    reward: 25 + n * 4 + ((seed + n * 13 + Number(s.id.slice(1)) * 7) % 7), status: 'offered', commodity: kind === 'emergency' ? 'medicine' : kind === 'smuggling' ? 'arms' : 'food', quantity: kind === 'freight' ? 3 : 1, progress: 0, deadline: 0,
  })));
  return { region, markets, contracts };
}
export function fittingReason(state: GameState, module: string): string | null {
  const system = state.region.find(s => s.id === state.systemId)!;
  const research = state.locationId.endsWith('-outpost') || system.economy === 'High-Tech';
  if (['experimental', 'ew', 'teleporter', 'drones'].includes(module) && !research) return 'Advanced fitting requires a research outpost or High-Tech economy.';
  if (['reactor', 'armor', 'kinetic'].includes(module) && state.locationId.endsWith('-outpost')) return 'Heavy fitting requires a full-size anchorage.';
  if ((state.reputation[system.faction] ?? 0) < -5 && ['experimental', 'teleporter'].includes(module)) return 'Faction reputation -5 or higher required for restricted equipment.';
  return null;
}
export function cargoUsed(state: GameState): number {
  const p = state.ships[0];
  return Object.values(p.cargo).reduce((a, b) => a + b, 0) + state.contracts.filter(c => c.status === 'active' && ['freight', 'passenger', 'courier', 'smuggling'].includes(c.kind)).reduce((a, c) => a + c.quantity, 0);
}
export function cargoMass(state: GameState): number {
  return GOODS.reduce((sum, g) => sum + (state.ships[0].cargo[g.id] ?? 0) * g.mass, 0);
}
export function price(state: GameState, station: string, commodity: string, buy: boolean, stockOverride?: number): number {
  const good = GOODS.find(g => g.id === commodity);
  const market = state.markets.find(m => m.id === station);
  const system = state.region.find(s => s.locations.some(l => l.id === station));
  if (!good || !market || !system) return 0;
  const production = system.economy === good.economy ? 0.65 : system.economy === 'Colony' ? 1.35 : 1.1;
  const scarcity = Math.max(0.75, Math.min(1.6, 1.3 - (stockOverride ?? market.stock[commodity] ?? 0) / 80));
  const rep = state.reputation[system.faction] ?? 0;
  return Math.max(1, Math.round(good.base * production * scarcity * market.factor * (buy ? 1.12 - Math.min(20, rep) / 500 : 0.83 + Math.min(20, rep) / 600)));
}
export function tradeQuote(state: GameState, station: string, commodity: string, quantity: number, buy: boolean): number {
  const stock = state.markets.find(m => m.id === station)?.stock[commodity] ?? 0;
  let total = 0;
  for (let i = 0; i < quantity; i++) total += price(state, station, commodity, buy, buy ? stock - i : stock + i + 1);
  return total;
}
