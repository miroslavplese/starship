# Component and interface design

Companion to `architecture.md`; executable TypeScript may refine these shapes
without weakening their invariants. All IDs are stable serializable strings;
all times below are simulation ticks unless stated otherwise.

## 1. Core contracts

```ts
type EntityId = string;
type SystemKind = 'reactor' | 'cockpit' | 'engines' | 'shields' | 'weapons'
  | 'oxygen' | 'medbay' | 'sensors' | 'doors' | 'ew' | 'drones' | 'teleporter';
type RunPhase = 'expedition' | 'victory' | 'defeat' | 'abandoned';
type PauseReason = 'user' | 'modal' | 'hidden' | 'loaded' | 'tutorial';
type Result<T> = { ok: true; value: T }
  | { ok: false; code: string; message: string };
interface QueuedCommand {
  sequence: number;
  tick: number;
  actorShipId: EntityId;
  command: Command;
}
interface GameEvent {
  id: EntityId;
  tick: number;
  kind: string;
  sourceId?: EntityId;
  targetId?: EntityId;
  message: string;
}
```

`Command` is a discriminated union, never an arbitrary string plus untyped
payload. Families: crew move/task/return/board; door toggle/lock; allocate power;
weapon target/fire/autofire; scan/probe/investigate; travel/jump/flee; dock;
buy/sell/repair/refuel/upgrade/recruit; accept/abandon/complete contract;
customs response; mining; salvage/extract; objective interaction.

Pause, save, UI navigation and selection are controller actions, not autonomous
ship actions. Player commands carry player authority; AI commands carry their
own ship authority. A ship cannot order another ship's crew or spend its cargo.
Debug commands are a separate test adapter, excluded from production.

## 2. Simulation services

| Component | Owns | Contract and rejection cases |
|---|---|---|
| RNG | uint32 state | `next(state)` produces reproducible state/value; seed zero normalized once |
| Clock | accumulator and pause policy | `advance(elapsedMs)` emits bounded ticks; pause clears elapsed backlog |
| Command gateway | queue and sequence | validate ownership, phase, resources, target and preconditions atomically |
| Tick pipeline | deterministic system order | `step(state, commands)` returns state/events without wall-clock access |
| Room graph | tile and door topology | deterministic path or explicit unreachable result; cross-ship via docking edge only |
| Power | reactor and allocations | integer conservation; capacity/health/ion limits; visible forced deallocation |
| Navigation/FTL | ship `ftl.chargeTicks`, `requiredTicks`, `destinationId` | engines-owned substate, not separate power consumer; see gameplay rules |
| Crew | movement, orders, health | one physical location; occupied tile policy; no work from another room |
| Atmosphere | air and pressure | double-buffer conserved flow except sources/sinks; bounded quantities |
| Emergency | fire, breach, temperature | oxygen-dependent fire, spread, damage, repair progress and interruption |
| Weapons | charge, target, ammo | powered readiness; projectile travel; stale/dead target rejection |
| Damage | shields, armor, hull, systems | seeded hit resolution; directional section; terminal state once |
| AI | decision timers, doctrine | same command gateway; legal information; bounded action frequency |
| Region | routes, locations, risk | connected graph; reachable objective and recovery services |
| Discovery | contacts and surveys | knowledge separate from reality; finite rewards, sensor constraints |
| Economy | stock, prices and events | no negative resources; spread; no duplicate discovery sale |
| Contracts | requirements and outcomes | unique reward, reserved goods, explicit failure/abandon states |
| Encounter | phases and rewards | no attack/reward after completion; return-to-strategy lifecycle |
| Boarding | away teams and ownership | physical transit, air risk, combat, extraction, capture once |

Store authoritative values in one place. For example, cargo units live in the
ship hold, not simultaneously in a separate market UI cart. UI selectors compute
totals. Use immutable snapshots or disciplined single-writer updates; do not
deep-clone the entire universe every render.

## 3. Content schemas

Ships: ID, label, art silhouette, hull/armor, reactor, starting fuel/cargo,
rooms with tile rectangles/volumes, doors with endpoints, system placements,
weapons and crew spawn tiles. Validate overlap, bounds, connected walkability,
unique IDs, references and required life-support/navigation systems.

