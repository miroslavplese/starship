# STARSHIP technical architecture v0.1

Status: accepted for implementation by all four review roles. Authority: `STARSHIP_GDD.md` v0.3 and
`reference/combat-mockup.png`. The GDD wins on behavior; the mockup wins on combat
composition. Review decisions are recorded in `review-decisions.md`.

The concrete rules in `gameplay-rules.md` and acceptance definitions in
`validation.md` resolve the review findings and are normative companions.
Mockup composition does not override mechanical requirements: add accessible
controls where the illustration omits them rather than remove mechanics.

## 1. Product and release boundary

Deliver a desktop-browser, single-player, offline-capable Expedition game, not
just a combat screenshot or infinite arena. A run must connect navigation,
discovery, markets, missions, repairs/upgrades, combat and a final objective.
Captain Mode, multiplayer, manual flight, surface exploration and cloud accounts
remain excluded by the GDD. One authored player ship is sufficient; 6-10 player
classes are a mature-content target, not a condition for the first release.

The GDD's advanced systems remain visible in the traceability matrix. They must
not be silently called complete because a button or stub exists. A shipping build
must clearly disclose any unmet requirement and cannot be called fully aligned
until its release-gate evidence exists.

### Expedition arc

The player captains the survey corvette *Wayfarer*, with Mara (pilot), Ivo
(engineer) and Kade (gunner/scientist). A remote expedition authority pays for
survey intelligence and recovered navigation archives. Recover three archive
coordinates from different frontier systems, open the unknown-region route,
survive or bypass its guardian, investigate the final beacon and return the
archive to a friendly station. Explicit victory, defeat and abandon-run screens
summarize discoveries, wealth, crew and decisions.

The objective supports explorer, trader and combat-oriented preparation. Do not
make every archive require killing a ship. No hidden turn deadline or mandatory
combat timer. Regional danger and resource distance provide pressure instead.
90-180 minutes is the GDD's target for a normal run; it requires measured human
play sessions and is not inferred from a simulation completion test.

## 2. Technology and dependency direction

Use TypeScript (strict), Vite, React for accessible HUD/application screens,
PixiJS for the tactical ship scene, Vitest for headless simulation tests, and
Playwright for real-browser acceptance. Pin dependencies with a committed lock
file. No backend, account, analytics, external asset CDN or network requirement
during play. Production output is static assets.

```text
content definitions -> content validation -> simulation state
commands -> validation -> fixed-step simulation -> events + snapshots
                                                |          |
                                                v          v
                                          audio/effects   selectors
                                                             |
                                                      React + PixiJS
input -> intent adapter -> command queue ---------------------^
save adapter <-> validated versioned state
```

The simulation imports neither browser APIs, React nor PixiJS. Content imports
types, never runtime renderers. Renderers cannot mutate game state. Persistence
serializes simulation state, not React component state or Pixi display objects.
Avoid a generic ECS framework: typed records and explicit system functions are
sufficient for a few ships and dozens of crew.

## 3. Repository layout

```text
src/
  sim/       types, rng, clock, commands, reducer, systems, queries
  content/   ships, weapons, crew, encounters, economies, missions, factions
  game/      controller, input, selectors, persistence, audio
  render/    Pixi scene, ship/room/crew/effect layers, art generators
  ui/        HUD, dialogs, map, markets, missions, settings, onboarding
  styles/    tokens, shell, panels, responsive styles
public/
  art/       original graphics and asset manifest
docs/        reviewed design and release evidence
tests/
  sim/       deterministic subsystem and integration tests
  e2e/       browser gameplay, persistence and visual acceptance
```

File boundaries can be combined when small, but dependency direction is
mandatory. Test-only helpers must not expose cheat controls in production.

## 4. Simulation and time

Simulation is an authoritative serializable `GameState`, advanced in 50 ms
ticks (20 Hz). `requestAnimationFrame` draws independently and interpolates
positions between previous/current snapshots. A monotonic accumulator runs at
most five catch-up ticks per animation frame; excess elapsed wall time is
discarded with a visible performance warning rather than a death spiral.

On tab hide/window blur: pause, clear accumulator, and explain why on resume.
No offline catch-up. Loading always opens paused. A user pause freezes all
simulation timers, damage, movement and random draws, but permits tactical
orders to queue. Commerce and modal strategic decisions use an explicit
interaction pause so enemies cannot attack behind an opaque dialog. Closing a
dialog restores the prior pause state; it must not override a manual pause.
Travel is a simulation action with an interruptible duration, not a UI timeout.

