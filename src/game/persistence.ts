import { z } from 'zod';
import { recorderKey } from '../content/expedition';
import { GOODS, UPGRADES } from '../content/region';
import type { GameState, Result } from '../sim/types';

const finite = z.number().finite();
const nonnegative = finite.min(0).max(1e9);
const integer = nonnegative.int();
const id = z.string().min(1).max(100);
const systemKind = z.enum(['reactor', 'cockpit', 'engines', 'shields', 'weapons', 'oxygen', 'medbay', 'sensors', 'doors', 'ew']);
const family = z.enum(['laser', 'ion', 'missile', 'beam', 'kinetic', 'experimental']);
const bearing = z.enum(['bow', 'stern', 'port', 'starboard']);
const task = z.enum(['idle', 'move', 'repair', 'extinguish', 'heal', 'operate', 'search', 'fight', 'sabotage', 'return']);
const commands = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cease-fire'), weapon: id }),
  z.object({ type: z.literal('weapon-priority'), weapon: id, direction: z.union([z.literal(-1), z.literal(1)]) }),
  z.object({ type: z.literal('crew'), crew: id, room: id, task }),
  z.object({ type: z.literal('door'), ship: id, door: id, lock: z.boolean().optional() }),
  z.object({ type: z.literal('power'), ship: id, system: systemKind, delta: z.number().int().min(-1).max(1) }),
  z.object({ type: z.literal('target'), weapon: id, room: id, auto: z.boolean() }),
  z.object({ type: z.literal('travel'), destination: id, system: z.boolean(), confirm: z.boolean().optional() }),
  z.object({ type: z.literal('action'), action: z.enum(['scan', 'probe', 'investigate', 'mine']) }),
  z.object({ type: z.literal('trade'), commodity: id, quantity: integer.min(1).max(1000), buy: z.boolean() }),
  z.object({ type: z.literal('service'), service: z.enum(['fuel', 'repair', 'data', 'intel', 'rescue', 'recruit']), module: id.optional() }),
  z.object({ type: z.literal('upgrade'), module: id }),
  z.object({ type: z.literal('contract'), id, action: z.enum(['accept', 'complete', 'abandon']) }),
  z.object({ type: z.literal('board'), crew: id, confirm: z.boolean().optional() }),
  z.object({ type: z.literal('recall'), emergency: z.boolean() }),
  z.object({ type: z.literal('ew'), mode: z.enum(['jam', 'disrupt', 'interfere', 'hack', 'hijack', 'intercept']) }),
  z.object({ type: z.literal('maneuver'), bearing }),
  z.object({ type: z.literal('customs'), choice: z.enum(['submit', 'bribe', 'conceal', 'spoof', 'flee', 'fight']) }),
  z.object({ type: z.literal('objective'), choice: z.enum(['chart', 'negotiate', 'spoof', 'recover', 'handin', 'withdraw']) }),
  z.object({ type: z.literal('surrender'), accept: z.boolean() }),
  z.object({ type: z.literal('abandon'), confirm: z.boolean() }),
  z.object({ type: z.literal('threat'), choice: z.enum(['evade', 'prepare', 'pay']) }),
]);
const baseSchema = z.object({
  version: z.literal(1), contentVersion: z.literal(1), seed: finite.int().min(0).max(4294967295), rng: finite.int().min(0).max(4294967295), tick: integer, nextId: integer,
  phase: z.enum(['expedition', 'victory', 'defeat', 'abandoned']), difficulty: z.enum(['standard', 'relaxed', 'hard']),
  ships: z.array(z.object({
    id, name: id, hull: nonnegative, maxHull: nonnegative.min(1), armor: z.object({ bow: nonnegative, stern: nonnegative, port: nonnegative, starboard: nonnegative }),
    bearing, reactor: integer.max(12), fuel: nonnegative, maxFuel: nonnegative, missiles: integer.max(10000), credits: nonnegative, debt: nonnegative.max(150),
    cargo: z.record(id, integer), capacity: integer, modules: z.array(id).max(6),
    systems: z.array(z.object({ kind: systemKind, health: nonnegative, max: nonnegative.min(1), power: integer, cap: integer, ion: nonnegative })).max(16),
    rooms: z.array(z.object({ id, name: id, x: nonnegative, y: nonnegative, w: nonnegative.min(0.1), h: nonnegative.min(0.1), oxygen: finite.min(0).max(1), fire: finite.min(0).max(1), breach: finite.min(0).max(10), searched: z.boolean(), system: systemKind })).min(1).max(32),
    doors: z.array(z.object({ id, a: id, b: id.nullable(), open: z.boolean(), locked: z.boolean(), health: nonnegative })).max(64),
    weapons: z.array(z.object({ id, family, charge: nonnegative, target: id.nullable(), auto: z.boolean() })).max(12),
    shields: nonnegative, shieldProgress: nonnegative, ftl: nonnegative.max(600), maneuver: nonnegative, maneuverTarget: bearing, aiTick: nonnegative, capture: nonnegative,
    doctrine: z.enum(['player', 'pirate', 'military', 'derelict']),
  })).min(1).max(4),
  crew: z.array(z.object({
    id, name: id, species: id, trait: id, health: nonnegative.max(100), shipId: id, home: id, room: id, path: z.array(id).max(64), progress: nonnegative, task, lostAt: z.string().max(512).optional(),
    skills: z.object({ piloting: nonnegative, engines: nonnegative, weapons: nonnegative, shields: nonnegative, repair: nonnegative, combat: nonnegative, science: nonnegative }),
  })).max(32),
  projectiles: z.array(z.object({ id, source: id, target: id, room: id, family, remaining: nonnegative, total: nonnegative })).max(256),
  region: z.array(z.object({
    id, name: id, risk: integer.max(3), faction: id, economy: id, routes: z.array(id).max(12), known: z.boolean(),
    locations: z.array(z.object({ id, name: id, kind: z.enum(['station', 'planet', 'belt', 'signal', 'derelict', 'pirate', 'beacon']), known: integer.max(3), surveyed: z.boolean(), depleted: z.boolean(), archive: z.boolean(), deposit: nonnegative })).max(16),
  })).min(1).max(12),
  systemId: id, locationId: id,
  markets: z.array(z.object({ id, stock: z.record(id, integer), factor: finite.min(0.1).max(5), event: id, observed: finite.min(-1), prices: z.record(id, nonnegative) })).max(192),
  contracts: z.array(z.object({
    id, kind: z.enum(['courier', 'freight', 'emergency', 'passenger', 'exploration', 'salvage', 'bounty', 'escort', 'recovery', 'smuggling', 'investigation']),
    name: id, origin: id, destination: id, reward: nonnegative, status: z.enum(['offered', 'active', 'complete', 'failed']),
    commodity: id, quantity: integer, progress: nonnegative, deadline: integer,
    acceptedTick: integer.optional(), failureReason: z.string().max(512).optional(),
    reservedManifest: z.object({ item: id, quantity: integer }).optional(),
    passenger: z.object({ name: id, health: nonnegative.max(100), roomId: id, status: z.enum(['aboard', 'delivered', 'dead']) }).optional(),
    convoyId: id.optional(), targetId: id.optional(), targetDefeated: z.boolean().optional(), salvageRecovered: nonnegative.optional(),
    recorderId: id.optional(), inspections: integer.optional(), inspectionPending: z.boolean().optional(),
    investigationIntercepted: z.boolean().optional(), investigationRelay: id.optional(),
  })).max(192),
  reputation: z.record(id, finite.min(-1000).max(1000)), discoveries: z.array(id).max(192), soldData: z.array(id).max(192), coordinates: z.array(id).max(3),
  archive: z.boolean(), guardian: z.boolean(), code: z.boolean(), beacon: z.boolean(), encounter: z.enum(['none', 'hostile', 'surrender', 'won', 'derelict']),
  rewards: z.array(id).max(256), travel: z.object({ destination: id, system: z.boolean(), remaining: nonnegative, total: nonnegative }).nullable(),
  action: z.object({ kind: z.enum(['scan', 'probe', 'investigate', 'mine']), remaining: nonnegative }).nullable(), customs: z.boolean(),
  events: z.array(z.object({ id: integer, tick: integer, kind: id, message: z.string().max(512) })).max(200), queue: z.array(commands).max(100), sequence: integer, tutorial: integer.max(20),
});
const schema = baseSchema.extend({
  wrecks: z.record(id, baseSchema.shape.ships.element).optional(),
  threat: z.object({ remaining: nonnegative, awaiting: z.boolean(), source: id }).nullable().optional(),
  userPaused: z.boolean().optional(),
  commandHistory: z.array(z.object({ tick: integer, sequence: integer, command: commands, queued: z.boolean() })).max(100).optional(),
  queueMeta: z.array(z.object({ tick: integer, sequence: integer })).max(100).optional(),
});
function checksum(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function validate(data: unknown): GameState {
  const s: GameState = schema.parse(data);
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(s.ships.map(x => x.id)) || !unique(s.crew.map(x => x.id)) || !unique(s.region.map(x => x.id)) || s.ships[0].id !== 'player') throw new Error('Duplicate or invalid entity identities.');
  const locations = s.region.flatMap(r => r.locations);
  const recorders = new Set(locations.filter(l => l.kind === 'derelict').map(l => recorderKey(l.id)));
  const sys = s.region.find(r => r.id === s.systemId);
  if (!sys || !sys.locations.some(l => l.id === s.locationId) || !unique(locations.map(l => l.id))) throw new Error('Invalid regional location references.');
  for (const sh of [...s.ships, ...Object.values(s.wrecks ?? {})]) {
    if (Object.entries(sh.cargo).some(([id, quantity]) => !GOODS.some(g => g.id === id) && !(quantity === 1 && recorders.has(id)))) throw new Error('Unknown cargo commodity or invalid flight recorder.');
    if (sh.modules.some(id => !Object.hasOwn(UPGRADES, id))) throw new Error('Unknown fitted upgrade.');
    if (sh.hull > sh.maxHull || sh.fuel > sh.maxFuel || sh.systems.reduce((n, x) => n + x.power, 0) > sh.reactor || !unique(sh.rooms.map(r => r.id)) || !unique(sh.doors.map(d => d.id)) || !unique(sh.systems.map(x => x.kind))) throw new Error('Invalid ship resource or layout bounds.');
    if (sh.systems.some(x => x.health > x.max || x.power > (x.health > 0 && x.ion <= 0 ? Math.min(x.cap, Math.ceil(x.cap * x.health / x.max)) : 0))) throw new Error('Invalid system power or health.');
    const reactor = sh.systems.find(x => x.kind === 'reactor');
    if (!reactor || sh.systems.reduce((n, x) => n + x.power, 0) > Math.floor(sh.reactor * reactor.health / reactor.max)) throw new Error('Invalid functional reactor budget.');
    if (!['cockpit', 'engines', 'oxygen', 'doors', 'sensors'].every(kind => sh.systems.some(x => x.kind === kind))) throw new Error('Missing core ship systems.');
    if (sh.doors.some(d => !sh.rooms.some(r => r.id === d.a) || (d.b !== null && !sh.rooms.some(r => r.id === d.b)))) throw new Error('Broken door room reference.');
    if (sh.rooms.some(r => !sh.systems.some(x => x.kind === r.system)) || !unique(sh.weapons.map(w => w.id))) throw new Error('Broken room system or weapon identity.');
    if (sh.weapons.some(w => w.target !== null && !s.ships.some(target => target.id !== sh.id && target.rooms.some(r => r.id === w.target)))) throw new Error('Broken weapon target.');
    if (Object.values(sh.cargo).reduce((a, b) => a + b, 0) > sh.capacity) throw new Error('Cargo exceeds hold capacity.');
  }
  for (const c of s.crew) {
    const sh = s.ships.find(x => x.id === c.shipId);
    if (!sh || !sh.rooms.some(r => r.id === c.room) || c.path.some(id => !sh.rooms.some(r => r.id === id))) throw new Error('Broken crew location or route.');
  }
  if (s.region.some(r => r.routes.some(id => !s.region.some(x => x.id === id)))) throw new Error('Broken jump route.');
  if (s.travel && (s.travel.system ? !s.region.some(r => r.id === s.travel!.destination) : !sys.locations.some(l => l.id === s.travel!.destination))) throw new Error('Broken travel destination.');
  if (s.travel && s.travel.remaining > s.travel.total) throw new Error('Invalid travel timer.');
  if (s.contracts.some(c => !locations.some(l => l.id === c.origin) || !locations.some(l => l.id === c.destination))) throw new Error('Broken mission reference.');
  if (!unique(s.contracts.map(c => c.id)) || !unique(s.markets.map(m => m.id)) || s.markets.some(m => !locations.some(l => l.id === m.id && l.kind === 'station'))) throw new Error('Broken market or contract identity.');
  if (!unique(s.coordinates) || s.coordinates.some(id => !['s2', 's4', 's5'].includes(id))) throw new Error('Invalid archive coordinates.');
  const validDiscovery = (value: string) => locations.some(l => l.id === value || `intercept:${l.id}` === value) || s.region.some(r => `route:${r.id}` === value);
  if (!unique(s.discoveries) || !unique(s.soldData) || s.discoveries.some(id => !validDiscovery(id)) || s.soldData.some(id => !s.discoveries.includes(id))) throw new Error('Invalid survey references.');
  if (s.contracts.filter(c => c.status === 'active').length > 12) throw new Error('Too many active contracts.');
  const reserved = s.contracts.filter(c => c.status === 'active' && ['freight', 'passenger', 'courier', 'smuggling'].includes(c.kind)).reduce((n, c) => n + c.quantity, 0);
  if (Object.values(s.ships[0].cargo).reduce((a, b) => a + b, 0) + reserved > s.ships[0].capacity) throw new Error('Loose and reserved cargo exceed capacity.');
  if (s.queueMeta && s.queueMeta.length !== s.queue.length) throw new Error('Command queue metadata mismatch.');
  if (Object.keys(s.wrecks ?? {}).length > 128 || Object.keys(s.wrecks ?? {}).some(key => !locations.some(l => l.id === key && l.kind === 'derelict'))) throw new Error('Broken persistent wreck reference.');
  if (s.threat && !locations.some(l => l.id === s.threat!.source)) throw new Error('Broken incoming threat source.');
  if (s.projectiles.some(p => !s.ships.some(sh => sh.id === p.source) || !s.ships.some(sh => sh.id === p.target && sh.rooms.some(r => r.id === p.room)))) throw new Error('Broken projectile target.');
  return s;
}
export function encode(s: GameState): string {
  const payload = JSON.stringify(validate(s)), encoded = JSON.stringify({ schema: 1, checksum: checksum(payload), payload });
  if (encoded.length > 1048576) throw new Error('Save exceeds 1 MiB. Export diagnostics and retain the previous save.');
  return encoded;
}
export function decode(text: string): GameState {
  if (text.length > 1048576) throw new Error('Import exceeds 1 MiB.');
  const envelope: unknown = JSON.parse(text);
  const e = z.object({ schema: z.literal(1), checksum: z.string(), payload: z.string() }).parse(envelope);
  if (checksum(e.payload) !== e.checksum) throw new Error('Save checksum mismatch. Try the previous known-good slot.');
  return validate(JSON.parse(e.payload));
}
export const SAVE_KEY = 'starship.save.v1';
export const PREVIOUS_KEY = 'starship.previous.v1';
export const CORRUPT_KEY = 'starship.corrupt.v1';
export type SaveResult = Result & { quarantined?: boolean };

