# STARSHIP implementation evidence

This ledger records actual implementation evidence, not release approval. The
accepted M0 design remains authoritative. AI reviewers are not human players.

## Current status

The application has a complete playable tactical/strategic Expedition.
On 2026-11-02 the user explicitly authorized delivery with human-only
pacing/fun gates marked **unverified**. This does not turn automated tests into
human evidence, excuse engineering defects, or imply unrestricted acceptance.
The engineering evidence and limitations below remain separate.

## Clipped-panel border correction, 2026-11-02

The shared 10px clipped frames now draw diagonal corner strokes instead of
clipping a rectangular border and leaving open corners. Alert, selected,
hovered and paused colors are preserved, as are scrollable frame surfaces;
rectangular dialogs keep their existing borders. The opaque inset shadow no
longer obscures the diagonal ends. No simulation or gameplay behavior changed.

Strict TypeScript, Vite and offline-cache generation pass. New rendered-pixel
regressions pass in Chromium and Firefox at the configured desktop viewports
and the reported 859x655 screenshot size, including themed frames, selection,
confirmation controls and scrolling. Existing combat/targeting/fire-breach
visual cases also pass in both engines. The original bundle reproduces the
missing-edge regression in both browsers.

Corrected build: `index-kju6mZnS.js`, SHA-256
`3DFB8B4160410CF0C4BB9A99B836018809486F684FA4B14FF152F570CAB2CB41`;
`index-b9xuWPoX.css`, SHA-256
`4631678BD32F9F3A5C9A1637F042F10BC35FE9D19F13396BFEB8F2F1956B62D9`.
Offline cache: `starship-7d793c3fac5fa4e3`. The broader gameplay/performance
measurements below remain historical evidence for their stated artifacts,
not new measurements of this CSS-only correction.

## Foundation checkpoint

Historical evidence from the first implementation checkpoint; subsequent
sections supersede its pending items while retaining failed measurements.

- Strict TypeScript, Vite, React HUD, independent Pixi scene, standalone seeded
  20 Hz simulation, authored unlike ship layouts, graph movement, orders,
  power, shared tactical rules, serializable complete run state.
- Versioned/checksummed bounded saves, previous slot, read-back validation,
  explicit JSON export/import, corruption feedback and paused loading.
- Browser preview responded HTTP 200 on `http://127.0.0.1:5173`.
- Actual 1280x720 browser-canvas inspection: original space background/planet
  and hull, live room geometry, three corresponding crew, top telemetry,
  bottom systems/weapons, visible pause and navigation. Secondary label
  legibility and roster safe area are being improved before visual acceptance.
- Clean integrated checkpoint: **121/121 simulation/strategy/mission tests
  passed**, strict TypeScript and production build passed on 2026-11-01.
  Includes regressions for marginal bulk trading, current navigation gates,
  exhausted surveys, convoy survival, persistent wrecks/deceased away crew,
  graph recall, customs, schema references, command replay and save continuation.
- Complete Expedition victory is exercised through legal noncombat simulation
  commands. This is not a production-browser victory or human pacing result.
- Eleven mission categories now have distinct observable conditions; authored
  compartment outcomes include supplies, recorder, logs, survivor and threat.
- Original player/enemy hull art, textured interiors, stronger shield material,
  enlarged HUD secondary text and player-only crew controls are integrated.
  Spatial targeting and visual acceptance still require fresh browser evidence.
- Architecture and gamer implementation reviewers requested revisions. Their
  fixes are authored; explicit implementation re-acceptance is pending.
- Last measured 1280x720 software-WebGL result was **20.49 FPS**, below the
  60 FPS gate. Further render-texture caching, paused render-on-demand,
  interpolation and visible quality settings are included but not remeasured.
- Production offline cache generation passed (13 assets). Actual offline
  browser continuation is not yet verified.
- First Chromium production-control journey exercised new run, queued power,
  trading, freight delivery, planetary survey, saving and continuing. All
  interaction assertions reached completion, but the test exceeded its original
  180-second host budget and therefore **failed**. Trace showed slow operations
  and software-WebGL readback; it is not counted as a passing browser gate.

