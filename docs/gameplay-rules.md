# Concrete gameplay rules and balance baseline

Normative v0.1. Numbers are initial tunable content, not measured balance results.
Changing them requires updating tests and this document; changing terminal,
progression or recovery rules requires reviewer reassessment.

## 1. Control, navigation and terminal states

Cockpit is a passive core system: no allocatable reactor draw. An operable
cockpit grants base piloting; a living physically present pilot adds skill
evasion. Engines provide zero evasion without a functional cockpit, and require
a functional cockpit for FTL. Weapon/crew orders remain available if the
cockpit is disabled, so repairing it is possible. Its room, health, manning and
effect are inspectable in the ship diagram and system-details panel; the five
primary allocation tiles preserve the mockup. Sensors and doors likewise have
details controls; neither disappears merely because the mockup omits a tile.

FTL is owned by engines: `ship.ftl = { chargeTicks, requiredTicks, destinationId }`.
Baseline readiness is 600 powered ticks (30 seconds). Functional engines with
at least one power, functional cockpit and a living aboard crew are required.
Damage/ion lock pauses charge; charge is retained, not rerolled. Jump consumes
one fuel plus the displayed route/cargo modifier, resets charge, and requires a
known legal destination. Fuel is spent only after all conditions validate.
Ordinary strategic jumps may charge at safe locations, never in wall time.

Hull <= 0 destroys a ship. Player defeat also occurs when all crew are dead.
A temporary lack of an able pilot, broken systems, low fuel or an empty wallet
is NOT immediate defeat. Unconscious crew remain living; no permanent coma is
implemented in the first release. If living crew are all stranded off ship,
offer boarding return/recovery or explicit abandonment, not an unexplained
soft lock. No random reactor-catastrophe defeat is included; if added, it must
be telegraphed with counterplay and a reviewed rule.

Hostile capture requires hull > 0, no living defending crew aboard and at least
one living player boarder in the enemy cockpit for 100 uninterrupted ticks.
Hull destruction cancels capture; capture/destruction/surrender are mutually
exclusive terminal encounter outcomes with one reward token. Captured ships are
salvaged for resources/modules in the initial one-player-ship release; no silent
fleet-management scope is implied.

Abandon is a confirmed controller command persisted as `phase: abandoned` and
logged with its simulation tick. It stops the run, shows a distinct debrief and
retains the ended save until explicit new-run overwrite. No continuing funds
carry into a new run. Victory, defeat and abandonment all report objective
stage, crew survival, discoveries, faction consequences and finances. Victory
requires final archive extraction and hand-in, not ordinary battle victory.

## 2. Recovery table and commitment rules

| Failure | Available recovery | Price/consequence |
|---|---|---|
| Zero fuel in core/frontier | distress tow to nearest neutral rescue station | 30 credits, or debt if unable to pay |
| Broken engines/cockpit/oxygen in serviced space | same tow, ends current hostile encounter as escape only if rescue allowed | 40 credits plus forfeited loose cargo up to 20 value |
| No money at rescue station | emergency fuel 2, hull to at least 8, minimum navigation/life-support repair | debt; not free ship restoration |
| All living crew on derelict | remote beacon/tether recall; ship holds station, cannot fight/jump unmanned | extraction cost below; no automatic defeat |
| Docking route blocked | engineer repair, or emergency tether extraction of living away team | 20 credits/debt, 10 health damage per extracted crew, collected salvage forfeited |
| Critical faction denies docking | neutral rescue station remains available | no faction services/rewards, neutral repair prices |
| Isolation in unknown space | one emergency expedition beacon per run | tow to frontier, all loose cargo lost, 75-credit debt, objective information retained |
| Rescue beacon spent in unserviced space | explicit final distress decision: abandon run or continue repair | terminal only on chosen abandon, hull loss or all crew death |

Debt is capped at 150; rescues exceeding that cap forfeit loose cargo/upgrades
above the baseline fitting, never unique objective information. A minimum
repair/refuel rescue remains possible in serviced space even at the debt cap.
Debt takes 25% of subsequent ordinary income until repaid; no interest and no
hidden death timer. Contract/objective information is never destroyed as
payment. Tow is unavailable during incoming fire until escape/surrender is
resolved; emergency unknown-space beacon sacrifices the encounter's loot.
Warnings explicitly distinguish rescue availability before entering each route.