Weapons: family, power, charge ticks, projectile speed/count, accuracy, hull/
system/crew/ion damage, shield interaction, beam geometry, ammo, breach/fire
chance. Every advertised family must have a playable implementation before
claiming GDD coverage; otherwise list it as unmet in release status.

Crew: species, movement speed, max health, skills, traits, station bonuses,
oxygen tolerance and portrait palette. Traits must influence a real calculation.

Locations/encounters: weighted risk/faction/economy constraints, reveal levels,
interaction options, prerequisites, costs, outcomes and one-time flags.
Use authored templates plus procedural parameters, not unrestricted text scripts.

Commodities: unit volume/mass, base value, legality by jurisdiction, producer/
consumer economy tags. Factions: colors, doctrine, restrictions, access thresholds.
Missions: category, origin/destination, requirements, cargo reservations, rewards,
deadlines and success/failure/abandon conditions. Validate all content at boot
and in tests; show a meaningful boot error on invalid data.

## 4. Application controller

`GameController` owns the current state, command queue, snapshots, subscriptions,
clock lifecycle and persistence calls. It exposes:

```ts
interface GameApi {
  dispatch(command: Command): Result<{ sequence: number }>;
  setUserPaused(paused: boolean): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): Readonly<GameState>;
  save(): Result<void>;
  load(): Result<void>;
}
```

### Implemented bindings

The executable contracts in `src/sim/types.ts` and `game/controller.ts` refine
the conceptual interfaces above without adding another authoritative store:

- `Ship.ftl` is the integer 0–600 engine-owned charge; a separate
  `GameState.travel` holds `{ destination, system, remaining, total }`.
  The executable destination key is `destination`, not `destinationId`.
- Paused commands live in `queue: Command[]`, with matching `queueMeta`
  tick/sequence entries. Accepted/executed records are retained in a bounded
  recent `commandHistory`; it is not an unlimited full-run replay archive.
- `dispatch` returns the discriminated `Result` without a generic payload;
  sequence lives on the run. `snapshot()` returns a stable revision number
  for `useSyncExternalStore`; the simulation is disciplined single-writer.
- `userPaused` is persistent. Forced load/focus/contact pause and modal pause
  belong to the controller and cannot erase the saved user-pause preference.
- Drones and boarding tether are installed module flags using the shared ship
  rules, not extra independent reactor consumers in `SystemKind`.
- Weapon priority and cease-fire are explicit commands. Priority changes the
  actual allocation order; cease-fire clears target/auto without firing.
- Mission manifests, passenger condition, unique target/convoy identities,
  recorder/clue state and inspection evidence are typed contract fields.
  Active claims are available at field destinations, not only stations.
- A forced-retreat marker is distinct from destruction/surrender rewards.
  Guardian retreat can secure passage without pretending a kill or paying
  destruction salvage. `doctrine: 'withdrawn'` retains only an inactive
  stranded-crew location snapshot, never a boardable or searchable derelict.

No module-global game singleton in tests. Dispose animation callbacks,
subscriptions, AudioContext and Pixi resources when restarting or unmounting.
Selectors expose derived HUD values, room hitboxes, visible contacts, legal
destinations and command availability/reasons. Snapshot identity is stable
between simulation updates so React subscription semantics do not loop.

Input keeps selection and target modes separate: selecting a crew member does
not select a weapon; Escape cancels targeting before closing a dialog. Commands
issued while paused display queued indicators and execute on resume. Pointer
coordinates account for canvas bounding rectangle, scale and device pixel ratio.

## 5. Rendering composition

| Layer / component | Responsibility |
|---|---|
| Background | seeded stars, nebula, planet and distant asteroids; reduced-motion option |
| Hull layer | original detailed silhouette, plates, orange markings and engine glow |
| Interior layer | room floors, walls, system icons, doors and atmosphere overlays |
| Crew layer | original small sprites, health, selection and movement |
| Combat effects | shield bubble, timed projectiles, impacts, fire and breach markers |
| Player HUD | segmented hull/shields, fuel, missiles, scrap/credits |
| Reactor output | read-only segmented total/allocated/spare/damaged capacity; allocations use system plus/minus controls |
| FTL control | charging, ready, destination requirement and disabled reason |
| Crew roster | name, health, current task, selection and danger |
| Systems panel | reactor available/used, per-system health, allocation controls |
| Weapons panel | priority, power cost, charge, ammo, target, auto-fire status |
| Enemy panel | known hull/shields/identity, targetable rooms and surrender/escape |
| Strategic screens | regional/system map, contact intelligence, objective and travel preview |
| Station screens | market, shipyard, crew, mission board and journal |
| Feedback layer | concise event log, tooltips, toast errors and critical alerts |
| Pause/settings | pause reasons, audio, reduced motion, save/export/import and controls |