## Scope/evidence still required

All mandatory requirement IDs in `validation.md` remain subject to exact
behavior/evidence review. No green compilation substitutes for missing behavior.
Full Expedition and first-sandbox engaged human durations have not been
measured. Three profession-based human sessions and two onboarding sessions
have not occurred. Those human-only gates remain explicitly unverified under
the delivery authorization. Automated performance/soak, both browser full-run
journeys, negative persistence coverage and scoped reviewer agreement are
recorded below. Final artifact provenance and residual branch limitations must
not be confused with those completed checks.

No Captain Mode, multiplayer, additional player ship classes or permanent
stat-bonus meta progression is claimed.

## Reviewed implementation corrections

Architecture, software-developer, gamer and game-quality AI reviewers all
initially requested revisions to the implementation. All four subsequently
gave **ACCEPT within their retained findings scopes**, after corrections:

| Reviewer | Corrected findings and evidence |
|---|---|
| Architecture | Interception/route save IDs, persistent partial wrecks, graph recall, customs authority, functional power/reserved-cargo invariants, user-pause/queue/replay metadata, faction service authorization. Reviewer independently passed 12 focused regressions and five read-only probes. |
| Software developer | Guardian withdrawal rejects pending operations atomically; defeated/surrendered raiders are not archived under invalid authored-wreck keys. Public-command departure/save/continuation regressions cover both battle outcomes. |
| Gamer | Genuine unlock state, wreck continuity, adjustable weapon-power priority, truthful service geography/contact risk, combat coordinate alternatives, reversible drills/onboarding, fitting effects, reachable seeded enemy variants. Reviewer independently passed 87 strategy/tactical tests. |
| Game quality | Field contract claims exposed at nonstation destinations; immediate terminal persistence excluding training; investigation UI distinguishes assigned relay from corroborated evidence. |

These are role-specialized AI reviews, not human playtests or blanket release
approval. The current clean suite has **199 passing tests**. Chromium and Firefox
production controls pass spatial targeting directly over an enemy crew sprite,
combat save/reload, door lock/unlock, reversible-drill save isolation,
abandonment/reload, commerce, freight and surveying. Chromium also passes
network-disabled cached shell/save continuation.

The coordinating session independently passed a genuine new-run-to-victory
journey in Chromium (1664x936, 1.4 minutes) and Firefox (1280x720, 2.2 minutes),
using real safe-speed controls, freight, charts, surveying, fuel, guardian,
beacon, extraction and terminal reload. See
[`expedition-browser-evidence.md`](expedition-browser-evidence.md) for exact
artifact provenance and assertions. These optimized automated durations are
**not** normal engaged human pacing results. The final immutable-artifact
rerun is also complete, as recorded below and in the independent evidence.

## Performance, endurance and career evidence

Windows, Intel Core i7-1185G7 (4 cores/8 logical processors), Intel Iris Xe host;
headless Chromium 141 uses its software-rendering path. The current actual
generated-battle diagnostic at 1280x720, Performance/50% linear resolution,
measured **56.32 average render submissions/sec**, **52.30 display rAF/sec**,
and **33.4 ms p95 display-frame interval** over 15 seconds. The 60 FPS /
20 ms p95 gate **fails**. Render submissions are not GPU-completed frames.
This generated battle is not the separately specified 32-projectile baseline
or 256-projectile stress fixture. Explicit opt-in `PERFORMANCE=1` browser tests
retain the failed threshold rather than silently relaxing it.

Headful Chromium 141 with normal per-process GPU defaults **does** acquire the
host adapter, verified through `WEBGL_debug_renderer_info`, not inferred from
launch flags: `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49)
Direct3D11 vs_5_0 ps_5_0, D3D11)`. At 1280x720, Auto/100% resolution:

