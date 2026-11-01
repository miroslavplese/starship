# Requirements and acceptance specification

## 1. Evidence policy

Every requirement below starts **pending**. Implementer records code, test,
screenshot/play session, exact commit and actual result in `release-status.md`.
A row with several comma-separated behaviors requires evidence for each;
neither one successful screen visit nor a green build satisfies it.
All rows are required except explicitly future rows. No placeholders count.
Ordinary implementation refactoring is permitted; reduced release scope is
not implied by finite development time.

## 2. Requirement-level register

| IDs | GDD | Observable acceptance | Milestone |
|---|---|---|---|
| R01 | 1-4 | new run, complete objective, extraction, victory, defeat, abandon with distinct debrief | M4 |
| R02 | 4 | timed engaged Expedition 90-180 min; simulation time separately reported | M6 |
| R03 | 5 | region jump, system travel, tactical encounter; unknown route reveal | M3/M4 |
| R04 | 6 | passive detection, active scan, probe, physical investigation, purchased intelligence each changes knowledge | M3/M5 |
| R05 | 6 | planetary/mineral/route/anomaly/biological/ruin/faction survey data, each discoverable/saleable once | M5 |
| R06 | 7 | four risk bands; fuel/services/preparation visibly affect a deep-space journey | M4 |
| R07 | 8 | agricultural/industrial/mining/high-tech/military/colony price differences | M3/M4 |
| R08 | 8 | outbreak/war/shortage/boom affects bounded stock/prices; no same-station arbitrage | M4 |
| R09 | 8 | finite volume, mass travel penalty, timestamped stale prices, bought updates | M3 |
| R10 | 9 | restricted goods; submit/bribe/conceal/spoof/flee/fight each has explicit cost/outcome | M5 |
| R11 | 9 | reputation changes prices, docking, missions, equipment/intelligence and security response | M4/M5 |
| R12a | 9 | courier, freight, emergency supply: accept, fulfill, fail/abandon, reward once | M4/M5 |
| R12b | 9 | passenger, exploration, salvage: distinct requirement and outcome, reserved capacity | M4/M5 |
| R12c | 9 | bounty, escort, recovery: real target/survival/item checks and terminal states | M5 |
| R12d | 9 | smuggling, investigation: legality/clues affect outcomes, not relabeled delivery | M5 |
| R13 | 10 | board rooms, restore power/doors, logs/cargo/survivor/threat, fire/air risk, recall | M3/M5 |
| R14 | 10 | salvage resource types, time and rival/pirate response; depleted wreck stays depleted | M3/M5 |
| R15 | 10 | sensor prospecting + equipment extraction + finite deposit + time | M3 |
| R16 | 11 | layout data validates rooms/tiles/doors/system refs; two unlike layouts run same logic | M1 |
| R17 | 12 | bounded pressure transfer, vent/close/refill, oxygen-dependent fire, severity-based breach repair | M2 |
| R18 | 13 | persistent names/species/health/speed/traits/status/orders; physical movement/work | M1/M5 |
| R19a | 13 | piloting/engines/weapons/shields skills each alter documented calculation | M2/M5 |
| R19b | 13 | repair/combat/science skills each alter documented calculation; trait effect demonstrated | M5 |
| R20 | 14 | reactor/cockpit/engines/shields/weapons/oxygen/medbay/sensors/doors health/function visible | M2 |
| R21 | 14 | cloaking, drones, teleportation, shield modulation, auxiliary reactor are future-optional modules | future |
| R22 | 15 | shield recharge, cockpit/engine evasion, manning, environment hit modifier | M2 |
| R23 | 15 | laser/ion/missile/beam/kinetic/experimental each distinct live behavior/counterplay | M2/M5 |
| R24 | 16 | four armor sections + maneuver alters incoming section and has an engine cost | M5 |
| R25a | 16 | EW sensor jam/target disruption/shield interference/hacking/drone hijack | M5 |
| R25b | 16 | EW customs avoidance/identity/manifest spoof/interception/hidden signals | M5 |
| R26 | 17 | pause, target choice, shared-rule power/vent/repair/boarding, retreat/surrender, doctrines | M2/M5 |
| R27 | 18 | crew combat/sabotage/capture, stranding/extraction, terminal reward once | M5 |
| R28 | 19 | station size/economy/tech/faction affects available services | M3/M5 |
| R29 | 19 | reactor/engine/shield/weapon/sensor/cargo/fuel/armor/EW/crew/module upgrades affect play | M3/M5 |
| R30 | 19 | explorer/trader/combat builds with real fitting tradeoffs complete different archive approaches | M5/M6 |
| R31 | 20 | seeded routes/encounters/markets/contracts/rewards/crew, authored constraints, feasible progression | M4 |
| R32 | 20 | one complete player ship required; 6-10 player classes future-only | M2/future |
| R33 | 20 | meta unlocks information/options only; if no meta system shipped, state explicitly | M5 |
| R34 | 21 | fixed 20 Hz, independent rendering, seeded replay, full combat save continuation | M1/M2 |
| R35 | 22 | strict typed standalone sim, external content, React HUD/Pixi scene, events/audio separation | M1 |
| R36 | 23 | original hull/crew/icons/backgrounds, visual rubric below, no borrowed commercial art | M2/M6 |
| R37 | 23 | hit/ready/missile/fire/breach/oxygen/injury/failure/jump/scan/dock/discovery audio cues + text | M2/M5 |
| R38 | 24 | all first-battle mechanics through UI, victory/defeat and meaningful damage recovery | M2 |
| R39 | 25 | exact location/commodity/contract minimum in first sandbox, 20-30min human evidence | M3/M6 |
| R40 | 27 | no multiplayer/manual flight/surface/MMO/cloud-account requirements | all |
| R41 | 28-30 | observed emergent recovery chain + cargo-risk opportunity-cost narrative | M6 |
| R42 | 32 | reviewed architecture/state/components/algorithms/flows/plan | M0 |