Use a documented uint32 PRNG (for example xorshift32 with a nonzero seed) and
store its current state. All probabilistic systems consume it in stable entity
ID order; never use `Math.random`, `Date.now` or object iteration as implicit
simulation inputs. Generate IDs from state counters. Persist tick count, PRNG,
AI timers, weapon timers, projectiles, orders and pending commands. A replay is
initial seed plus commands ordered by `(tick, sequence)` and content version.

## 5. State boundaries and identity

`GameState` contains schema/content versions, run seed/PRNG, tick, ID counter,
run phase, pause reasons, player ship ID, ships/crew/projectiles, regional graph,
visited information, economy state, contracts, reputation, cargo, discoveries,
objective state and event history. References are stable string IDs, not
duplicated mutable objects. Presentation selection, hover, open tabs and camera
are separate UI state.

A ship owns hull, four directional armor values, reactor budget, fuel, cargo
hold, systems, rooms, doors, weapons and installed modules. Rooms have tile
bounds, volume, air mass/pressure, temperature, fire, breach area and system IDs.
Crew have location `(ship, room, tile, movement progress)`, health, species,
skills, traits, order and task progress. Same representation is used for the
enemy and derelicts. Layouts are authored content; logic never checks a
particular room name or screen coordinate.

All commands return a typed success or rejection with a reason visible to the
player. Invalid commands do not charge resources, consume RNG or partially
mutate state. Preflight cross-entity requirements before applying effects.

## 6. Tactical systems and ordering

Each tick: process validated commands; update AI decisions; validate power and
ion locks; move crew/resolve doors; charge weapons/launch; move projectiles and
resolve hits; exchange atmosphere simultaneously; update fire/breaches and
damage; perform crew tasks/healing; regenerate shields/FTL; resolve encounter
terminal state once; advance strategic actions/economy/contracts; emit events.
Document any implementation change to this ordering and add a regression test.

Power is an integer allocation bounded by reactor output, installed capacity,
system health and ion locks. Losing a system removes excess allocations
deterministically and emits a warning. Weapon allocations power installed guns
in explicit priority order, visible in the weapon panel. Unpowered guns do not
fire or silently charge. Crew manning bonuses require a living crew member
physically present at an operable station.

Doors are graph edges with tile access, health, lock and open/closed state.
Routing uses deterministic BFS over traversable tiles/doors. A move order may
open an unlocked door, but not a locked or destroyed impassable edge. Recompute
on topology changes; if no path exists, show "No safe route" and retain state.
Repairs and firefighting require physical presence; tasks can be interrupted.

Atmosphere uses a double buffer. Calculate bounded air transfers from the
previous room pressures, cap total outgoing mass per room to available air,
then apply all transfers. Vacuum is a sink, not a room that can gain pressure.
Oxygen replenishment requires functional powered life support. Fire consumes
oxygen, heats/damages rooms and nearby entities, and spreads using seeded
probabilities. Suffocation starts below a documented threshold. Expose both
pressure and oxygen risk, including color-independent warnings. No negative
air, pressure over defined bounds, or fire continuing without oxygen.

Weapons are state machines: unpowered -> charging -> ready -> firing ->
charging; ion locks temporarily prevent operation. Targeting selects an enemy
room; auto-fire is explicit and cancellable. Projectiles have travel time.
Lasers/kinetics interact with shields, ions drain/lock systems, missiles consume
ammunition and bypass shields, beams trace room intersections, experimental
effects use data-driven modifiers. Accuracy/evasion are bounded; hull, armor,
system, crew and secondary effects resolve in a documented order. A dead ship
cannot launch, attack, pay out twice or remain a target.

Enemy AI uses the same commands and resource constraints as the player. A
bounded periodic decision evaluates fire/breach rescue, repairs, power,
threatening systems, manning, boarding, retreat and surrender. Pirate and
military doctrines have different target priorities. AI cannot see information
not available to its sensors. AI access to hidden information is testable.

## 7. Strategic model

Generate a connected, seeded region from authored system templates. Each node
has risk band, faction, economy and discoverable routes. Reachability validation
ensures the starting station, three archives, final beacon and extraction are
accessible, with refueling options and an emergency recovery path.

Locations distinguish actual state from player-known contacts. Passive
detection, powered scan, probe and investigation advance identification
progress. Survey data is a finite discovery, not an endlessly repeatable credit
button. The first sandbox includes one star, three planets, an asteroid belt,
two stations, three unknown signals, a derelict, a pirate, a trade route, ten
commodities, an exploration contract and a freight contract.

