export type SystemKind = 'reactor' | 'cockpit' | 'engines' | 'shields' | 'weapons' | 'oxygen' | 'medbay' | 'sensors' | 'doors' | 'ew';
export type Family = 'laser' | 'ion' | 'missile' | 'beam' | 'kinetic' | 'experimental';
export type Bearing = 'bow' | 'stern' | 'port' | 'starboard';
export interface Room { id: string; name: string; x: number; y: number; w: number; h: number; oxygen: number; fire: number; breach: number; searched: boolean; system: SystemKind }
export interface Door { id: string; a: string; b: string | null; open: boolean; locked: boolean; health: number }
export interface System { kind: SystemKind; health: number; max: number; power: number; cap: number; ion: number }
export interface Weapon { id: string; family: Family; charge: number; target: string | null; auto: boolean }
export type Task = 'idle' | 'move' | 'repair' | 'extinguish' | 'heal' | 'operate' | 'search' | 'fight' | 'sabotage' | 'return';
export interface Crew { id: string; name: string; species: string; trait: string; health: number; shipId: string; home: string; room: string; path: string[]; progress: number; task: Task; lostAt?: string; skills: Record<'piloting' | 'engines' | 'weapons' | 'shields' | 'repair' | 'combat' | 'science', number> }
export interface Ship { id: string; name: string; hull: number; maxHull: number; armor: Record<Bearing, number>; bearing: Bearing; reactor: number; fuel: number; maxFuel: number; missiles: number; credits: number; debt: number; cargo: Record<string, number>; capacity: number; modules: string[]; systems: System[]; rooms: Room[]; doors: Door[]; weapons: Weapon[]; shields: number; shieldProgress: number; ftl: number; maneuver: number; maneuverTarget: Bearing; aiTick: number; capture: number; doctrine: 'player' | 'pirate' | 'military' | 'derelict' }
export interface Projectile { id: string; source: string; target: string; room: string; family: Family; remaining: number; total: number }
export type LocationKind = 'station' | 'planet' | 'belt' | 'signal' | 'derelict' | 'pirate' | 'beacon';
export interface Location { id: string; name: string; kind: LocationKind; known: number; surveyed: boolean; depleted: boolean; archive: boolean; deposit: number }
export interface StarSystem { id: string; name: string; risk: number; faction: string; economy: string; routes: string[]; known: boolean; locations: Location[] }
export interface Market { id: string; stock: Record<string, number>; factor: number; event: string; observed: number; prices: Record<string, number> }
export type MissionKind = 'courier' | 'freight' | 'emergency' | 'passenger' | 'exploration' | 'salvage' | 'bounty' | 'escort' | 'recovery' | 'smuggling' | 'investigation';
export interface Contract {
  id: string; kind: MissionKind; name: string; origin: string; destination: string; reward: number; status: 'offered' | 'active' | 'complete' | 'failed'; commodity: string; quantity: number; progress: number; deadline: number;
  acceptedTick?: number;
  failureReason?: string;
  reservedManifest?: { item: string; quantity: number };
  passenger?: { name: string; health: number; roomId: string; status: 'aboard' | 'delivered' | 'dead' };
  convoyId?: string;
  targetId?: string;
  targetDefeated?: boolean;
  salvageRecovered?: number;
  recorderId?: string;
  inspections?: number;
  inspectionPending?: boolean;
  investigationIntercepted?: boolean;
  investigationRelay?: string;
}
export interface GameEvent { id: number; tick: number; kind: string; message: string }
export interface CommandRecord { tick: number; sequence: number; command: Command; queued: boolean }
export interface Travel { destination: string; system: boolean; remaining: number; total: number }
export interface GameState { version: 1; contentVersion: 1; seed: number; rng: number; tick: number; nextId: number; phase: 'expedition' | 'victory' | 'defeat' | 'abandoned'; difficulty: 'standard' | 'relaxed' | 'hard'; ships: Ship[]; crew: Crew[]; projectiles: Projectile[]; region: StarSystem[]; systemId: string; locationId: string; markets: Market[]; contracts: Contract[]; reputation: Record<string, number>; discoveries: string[]; soldData: string[]; coordinates: string[]; archive: boolean; guardian: boolean; code: boolean; beacon: boolean; encounter: 'none' | 'hostile' | 'surrender' | 'won' | 'derelict'; rewards: string[]; travel: Travel | null; action: { kind: 'scan' | 'probe' | 'investigate' | 'mine'; remaining: number } | null; customs: boolean; events: GameEvent[]; queue: Command[]; sequence: number; tutorial: number; wrecks?: Record<string, Ship>; threat?: { remaining: number; awaiting: boolean; source: string } | null; userPaused?: boolean; commandHistory?: CommandRecord[]; queueMeta?: { tick: number; sequence: number }[] }
export type Command =
  | { type: 'cease-fire'; weapon: string }
  | { type: 'crew'; crew: string; room: string; task: Task }
  | { type: 'door'; ship: string; door: string; lock?: boolean }
  | { type: 'power'; ship: string; system: SystemKind; delta: number }
  | { type: 'target'; weapon: string; room: string; auto: boolean }
  | { type: 'weapon-priority'; weapon: string; direction: -1 | 1 }
  | { type: 'travel'; destination: string; system: boolean; confirm?: boolean }
  | { type: 'action'; action: 'scan' | 'probe' | 'investigate' | 'mine' }
  | { type: 'trade'; commodity: string; quantity: number; buy: boolean }
  | { type: 'service'; service: 'fuel' | 'repair' | 'data' | 'intel' | 'rescue' | 'recruit'; module?: string }
  | { type: 'upgrade'; module: string }
  | { type: 'contract'; id: string; action: 'accept' | 'complete' | 'abandon' }
  | { type: 'board'; crew: string; confirm?: boolean }
  | { type: 'recall'; emergency: boolean }
  | { type: 'ew'; mode: 'jam' | 'disrupt' | 'interfere' | 'hack' | 'hijack' | 'intercept' }
  | { type: 'maneuver'; bearing: Bearing }
  | { type: 'customs'; choice: 'submit' | 'bribe' | 'conceal' | 'spoof' | 'flee' | 'fight' }
  | { type: 'objective'; choice: 'chart' | 'negotiate' | 'spoof' | 'recover' | 'handin' | 'withdraw' }
  | { type: 'surrender'; accept: boolean }
  | { type: 'threat'; choice: 'evade' | 'prepare' | 'pay' }
  | { type: 'abandon'; confirm: boolean };
export type Result = { ok: true } | { ok: false; message: string };