| Workload | Render submissions/sec | Display rAF/sec | p95 frame interval | Result |
|---|---:|---:|---:|---|
| Actual generated battle, variable projectile count | 85.56 | 85.62 | 12.2 ms | PASS 60 FPS / 20 ms |
| Validated synthetic 2 ships / 6 crew / 32 ion projectiles; native guns removed; no in-window impacts | 85.62 | 85.68 | 12.2 ms | PASS 60 FPS / 20 ms |

Both use 15-second measured windows after warm-up. Submission counters do not
claim GPU-completed frames. Software fallback remains explicitly below target.

Isolated Node 20.19.2 simulation measurements, 40 warm-up plus 400 measured
`game.step` ticks, same CPU/31.71 GiB RAM:

| Workload before every tick | p50 | p95 | Limit/result |
|---|---:|---:|---|
| 2 ships / 6 living crew / 32 projectiles / 4 fires / 4 leaks | 0.3252 ms | 0.9968 ms | <5 ms PASS |
| 4 ships / 32 living crew / 256 projectiles / 8 fires / 8 leaks | 0.4976 ms | 2.4719 ms | <15 ms PASS |

These are disclosed synthetic fixtures replenishing ion projectiles and hazard
floors, with native guns removed. AI, impacts, atmosphere and physical tasks
execute normally. Invariant/save checks are outside the timed tick. Earlier
contended-host samples failed; these isolated results do not erase them.
A pre-optimization final sample also failed stress at 27.7984 ms p95
(271.1944 ms maximum). Hoisting the identical ordered crew list out of the
per-crew task loop removes redundant sorting without changing task/combat
order. The subsequent exact workloads pass twice; the table uses the final
source sample, not the fastest sample. Baseline/stress p95 changes from the
earlier isolated milestone are approximately +3.3%/+11.8%, below the 20%
regression trigger. Large shared-host wall-time spikes remain disclosed.

The deterministic survival soak passed two **72,000-tick** runs (144,000 checked
steps total), 12 save/load round-trips, zero resets. This is safe-station
survival, not 60 minutes of combat or human play.

Chromium production endurance passed **25 real restart/load/battle cycles over
1,236.5 seconds (20.6 minutes)**, zero page errors, one canvas each cycle.
Post-GC retained JS heap: warm-window maximum 12,396,472 bytes; final-window
maximum 11,931,896 bytes, **-3.75%**. This measures JS heap, not GPU/process
memory or every possible interaction.

`careers.test.ts` passes **30 legal new-run-to-extraction scenarios**, seeds
1,2,3,4,5,6,7,9,42,12345 per career. Explorer uses surveys and all ten Nacre
compartments; trader uses deliveries/marginal trades/charts; combat uses fitted
raider battles and guardian combat. A forced guardian retreat now explicitly
secures passage with **zero destruction payout**; player escape does not.
These are automated viability scenarios, not human fun/duration evidence.

Physical emergency production controls pass extinguishing, breach/system
repair, powered-medbay healing and exterior-vent warning/closure in both
Chromium and Firefox. The prepared first-battle-to-win driver also passes
both engines: purchase an extra laser, allocate Weapons power, deny enemy
engine escape, suppress Weapons, physically extinguish/repair and restore ion-
removed allocations, claim the bounty, return, save and reload. Earlier failed
driver strategies are not counted as passes; a retreat is not a bounty kill.

Withdrawn contacts now use an explicit inactive state, never a free derelict.
Living away crew remain represented, freeze outside local simulation range,
and trigger an immediate decision pause. Normal docking, targeting, boarding
and loot are unavailable. Explicit emergency extraction costs 20 CR/debt,
10 HP and loose cargo, takes 100 ticks, survives save/load and permits
departure only after living away crew return. Abandonment is a separate
confirmed ending; hostile boarders already aboard remain dangerous.

Corrupt-primary recovery now permits subsequent verified saving while keeping
the good previous slot and a bounded original diagnostic. Conflicting retained
corruption cannot be silently overwritten; export and explicitly confirmed
discard preserve valid saves. Authored cargo/module and recorder references
are checked. Synthesized cues now survive run/load tick rewinds, respect true
zero volume, prioritize critical alarms, and consume all new events rather
than only the last event in a batch. WebAudio adapter tests do not claim a
human listening session.