Future-optional R21 does not weaken mandatory EW/boarding. If drones are installed
to demonstrate hijacking, their minimal functioning module becomes required by
R25a. Shield modulation/cloaking need not be fabricated for a future-only item.
An absent meta system has no stat bonuses and is disclosed rather than
misrepresented as an implemented unlock system.

## 3. Determinism/persistence scenario matrix

For each fixture below, issue a fixed command stream; compare a continuous run
with a save/load continuation under the canonical rules in `gameplay-rules.md`.
Assert entire state equivalence, resource accounting and one-time event IDs.

| Fixture | Boundary assertions |
|---|---|
| Paused queued move + weapon target | queue/sequence survive; no execution paused; order invalidated by death rejects on execution without partial cost |
| Projectile in flight + ion recovery | same impact tick, RNG, ammo, power and lock expiration |
| Fire + breach + crew path | same air mass, damage, path, work progress and deaths |
| AI with hidden interior | changing hidden facts does not alter filtered-view decisions |
| Pending customs | same outcome after load, no reroll |
| Away team + blocked docking door | locations/ownership/recall cost survive, no duplicate extraction |
| Market transaction + reserved freight | same goods/credits/stock; reserved units cannot sell |
| Accepted surrender + reward token | no second payout after reload/re-entry |
| Final archive hand-in/terminal save | same ending, no live dead ship or duplicate victory |

Overlapping pause test: user pause -> modal -> hidden -> shown -> modal close
must remain user paused. Loading adds `loaded`; clearing it cannot erase user
pause. Ten seconds wall time paused/hidden advances zero ticks.

Persistence failure tests: malformed JSON, unknown version, nonfinite value,
duplicate/broken IDs, oversized import, out-of-range ammo/health, write quota,
interrupted primary write, read-back failure and invalid read-back. Assert
original live game and prior known-good slot retained, explicit error, never a
false success. Verify previous-slot recovery and export without deleting bad
bytes. Latest plus previous slot must fit comfortably in typical 5 MiB quota.

## 4. Production-control browser scenarios

Use actual buttons/keyboard/spatial targets, no hidden production cheat API.
Record seeds/fixtures and intermediate resource values in test assertions.

- New-run journey: choose seed 12345 -> tutorial -> queue engineer move paused
  -> allocate spare power -> target ion at shields and laser at weapons ->
  resume -> observe charge/impact/system damage -> win -> reward exactly once.
- Emergency fixture: known breach and fire -> vent after warning -> health/
  oxygen change -> close -> physical repair -> refill -> medbay heal -> power
  restored. Test unsafe route and unreachable-task rejection.
- Commerce fixture: 60 credits, capacity 20 -> buy known quantity -> stock/
  credits/cargo deltas -> travel with shown fuel cost -> sell at second station
  -> correct margin. Reject unaffordable, full-hold and reserved-freight sale.
- Survey/contract fixture: identify unknown -> survey once -> accept matching
  exploration/freight -> visit required destination -> consume goods -> reward/
  reputation once; reject unrelated scan and duplicate completion.