Shared `.frame` surfaces retain 10px cut corners with matching diagonal
background strokes, including scrollable briefing/debrief panels. The
`--frame-edge` and `--frame-surface` properties keep alert, selection, hover
and custom surface colors consistent; rectangular `.dialog` frames are
excluded. `frames.spec.ts` checks rendered edge pixels, not just CSS presence.

Reference HUD legend: the illustrated left canister/lock-like icon means fuel
(`ship.fuel`, example 7); the middle projectile/tool-like icon means missile
ammunition (`ship.missiles`, example 4); the gear means scrap/credits
(`ship.credits`, example 63). Use clearer original icons with text tooltips,
not literal ambiguous glyphs. Credits and scrap are one currency in this release;
recoverable components are separate cargo. Enemy triangle means hostile threat,
not a second unexplained resource. Roster and interior living crew must agree.

React controls remain outside canvas where possible for focus, labels and
testing. Provide an accessible room/action list equivalent to spatial click
commands. Color is supplementary: damage, oxygen and charge also use text,
icons, patterns or numeric values. Drones without installed equipment show
"No drone module" rather than a clickable dead end.

## 6. HUD interaction details

Left click selects crew, room, weapon or contact. Right click issues a move/task
to the hovered room for selected crew; offer a visible equivalent action so
right click is not required. Selecting a ready weapon enters targeting; clicking
an enemy room commits the target. Auto-fire is an explicit switch, not an
invisible consequence of selecting a gun.

Space toggles user pause except while typing in an input. Escape cancels a
target/modal. Number keys select crew or weapon mode with unambiguous documented
bindings (for example 1-3 crew, Q/E weapons); M map, J jump menu, F save only if
the key map and tooltip agree. Do not intercept browser shortcuts.

System rows offer visible plus/minus controls and power/health caps. Tooltips
explain shortages ("Reactor 0 spare", "Damaged: repair required", "Ion locked").
Damage is not represented merely by reducing a bar: disabled charge/manning/
oxygen consequences must be reflected in the scene and available actions.

## 7. Persistence and audio adapters

Save adapter stores envelope + previous slot; write, read back and validate
before reporting success. On write failure retain the previous slot and expose
export. Import uses a maximum size and validates every entity/reference before
swapping state. Terminal saves load to their result screen, never a live dead
ship. New-run confirmation protects an existing save.

Cargo and fitted-module IDs must resolve to authored content. The sole dynamic
cargo ID is a unique flight recorder: its referenced location must be an actual
derelict and its quantity must be one. Mission recovery and persistence share
the same recorder-ID constructor; a matching prefix alone is not validation.

After previous-slot recovery, saving quarantines the corrupt primary before
replacing it and leaves the known-good previous slot intact. One diagnostic slot
retains at most 1 MiB and never overwrites different corrupt bytes. Diagnostics
export includes raw primary, previous and quarantined bytes. Explicitly
confirmed discard removes only an invalid primary and the diagnostic slot,
never a valid primary or the previous slot; storage/read-back failures are
reported rather than treated as success.

Audio adapter consumes events, never causes simulation effects. It starts only
after a user gesture and supports master/effects volume and mute. Synthesized
original cues can cover charge, shot, hit, breach, oxygen, jump and discovery.
Rate-limit repeated alarms and prioritize critical alerts. Do not rely on audio
alone for information.

## 8. Error and testing seams

Expected command rejections become actionable HUD messages. Unexpected errors
propagate to a recovery boundary; no empty catches. Save/load diagnostics include
schema and seed, never email/account data. Tests instantiate simulation fixtures
and drive public commands. E2E tests interact with production controls; scenarios
may import validated fixture saves but do not use hidden production cheat APIs.

Each subsystem must have at least one failure-path test in addition to its happy
path. For every new UI action, demonstrate a real state transition or remove/
disable it with a reason. No placeholder "coming soon" action counts as delivery.