The final candidate's strict TypeScript and production build pass; eight
retreat/stranding, six audio and seven queued-fitting/market-record regressions
join the original 165 tests and 13 content-reference/quarantine regressions.
Prototype-named fittings are rejected both during import and at the command
gateway; incomplete stock/observed-price records cannot become nonfinite at
the next economy tick. Both browsers pass the actual
stranded-team/save/load/priced-recovery controls and compact physical-emergency
drill. A contended Chromium first-battle driver lost while issuing orders live;
the corrected driver uses the game's tactical pause and restores all three
weapon allocations, rather than allowing automation latency to continue the
fight unattended. Its Chromium rerun passes. The combined ec8f04c browser matrix passes
**15 tests with one intentional Firefox offline-cache skip** in 7.8 minutes;
the failed earlier run is not erased. The independent coordinator's ec8f04c
matrix passes all **14 tests** in 6.0 minutes, including fixture-free full
victory, corrupt-save recovery/continued-save/export/discard and both actual
missile-hull and oxygen-crew defeat/debrief/reload scenarios. Final guard-only
artifact reruns are recorded in the independent browser evidence.

On final runtime source `75eac32a3de22296a487ef138cc8341950fd0a1e`,
the child matrix passes **17 tests with one intentional Firefox offline-cache
skip** in 8.8 minutes. This repeats all previous 16 cases and adds a physical
wreck journey in both engines: full-hold search rejection, blocked normal
recall, explicit 20 CR/10 HP/cargo-forfeiting extraction, reboarding, locally
authorized door unlocking, actual traversal/search for the sensor log, normal
physical recall and verified saving. A validated import establishes only the
bounded full-hold/blocked-route preconditions; subsequent controls and time
progression use the production application, not hidden state setters.

The coordinator independently passes **14/14 final-artifact browser cases**
in 6.6 minutes, including the three newly rejected prototype-named queued
fittings, and **199/199 unit tests** with exit code zero in 57.88 seconds.
An earlier concurrent unit attempt passed all assertions but exited with a
Vitest worker reporting timeout; that attempt is a runner failure, not a clean
pass. Both verification matrices identify the same artifact below. Combined
final browser coverage is **31 passed, one intentional skip**. Strict
TypeScript also passes after the added browser journey.

The final production bundle is `index-BIF077lt.js`, SHA256
`4F8D3280BF828848B204E64803F585CE2A216A5F03798CEBC29B41A2BD82C03A`;
CSS `index-CXeRX3E1.css`, SHA256
`8C83B6D6627EBD493518DB33C86EE88B86AAE435AAC0525C47E1891CB5201FE3`.
Both final hardware measurements above use this exact build, verified Intel
adapter and 100% Auto resolution. Offline cache is `starship-4e71928d8add280e`.

## External validation limitations