function decodeError(text: string): string | null {
  try { decode(text); return null; }
  catch (e) { return e instanceof Error ? e.message : String(e); }
}

export function recoveryDiagnostics(storage: Storage = localStorage): string {
  const primary = storage.getItem(SAVE_KEY), previous = storage.getItem(PREVIOUS_KEY), quarantined = storage.getItem(CORRUPT_KEY);
  return JSON.stringify({
    schema: 1, primary, previous, quarantined,
    primaryError: primary === null ? null : decodeError(primary),
    quarantinedError: quarantined === null ? null : decodeError(quarantined),
  }, null, 2);
}

export function discardCorruptSaves(storage: Storage = localStorage): Result {
  try {
    const primary = storage.getItem(SAVE_KEY);
    const corruptPrimary = primary !== null && decodeError(primary) !== null;
    if (corruptPrimary) storage.removeItem(SAVE_KEY);
    storage.removeItem(CORRUPT_KEY);
    if ((corruptPrimary && storage.getItem(SAVE_KEY) !== null) || storage.getItem(CORRUPT_KEY) !== null) throw new Error('Corrupt saved bytes could not be removed.');
    return { ok: true };
  } catch (e) { return { ok: false, message: `Diagnostic discard failed: ${e instanceof Error ? e.message : String(e)}. Export recovery diagnostics before retrying.` }; }
}