Combined failures (no fuel, credits, operational engines and boarded crew) must
resolve through tether -> beacon/tow -> minimum repairs, with each cost shown
before acceptance. The player can refuse; indefinite waiting is never the only
displayed option. Rescue is a loss of wealth/time/build efficiency, not a way to
duplicate loot or refill upgrades for free.

Before boarding, show observed pressure, dock/tether condition, team, mothership
crew and equipment. An all-crew away team needs explicit confirmation.
Outside threats are signaled at least 200 ticks before arrival, auto-pause on
detection, and allow recall/tether action. A closed/locked route is not a
teleport exception: normal recall traverses the graph; emergency extraction is
an explicit costly event. A dead crew member cannot be extracted alive.

## 3. Damage, atmosphere and counterplay

Damage ordering: validate live target -> seeded accuracy/evasion -> absorb
shields (family-specific) -> directional armor -> hull/system/crew damage ->
secondary breach/fire -> terminal resolution. One projectile can resolve once.
Evasion is clamped 0-60%; accuracy 10-100%. Directional armor reduces incoming
hull damage by up to one point per intact section; minimum penetrating damage
is one. Systems still suffer their listed damage on a penetrating hit.

Attack bearing is a discrete approach sector (bow/stern/port/starboard), chosen
by an explicit maneuver order: balanced, face strongest armor, or flank target.
A maneuver takes 100 powered-engine ticks, costs one engine power commitment
during execution, and changes bearing only on completion. Enemy doctrine can
counter-maneuver. There is no joystick movement. Show current bearing/armor and
time to maneuver; damaged engines prevent a free facing change.

Baseline laser: one shield-layer absorption per projectile; ion: removes a
layer or locks target power for 80 ticks; missile: consumes one round and bypasses
shields; beam: no evasion roll, blocked by any active shield layer, crosses
rooms; kinetic: multi-projectile shield stripping; experimental: telegraphed
long-charge system/atmosphere disruption with a defined cooldown. Each has
visible power/charge/counterplay. Ion expiry restores capacity but not free
reactor allocations. No hidden permanent ion stun.

Pressure/oxygen normalized to 0-1; expose percent. Below 0.2 oxygen, crew lose
2 health/second; fire growth stops below 0.15 and extinguishes below 0.05.
Transfers cannot remove more air than a room contains. Powered oxygen restores
at most 0.02/second per connected serviced volume unit; open vacuum can exceed
production. Fire intensity is 0-1, bounded spread checks every 20 ticks; test
threshold boundaries. Repair time scales with damage/severity and crew repair
skill. Medbay heals 3 health/second only while powered/operable and occupied.

Encounter generation must not require consumable missiles as the only source
of damage. At least one installed non-consumable weapon/countermeasure can
defeat or disengage every mandatory threat. After 1,200 ticks without hull/
system progress, identify a stalemate and offer ceasefire/disengagement with
clear terms. Normal FTL escape remains available subject to its rules.
The finale always permits a feasible noncombat option described below.

## 4. Fitting and profession routes

Baseline hull has six module slots; cargo expansions, auxiliary fuel, advanced
sensors, EW, drones, teleporters and extra weapons compete for them. Reactor
upgrades cap at 12 output; system power caps remain meaningful. Baseline cargo
20 volume; each cargo module adds 10, each fuel module adds 4 capacity.
Total cargo mass adds at most one fuel per jump and reduces evasion at most
10 percentage points, previewed before travel. No unbounded stackable upgrade.

Explorer preparation: advanced sensors/probes reveal archives through surveys
and anomalies. Trader preparation: buy charts/negotiation access with finite
high-value contracts; no forced grind to afford every slot. Combat preparation:
weapons/armor recover hostile-held archives. Each coordinate has at least two
solutions, and the set of three includes survey, barter/contract and salvage/
combat choices. Distinct builds must complete the objective with different
risks, not merely identical fights financed differently.

Mandatory coordinates become persistent journal flags once learned, separate
from saleable survey data/cargo. Selling data cannot erase progression.
Lead contracts can fail without deleting the lead; a neutral station sells a
replacement clue for 20 credits or one survey. Faction denial cannot block all
archive paths or extraction: a neutral hand-in station and at least two access
routes remain valid. Mandatory keys cannot be sold, lost in rescue or consumed
by unrelated contracts.

