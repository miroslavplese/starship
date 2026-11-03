# Player and system flow design

Concrete preconditions, costs, terminal rules and recovery alternatives are in
`gameplay-rules.md`; observable test assertions are in `validation.md`. These
resolve all references below to rescue/capture rules, thresholds and pacing.

## 1. Start, learn, continue

Boot -> validate content -> illustrated main menu (New Game / Load Game /
Settings / About). Settings and recovery work before a run starts; live Save and
Export appear only after a real run is started/imported. Stored saves can be
downloaded from their own cards without starting a game. About credits
Miroslav Plese and shows automatically generated version/build and UTC build
time, without a gameplay pause notice. New Game opens mission selection, seed
and difficulty. Ordinary Settings offers player presentation choices, not
developer diagnostics; those require the explicit build-time feature flag.

The full Cartographer campaign is unchanged. Survey, flight-recorder recovery
and convoy escort start with the corresponding actual Haven contract accepted,
including its existing 15-simulation-minute deadline and objective mechanics.
Generated exploration chooses one of those commissions from the displayed
uint32 seed; Generate uses browser randomness outside the simulation to choose
a new displayed seed. All options leave the full campaign available. Contract
state already persists and validates, so no additional save fields are needed.

Browsing New Game, Settings or Load Game never writes a save. Begin first keeps
current live progress, then creates a verified separate expedition, including
when the seed matches another game. A failed write leaves the live game in place.
Load Game lists readable expeditions with one Load action per card, real mission/
location/progress and honest saved times. Imports create separate saved games
before replacing the live state. Load always starts paused. Save belongs in
Settings or the F shortcut; there is no disabled Save or ambiguous Continue/
Restore pair on Load Game.

Backups and damaged-save recovery is a separate, explanatory section, shown
only when backups or damaged data exist. Empty Load has no gameplay pause
implementation notice; its single ordinary importer also accepts recovery
backup files. Selecting
an earlier checkpoint keeps unsaved live progress and loads the originally
selected snapshot into a new expedition. Legacy current/previous/quarantined
bytes stay untouched while verified, idempotent copies migrate on a load/write.
Legacy times were not recorded and are not invented. Damaged copies remain
downloadable in a full recovery backup; there is no destructive delete action.
Recovery imports add readable copies, report partial failures/unreadable data,
and retain verified copies on a failed write. Keep the original backup file.
Older snapshots already overwritten by the old single rolling slot cannot be
recreated; other browsers/devices/origins may contain independent data.

Screen changes fade out for 160ms, swap while covered, then fade in for 160ms.
Input and tactical ticking are blocked across both phases. Focus moves into the
new dialog and Tab stays within it; closing returns to command controls. Reduced
motion removes the animation and delay. Tactical shortcuts do not start a run
or execute commands behind a menu.

First encounter begins paused. A short staged introduction teaches selection,
crew move, power allocation, weapon targeting, pause and map without freezing
the whole UI behind a long text wall. Tutorial completion is local preference;
it never grants resources or changes combat randomness. Controls are always
available from settings. Objective and next useful action remain visible.

## 2. Combat loop

Detect enemy -> identify contact -> encounter setup -> tactical view paused ->
inspect enemy and allocate power -> select crew/orders -> select weapon/target
room -> resume -> deterministic ticks -> visible threat/impact -> pause and
react -> disable/destroy/surrender/flee -> single encounter resolution -> loot/
consequences -> strategic travel.

The player can queue orders while paused and see them. Weapon charging requires
power, targets must exist, missiles require ammunition, and enemy shots are
telegraphed. The scene displays selected room, selected crew, target reticle,
projectiles, shield hits and damage. When a system breaks, its actual behavior
stops. The player can divert power, move a repair crew and recover it.

Victories award loot once after destruction/capture/surrender acceptance,
never once per render or page reload. Surrender offers concrete terms, with a
visible accept/reject decision. Flee requires charged FTL, working navigation,
fuel and a legal route; a disabled jump control explains exactly what is missing.
Defeat occurs when the player hull reaches zero or living crew cannot command
the ship according to the defined rescue rules. Freeze combat and show a
debrief/restart; do not leave a dead ship firing indefinitely.

## 3. Damage-control story

Projectile enters -> shields/armor interact -> room system damaged -> fire and/
or breach roll -> warning and room overlay -> select engineer -> traverse doors
-> repair breach/extinguish/repair system -> heal crew -> restore power.

Open an exterior door to vent, but warn if crew are present or a connected room
will depressurize. Closing a door stops that edge's flow; it does not instantly
refill the compartment. Crew moving into low pressure take real damage. Repair
progress pauses if the crew moves, dies or changes task. Medbay healing requires
power, health and crew presence. Every danger has an observable cause and a
player-controllable mitigation, not a random unavoidable death.

## 4. Navigation and discovery

Open region map -> choose known route -> preview fuel/danger/services ->
confirm jump -> travel time and possible interruption -> arrive at system ->
passive contacts -> scan/probe -> identify location -> choose investigation.

The top icon toolbar (left of Settings) opens navigation, dock/operations,
journal and field manual. Navigation has an interstellar route diagram and an
orbital system schematic. Both use only actual known systems/contacts. Map
nodes select/highlight the corresponding course card; its existing command
checks, jump confirmation, fuel costs and travel consequences remain authoritative.
Orbits/positions are illustrative, not claims about physical orbital mechanics.