Prices derive from base value, economy production/consumption, bounded stock
scarcity, population/tech, reputation and seeded regional events. Buy/sell
spreads and stock depletion prevent same-station arbitrage. Every transaction
atomically checks credits, stock, cargo volume and legality. Seen prices include
the observation tick and remain stale until revisited or updated intelligence
is bought. The UI shows last-known versus live data distinctly.

Fuel costs and evasion penalties include bounded cargo mass effects. Before
travel, show cost, route risk, estimated reserves and known service options.
Zero fuel is recoverable through a costly distress tow where permitted;
deep-space isolation requires a warning and explicit confirmation. No accidental
soft lock from spending the last credit or accepting a contract.

Contracts have typed requirements, reserved cargo when appropriate, deadline
policy, reward, abandonment cost and terminal state. Categories in the GDD are
data-backed scenarios, not only labels in a menu. Reputation affects access and
trade. Customs encounters provide submit, bribe, conceal/spoof, flee and fight
branches with visible stakes. Scans and EW affect probabilities; outcomes are
seeded and cannot be rerolled by save/load.

Derelict boarding creates an away team in the same room graph simulation;
oxygen, doors, repair, survivor threats and extraction remain spatial. No
instant salvage lottery replaces crew exploration. Boarding hostile ships adds
crew combat, sabotage, retreat and capture; capture resolves once and stranded
crew remain represented. Mining needs discovered deposits and consumes time.

## 8. Presentation and assets

The mockup is a visual composition reference, not a third-party asset source.
Create original hulls, crew sprites, icons, starfield, planet, UI frames and
effects. Prefer authored SVG/procedural Pixi assets for consistent scale,
palette and legibility; generated raster art may provide background texture.
Keep an asset manifest with origin, dimensions and usage. Never import game
art from existing commercial games. Gameplay geometry is always generated from
the authoritative room definitions, not baked into a background.

At 1664x936 reference size: top-left player hull/shields/resources; top-center
FTL and settings; left crew roster; large player cutaway at left/center; smaller
enemy inside a red angular region at right; bottom reactor/system allocation,
weapons, drone status and prominent pause. Stars, nebula and a lower-right planet
frame the ships. Cool cyan player borders, warm orange hull markings, red enemy
threats, green health/power, blue shields and amber alerts. Readable condensed
display typography; no emoji substituted for the primary icon set.

React renders text, buttons, dialogs, roster and tooltips. Pixi draws ships,
rooms, doors, crew, shields, projectiles and environmental effects. Pointer
hit-testing converts scene coordinates to entity IDs and sends intents through
the same input adapter used by keyboard controls. Support 1280x720 to 2560x1440;
at lower heights, scroll/compact panels rather than overlap important controls.
Provide reduced motion, volume/mute, keyboard equivalents and text warnings.

## 9. Persistence, diagnostics and failure policy

Versioned JSON saves in localStorage (small bounded state), with explicit
export/import and a previous-known-good slot. Envelope includes schema version,
content version and payload checksum for accidental corruption detection, not
security. Validate nested fields, finite ranges, enums and ID references before
replacing live state. Reject unknown future schema versions visibly. Migrations
are explicit and tested; initial release has no legacy migration obligation.
Import size is bounded. Parse errors and quota failures display actionable
messages and retain the current game. Never silently replace a failed load
with a new run. Autosave after safe transitions and every bounded interval;
explicit save works in paused combat.

Keep bounded event history and optional development diagnostics: frame time,
tick count, seed, draw calls, entity counts and last command rejection. Export
bug context without personal data. No secrets or mail credentials in the repo.
Uncaught errors show a recovery screen with reload/export options.

## 10. Verification and release policy

Architecture gates: deterministic replay; save continuation equivalence;
frame-rate independence; command atomicity; resource invariants; shared
player/enemy rules; seed reachability; and no UI dependency in `sim`.
Browser gates cover an actual new run, tutorial, combat orders while paused,
target selection, fire/repair, victory/rewards, travel, discovery, trade,
contract, derelict, save/reload and final victory/defeat.

Measure representative scenes on recorded hardware; target 60 FPS and a 50 ms
simulation budget without claiming universal performance. Visually inspect
screenshots against the mockup at reference and minimum sizes. A green build
alone is not evidence that the game is fun or visually aligned.

Each milestone is committed and fast-forward pushed to `origin/main`, after
fetching and verifying no unrelated remote changes are overwritten. Never force
push. Record exact commands/results and commit IDs. Do not publish a milestone
as finished while its acceptance gates are still failing.