The final route needs three coordinates, two fuel after the displayed travel
cost, and a visible preparation confirmation. Guardian solutions: combat;
EW spoof with installed module and previously obtained code; or guaranteed
negotiated passage for 80 credits OR two archive survey records. Survey records
used here are copies of objective knowledge and do not erase coordinates.
The arrival encounter offers beacon withdrawal if preparation is inadequate.
Validate dependency feasibility and finite alternatives across generated seeds,
not just graph connectedness.

## 5. Provisional pacing/economy model

| Run segment | Target human engaged time | Initial content budget |
|---|---|---|
| Onboarding and initial preparation | 10-20 min | safe station, first battle, survey/freight introduction |
| Three archive branches | 20-35 min each | 2-4 decisions plus 0-2 avoidable fights per branch |
| Final route/guardian/beacon | 10-20 min | preparation check and chosen approach |
| Extraction/debrief | 5-15 min | 1-3 route decisions, skip already resolved safe interactions |

Targets total 85-160 minutes before optional diversions; tune toward the GDD's
90-180 through actual engaged human sessions, not artificial waits. Sandbox
target 20-30 minutes covers one survey, one delivery, one trade and a derelict.
Travel has fast-forward in safe resolved space, stopped by threats; no repeated
modal at an exhausted discovery.

Starting credits 60, fuel 7, missiles 4, hull 30. Survey rewards 15-35, freight
20-40, dangerous contracts 40-80, combat salvage 15-40; refuel 4/unit, hull
repair 2/point, modules 40-100. Prices have a minimum 15% buy/sell spread;
production updates at a strategic 200-tick cadence and caps stock. A circuit's
profit competes with travel/service costs; finite contracts/discoveries should
fund an archive branch more efficiently than repeating a solved safe circuit.
Require exploit tests for buy/sell, revisit, save/load, contract cancellation
and rescue; change values if those loops dominate normal play.

Standard difficulty is the baseline. Optional relaxed mode reduces enemy
decision frequency by 25% and service costs by 20%; hard increases encounter
risk and reduces spare resources by 20%, not enemy hull inflation. Difficulty
never changes core command legality or objective reachability.

Input seed is editable decimal uint32, displayed/copied in journal and debrief.
Invalid seed has a visible validation message. Failed/abandoned freight removes
reserved freight units atomically; compensation is stated at acceptance.
Strategic systems check their cadence rather than recomputing markets at 20 Hz.

## 6. Teaching and information

Contextual optional introductions cover (1) pause/orders/power/targeting,
(2) fire versus breach repair, vent -> close -> refill -> heal -> restore power,
(3) travel reserves, stock/spread and reserved freight, (4) away-team atmosphere,
recall and tether. Each includes a reversible safe demonstration, cancel/skip,
and a player action checked by state rather than a click-through instruction.
Show planned movement, task cancellation, queued commands, target and bearing.
Never punish the player while a teaching modal obscures a threat.

## 7. Persistence bounds and comparison

Initial release caps: 12 regional systems, 16 locations/system, 12 active
contracts, 32 crew, 4 simultaneous ships, 256 projectiles, 200 journal events,
one latest observed price per commodity/station, 100 recent command diagnostics.
Persistent discoveries/objective flags are NOT pruned with event history.
Use bounded content arrays, not lifetime event-sourcing for game reconstruction.
Maximum encoded save/import is 1 MiB; maximum event message 512 characters.
Reject excess size visibly, retain current/previous bytes and offer export.
Never silently truncate authoritative entities to fit a save.

Replay equivalence is scoped to the same content/build and JS engine.
Simulation uses fixed integer ticks and preferably integer/fixed-point
quantities; transcendental rendering math must not affect authoritative results.
Canonical comparison includes every simulation field except presentation
selection, diagnostic wall times and controller-added `loaded`/`hidden` pause
reasons. Compare paused saved state before adding load reason, then remove
that reason by explicit resume in both continuations. Persist user pause,
command sequence/queue and event/reward IDs. AI receives a filtered observable
view, with tests hiding enemy interior/cargo and asserting identical decisions
when inaccessible information differs.