Hosted CI cannot run: GitHub's check annotation says **“GitHub Actions hosted
runners are disabled for this repository”** before any workflow step executes.
[Observed run](https://github.com/miplese_microsoft/starship/actions/runs/41372877014).
This is not a successful CI result, nor an application test failure. Local
test/build/browser evidence is recorded separately; administrator enablement
is external to the game.

The requested critical consultation received an explicit delivery decision:
"Given the current state, please authorize the delivery with the human-only
pacing/fun gates explicitly marked as unverified." This authorizes delivery,
not a fabricated human pass or a waiver of engineering defects. No personal
contact data is stored in this repository.

## Requirement traceability at this checkpoint

“Implemented/tested” below identifies concrete automated coverage; it does not
supersede an unmet human, visual or performance gate.

| IDs | Implementation and evidence | Residual acceptance |
|---|---|---|
| R01 | `game.ts`, controller terminal persistence; real-control full victory, abandonment/reload, actual missile hull and oxygen crew defeats with terminal reload in both browsers; independent browser evidence | Bounded scenario coverage, not every possible combined failure |
| R02 | Active simulation minutes shown separately in debrief | 90–180 minute human pacing unverified |
| R03–R04 | `game.ts` travel, functional sensors, passive/active/probe/physical/purchased knowledge; strategic regressions and full browser route | Exhaustive sensor-jam browser matrix pending |
| R05 | `expedition.ts` seven survey types/values, one-time records/sales and permanent objective knowledge; mission/strategy tests | All-type production-control tour pending |
| R06 | Four risk bands, truthful station availability, incoming-contact choice, finite fuel/rescue; full route evasion/refueling | Human preparation clarity unverified |
| R07–R09 | `region.ts` six economies/ten goods, integrated marginal quotes, bounded dynamic events/stock, mass/volume/reservations/stale snapshots; 100-seed graph and reversal tests | Extended balance scenarios pending |
| R10–R12d | `missions.ts`, customs gateway, faction/fitting gates and eleven distinct mission categories; 38 mission tests plus actual freight/field claim UI | Full browser branch matrix pending |
| R13–R15 | Physical compartment outcomes/mining; tactical/mission regressions; both-browser full-hold rejection, blocked-route extraction, reboarding/local door authorization/traversal/log search/normal recall, plus withdrawn-team save/recovery | Exhaustive all-room/hazard combinations are not claimed |
| R16–R20 | `ships.ts`, `validate.ts`, shared tactical rules, room graph, pressure/fire/breach/manning/skills/health; tactical tests, actual door/target controls and both-browser physical emergency chain | Extended mixed-hazard combinations remain bounded-test coverage, not exhaustive play |
| R21 | Future-only extras not required; functioning minimal drones/tether are present for required EW/boarding | No cloaking/shield-modulation claim |
| R22–R27 | `tactical.ts` six weapon families, evasion/shields, paid directional attack/defense, EW variants, physical boarding/combat/sabotage/capture, shared-rule doctrines and one-time rewards; tactical regressions | Comprehensive UI counterplay coverage pending |
| R28–R29 | Economy/size/tech/faction fitting availability, functional reactor/engine/shield/sensor/cargo/fuel/armor/EW/berth upgrades, visible weapon allocation priority; distinct fitted careers tested | Human balance/UX unverified |
| R30–R31 | Seeded routes/markets/contracts/rewards/crew/loadouts; 100-seed structural checks; ten full legal victories per distinct fitted career | Human balance unverified |
| R32–R33 | One complete player ship; no meta unlock or permanent stat-bonus system | Additional classes/meta are not claimed |
| R34–R35 | Standalone typed 20 Hz simulation, React/Pixi/event separation, frame-subdivision/command-replay/combat-continuation tests, strict build; measured tick/render and bounded soak results above | Software fallback misses rendering target |
| R36 | Original art/provenance; six full-resolution pristine/targeting/fire-breach screenshots at both resolutions, independently inspected against all eight categories with score 2 each; see browser evidence | Bounded visual assessment, not pixel-exact copying or exhaustive visual regression |
| R37 | Synthesized event audio with mute/volume, restart/load reset and critical priority; six WebAudio lifecycle/frequency regressions; matching textual ship log | Human listening assessment not performed |
| R38 | Spatial Laser/Ion targeting over hostile crew, combat save/reload, prepared first-battle win/reward/departure, physical emergency chain and independent both-browser hull/crew defeat journeys | First-time human teaching/pacing remains unverified |
| R39 | Exact first-system counts and ten goods across 100 seeds; real-control commerce/freight/survey | 20–30 minute first-time human sandbox evidence absent |
| R40 | No manual flight, multiplayer, surface/MMO or cloud-account dependency | Implemented scope boundary |
| R41 | Real ship emergencies, recall, convoy/cargo/customs and deep-space choices interact | Human emergent-story/opportunity-cost protocol pending |
| R42 | Accepted seven-document design baseline and four-role review record | M0 complete |