- Away-team fixture: board -> room traversal -> repair/log recovery -> full-hold
  rejection -> return; separately block route -> priced tether -> all living
  crew restored with stated penalty. Reject extraction of dead crew.
- Endings: genuine new run through legal production controls to all three
  coordinates, final approach, archive and extraction; no fixture teleport in
  this journey. Separately reject early hand-in, test surrender rejection,
  low-fuel recovery, faction denial, defeat and confirmed abandonment.
- Persistence journey: save in combat using UI, reload page, explicit resume,
  same orders/targets and no missing projectile/reward.

Use validated fixture saves for bounded failure/emergency tests, but not to
replace the genuine new-run-to-victory browser test. E2E timeouts must reflect
game pacing; fast-forward may be a real player feature only in safe travel.

## 5. Visual and accessibility rubric

Inspect production screenshots at 1664x936 and 1280x720 in pristine combat,
selection/targeting and fire/breach states. Score each 0 (absent/broken),
1 (functional but visibly incomplete), 2 (finished/readable). Every category
must reach 2; no aggregate score can hide a missing category.

1. Composition: large left player/smaller right enemy, separated red threat
   region, top telemetry, bottom instruments, unobscured pause.
2. Original hull detail: silhouette, plates, engine glow, orange markings and
   depth; not a rectangle with rooms drawn over it.
3. Interiors: readable floors/walls/doors/system glyphs; playable geometry
   agrees with clicks and pressure overlays.
4. Crew: distinct original sprites, actual roster/health/location correspondence,
   visible selection/task and no misleading extra decorative crew.
5. Effects: blue shield envelope, visible projectiles/reticles, shield/hull hits,
   distinguishable fire/breach/low-oxygen hazards.
6. HUD: angular framed panels, coherent typography/palette, segmented resources,
   allocation versus health versus charge distinguished; icon legend/tooltips.
7. Environment: stars/nebula/planet create depth without reducing tactical
   contrast; original provenance manifest for all art.
8. Interaction/access: readable 720p labels, keyboard equivalents/focus, no
   clipped dialogs or overlaps, color-independent warnings, reduced motion.

Original hull shapes/layout refinements are intentional departures; copying
commercial artwork is prohibited. A flat placeholder scene fails even if the
panel positions match. Record reviewer observations and fix failures.

## 6. Performance, soak and balance

Record OS, CPU/GPU, RAM, browser version, viewport and build commit. Test baseline
two ships/6 crew/32 projectiles and stress four ships/32 crew/256 projectiles,
simultaneous fires and leaks. At baseline target p95 sim tick <5ms and p95 frame
<=20ms, 60 FPS average; stress target tick <15ms and no accumulator runaway.
If recorded hardware cannot meet these, optimize or explicitly report a failed
gate; "target" is not a passing measurement.

Run 60 minutes automated simulation soak with invariant checks per tick and
15 minutes actual browser combat/restart/travel soak. Repeat new/load/restart
25 times. Event/queue/entity counts stay within caps, no retained disposed Pixi
applications or AudioContexts, no console errors, no unbounded growth. After
warm-up, retained memory growth after garbage collection <=10% across restart
cycles where measurable; report measurement limitations. Save/load still works
after soak. Track p95 regression >20% from the milestone baseline.

Run seeded balance scenarios (at least ten seeds per build approach) for
explorer, trader and combat builds; verify all feasible archive/extraction
routes, rescue under combined failures, no negative resources and no dominant
zero-risk infinite-profit loops. Record decisions/outcomes, not fake human fun.

Human protocol: three full engaged Expedition sessions covering explorer,
trader and combat choices, plus two first-time sandbox/onboarding sessions.
Measure engaged wall time excluding real breaks, active sim time, deaths/
rescues, time spent in repetitive trading, assistance needed, confusing alerts
and meaningful decisions. Target Expedition 90-180 min, sandbox 20-30 min,
no developer assistance for core loops, no unexplained irreversible failure.
Ask testers to recount one emergent recovery and one opportunity-cost decision.
If human testers are unavailable, leave pacing/fun acceptance explicitly
unverified; do not call AI playthroughs human evidence or claim full completion.

## 7. Review/evidence ledger format

Each milestone report: commit, scope, commands/results, browser/hardware,
seeds/fixtures, screenshots, requirement IDs covered, residual defects and
reviewer disposition. At each milestone checkpoint, re-estimate remaining
scope from actual progress and fix failed gates before claiming acceptance.
Never resolve an overrun by silently reducing the required game.