export function save(s: GameState, storage: Storage = localStorage): SaveResult {
  try {
    const bytes = encode(s), prior = storage.getItem(SAVE_KEY);
    let quarantined = false;
    if (prior !== null) {
      if (decodeError(prior) === null) storage.setItem(PREVIOUS_KEY, prior);
      else {
        if (prior.length > 1048576) throw new Error('Corrupt primary exceeds the 1 MiB diagnostic limit. Export recovery diagnostics and confirm discard before saving.');
        const retained = storage.getItem(CORRUPT_KEY);
        if (retained !== null && retained !== prior) throw new Error('A different corrupt save is already retained. Export recovery diagnostics and confirm discard before saving.');
        storage.setItem(CORRUPT_KEY, prior);
        if (storage.getItem(CORRUPT_KEY) !== prior) throw new Error('Corrupt-save diagnostic read-back failed; primary retained.');
        quarantined = true;
      }
    }
    storage.setItem(SAVE_KEY, bytes);
    const readback = storage.getItem(SAVE_KEY);
    if (readback !== bytes) throw new Error('Save read-back failed; previous slot retained.');
    decode(readback);
    return quarantined ? { ok: true, quarantined: true } : { ok: true };
  } catch (e) { return { ok: false, message: `Save failed: ${e instanceof Error ? e.message : String(e)}. Export your run or recover the previous slot.` }; }
}