Map connections show known versus undiscovered routes; do not reveal hidden
content merely because its object exists. In-system travel consumes time and
can trigger authored encounters according to risk. Sensor damage/power affects
identification, not just a decorative stat. Surveying produces saleable data
once per discovery; the journal records location, observation time and value.

Deep-space travel warns about lack of services and reserves. Distress recovery
has explicit costs and consequences; if it is unavailable in unknown space,
the travel confirmation explains the risk before committing. Pausing during
travel is legal and does not complete it for free.

## 5. Station, commerce and upgrades

Arrive -> request dock -> faction/legality checks -> station menu -> market/
services/contracts -> confirm transaction -> atomic command -> resource/UI
update -> autosave -> undock.

Market shows commodity name, live or observed price, stock, player units, legality,
unit volume, available credits and cargo usage. Quantity is clamped only in the
editor; the authoritative command rejects invalid values instead of changing
the requested trade. Buy/sell/repeat is bounded by stock and spread.

Refuel/repair/upgrade previews price and resulting stats. Repairs restore hull/
systems deliberately, not as an undocumented free docking effect. Upgrades
have finite levels and actual tactical/strategic effects. Cargo and reactor
upgrades compete with weapons, sensors, EW and fuel preparation.

## 6. Contracts and faction consequences

Board -> read requirement/deadline/space/reward -> accept -> reserve or load
required goods -> travel/perform action -> requirement check at destination ->
complete exactly once -> reward/reputation -> journal.

Deliveries consume the correct goods; reserved freight cannot be sold as spare
cargo. Exploration requires the specified new survey, not any scan. Escort/
passenger/bounty/salvage/recovery/smuggling/investigation/emergency missions use
their own prerequisites and meaningful outcomes. Abandon/failure costs are
previewed and recorded. Mission cargo cannot permanently occupy a hold after
the contract ends.

Customs detect -> player sees allegation/stakes -> submit/bribe/conceal/spoof/
flee/fight -> seeded resolution -> confiscation/fine/reputation or encounter.
EW/sensors and illegal cargo modify real outcomes. Save/load preserves the
pending event and RNG so inspection cannot be rerolled.

## 7. Derelict, boarding and capture

Identify -> approach/dock -> inspect atmosphere -> choose away team -> cross
docking edge -> route through actual rooms -> restore doors/power -> explore/
recover logs/cargo/survivors -> handle fires/threats -> recall team -> undock.

Cargo extraction checks remaining capacity. Rewards cannot be collected again
by reboarding the same compartment. Returning a crew member is a real move,
not teleportation. UI shows all crew locations and a warning before abandoning
an away team. Hostile boarding shares movement, crew combat, sabotage and
medical systems. Capture requires defined hull/crew control conditions,
resolves ownership once and leaves salvage/extraction choices.

## 8. Expedition objective and endings

Briefing names the archive objective and marks the first lead. Frontier surveys,
trade-funded intelligence or faction contracts reveal independent archive
leads. Three unique recovered coordinates unlock the final route. Show progress
in the journal and map; the final beacon interaction requires actual progress.

Final encounter supports fighting, prepared EW bypass or a costly negotiated
route where content permits. Recover archive -> extraction route -> friendly
station hand-in -> victory. Do not call ordinary encounter victory Expedition
victory. Result screen lists the seed, duration in active simulation time,
discoveries, missions, net wealth, crew lost and ending; restart is explicit.

## 9. Save, focus and error flows

Manual save in combat -> serialize all timers/orders/RNG -> validate round trip
-> persist -> confirm. Resume -> validated load -> paused state -> inspect ->
explicit resume. Reload cannot duplicate a reward, remove an incoming shot or
reroll a market event.

Hidden tab -> automatic pause -> clear wall-time accumulator -> return ->
"Paused while away" -> explicit resume. Opening a modal preserves user pause.
Invalid command -> explain missing prerequisite -> no resource/RNG mutation.
Storage full -> visible error -> offer download; never show false "Saved".
Stale save changed by another window -> preserve its newer bytes -> offer saving
live progress as a separate expedition. Switching waits until current progress
can be kept. Autosave and terminal saves use the active expedition identity,
not the seed or a global current slot. Practice drills retain that identity and
never persist temporary drill state.

## 10. Observable acceptance journeys

1. New run: finish introduction, assign crew, alter reactor allocation, aim ion
   and laser at different rooms, pause/resume and win a battle.
2. Emergency: survive a breach/fire by moving crew, venting/closing doors,
   repairing and restoring system power; verify pressure and health change.
3. Strategy: visit a station, buy cargo, travel, sell for a justified margin,
   accept and complete freight plus survey contracts.
4. Exploration: identify unknown contacts, sell unique survey data, physically
   explore a derelict and bring the away team back.
5. Persistence: save with a projectile and a crew task in progress, reload,
   resume identical commands and compare resulting authoritative state.
6. Endings: finish the three-coordinate objective and extraction; separately
   reproduce defeat and restart without carrying over old run state.
7. Visual/accessibility: compare mockup composition at 1664x936, exercise all
   core controls at 1280x720 and with keyboard/reduced motion.

Passing these journeys is necessary but does not replace the per-feature
traceability and endurance/balance gates in the implementation plan.
