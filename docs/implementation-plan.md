# Implementation plan and release gates

Authority: GDD v0.3, the supplied combat mockup, `architecture.md`,
`components.md`, `flows.md` and the accepted review decisions.

`gameplay-rules.md` resolves concrete numerical, recovery, progression, fitting,
FTL/cockpit and terminal contracts. `validation.md` adds requirement-level
acceptance, browser assertions, visual rubric, persistence matrix, measured
performance/soak workloads and human playtest protocol. These are required
parts of every milestone gate, not optional follow-up documents.

## Delivery rules

Build the game only after independent architecture, software-developer, gamer
and game-quality reviewers have read the complete document set, actionable
blocking feedback is resolved, and each reviewer explicitly accepts the revised
design. Review agreement is not a claim that unimplemented software works.
Repeat implementation/quality review before final delivery.

Implement incrementally, keep the application runnable at every milestone,
run relevant automated and manual browser checks, update traceability/evidence,
commit and fast-forward push `HEAD:main`. Fetch before pushing; integrate remote
changes without discarding other work. No force pushes, no automatic PR scope.
Do not mark all milestones complete after building only the first battle.

## M0: reviewed engineering baseline

Deliver these four detailed documents, preserved reference mockup, review
findings/resolutions, and a traceability/evidence ledger. Gate: all four
reviewer roles explicitly accept. Push documentation to `main`.

## M1: deterministic ship foundation

Create TypeScript/Vite/React/Pixi project, strict type checking, production
build, unit runner, browser runner and CI. Implement typed content/state,
validated commands, seeded RNG, fixed-step clock, pause/focus semantics,
original art foundation, room/door graph, physical crew movement, versioned
save/load/export/import and clear error feedback. Render an authored ship
matching the reference composition.

Gate: reproducible initial states; 20 Hz frame-rate-independent stepping;
pause with no hidden progress; pathfinding around locked doors; save round-trip/
corruption behavior; real browser launch and non-overlapping 720p controls.
Persist screenshot evidence and a buildable production artifact. Push `main`.

## M2: one excellent tactical battle

Implement reactor allocation, core systems, laser/ion, targeting/projectiles,
shield layers/evasion, room/system/hull/crew damage, oxygen/fire/breaches,
repairs/medbay, manning and shared-rule enemy AI. Add FTL escape, surrender,
single-resolution loot, defeat/restart, guided introduction, keyboard controls,
original hull/crew/icon/effect assets and synthesized audio.

Gate: all GDD section 24 behaviors work through the actual UI; deterministic
combat integration; emergency recovery; no negative power/ammo/resources;
player and enemy constrained identically; zero duplicate rewards; save and
reload during combat continues identically. Compare actual screenshots against
the mockup, not merely DOM presence. Push `main`.

## M3: star-system sandbox and commerce

Implement the exact section 25 location/content minimum, unknown-contact
resolution, sensors, in-system travel, exploration/salvage, lightweight mining,
two functioning station economies, ten commodities, finite cargo, timestamped
market intelligence, refuel/repair/upgrade and freight/survey contracts.
Derelicts use physical away-team rooms and emergency simulation.

Gate: end-to-end buy/travel/sell loop, meaningful spread/stock changes, no
repeatable survey or salvage payouts, cargo reservation, actual away-team
return, two complete contract paths, fuel recovery without soft locks.
Measure 20-30 minute sandbox pacing in playtesting; record actual results,
not just a desired duration. Push `main`.

## M4: complete Expedition

Generate connected regional systems with risk geography, factions, reputation,
routes, deep-space preparation, dynamic economic events and journal. Add
three-coordinate archive objective, final encounter, extraction, result screen
and complete run persistence. Expand encounters/contracts to the GDD categories,
with explainable choices and multiple approaches to progression.

Gate: seeded generation checks across at least 100 seeds; objective and service
reachability; automated full run via legal commands; browser victory and defeat
journeys; save/load at each phase; no false objective completion; deterministic
replay. A normal run's 90-180 minute target needs timed human evidence; report
the absence of that evidence rather than claiming success. Push `main`.

## M5: distinguishing systems and content completion

Implement directional armor, tactical/strategic EW, hostile boarding/capture,
meaningful crew skills/traits, advanced modules and all six weapon families.
Add authored content variation, doctrines, mission branches, smuggling/customs
responses, deep-space discoveries, survivors and recovery choices. Keep one
complete player ship as the release baseline; additional ship classes are
optional unless a revised agreed release scope makes them mandatory.

Gate: each mechanic changes both the relevant UI and simulation; tests cover
its cost, counters and failure paths. Demonstrate at least one emergent
damage-control chain and one cross-layer cargo/risk decision. No pretend
implemented features behind inert controls. Push `main`.

## M6: release acceptance

Run type check, unit/integration suite, production build and real-browser E2E.
Test Chromium and another available engine; report unavailable coverage.
Exercise save corruption, quota errors, hidden-tab pause, restart disposal,
long battles, repeated station visits and low-resource recovery. Capture
reference/minimum-size screenshots, inspect them, and obtain gamer and quality
acceptance on real gameplay evidence. Re-run architecture/developer review on
implementation deviations and high-risk code.

Record performance hardware and measured frame/tick timings, active play time,
bugs fixed, residual risks and unmet GDD items in `release-status.md`. Supply
run/build instructions and a runnable local preview. Only call the game finished
when the required traceability rows and release gates have evidence. Push
`main` and verify the remote commit ID.

## GDD traceability ledger

Implementation updates must replace "pending" with exact code/test/evidence
references, or an explicit unmet status. Future-only content is not a blocker
when the GDD itself makes it future-only.

The implementation references below replace the original planning placeholders.
Measured outcomes and limits live in `release-status.md` and
`expedition-browser-evidence.md`; references are not claims of exhaustive
coverage. Human pacing/fun is explicitly unverified under the user's delivery
authorization.

| GDD sections | Requirement | Milestone | Implementation evidence |
|---|---|---|---|
| 1-3, 28, 30-31 | interconnected ship-command/explore/trade loop; emergent stories | M2-M6 | `careers.test.ts`, `expedition.spec.ts`, `emergency.spec.ts`; human story assessment unverified |
| 4 | complete Expedition, 90-180 minute pacing target | M4/M6 | `expedition.spec.ts` real-control victory/reload; human timing unverified |
| 4 | future Captain Mode architecture, not initial mode | M1 | `sim/types.ts`, `game/persistence.ts` independent serializable run |
| 5, 7 | region/system/tactical travel, risk, services | M3/M4 | `sim/game.ts`, `strategy.test.ts`, full browser route |
| 6 | progressive contacts, surveys, saleable intelligence | M3 | `content/expedition.ts`, `strategy.test.ts`, browser survey/data sale |
| 8 | ten goods, stock, dynamic prices/events, cargo mass, stale prices | M3/M4 | `content/region.ts`, `sim/game.ts`, strategy marginal-trade/reservation regressions |
| 9 | factions, legality/customs, all listed mission categories | M4/M5 | `sim/missions.ts`, `missions.test.ts`, freight/field-claim browser controls |
| 10 | physical derelict crew, salvage, lightweight mining | M3/M5 | `sim/missions.ts`, `tactical.test.ts`, `missions.test.ts`, explorer career |
| 11-12 | data-driven rooms/tiles/doors, atmosphere/fire/breach | M1/M2 | `content/ships.ts`, `sim/tactical.ts`, `controls.spec.ts`, `emergency.spec.ts` |
| 13 | persistent crew, seven skills, traits, physical tasks | M1/M2/M5 | `sim/types.ts`, `sim/tactical.ts`, tactical/mission regressions and emergency controls |
| 14 | reactor and nine core systems; advanced modules | M2/M5 | Passive cockpit plus powered systems in `content/ships.ts`; fitting/tactical tests |
| 15 | shields/evasion and six weapon families | M2/M5 | `content/weapons.ts`, `sim/tactical.ts`, tactical regressions and Laser/Ion browser targeting |
| 16 | directional armor and tactical/strategic EW | M5 | `sim/tactical.ts`, `sim/game.ts`, tactical/strategy regressions |
| 17 | pause, shared-rule AI, doctrines, retreat/surrender | M2/M5 | `game/controller.ts`, `retreat.test.ts`, `retreat.spec.ts`, persistence pause/queue browser case |
| 18 | boarding, crew combat, sabotage, capture, defeat | M2/M5 | `sim/tactical.ts`, tactical/retreat regressions, emergency recovery and `endings.spec.ts` |
| 19 | stations, shipyard, services, configuration careers | M3/M5 | `sim/game.ts`, `careers.test.ts`, prepared fitting/battle browser journey |
| 20 | seeded authored generation, one player ship, option-based progression | M1/M4/M5 | `content/region.ts`, 100-seed structure tests and 30 legal career victories |
| 21 | 20 Hz determinism, independent render, full combat saving | M1/M2/M6 | `game/controller.ts`, `persistence.test.ts`, `controls.spec.ts` combat continuation |
| 22 | typed simulation independent from Pixi/React, external content | M1 | `sim/`, `content/`, `render/Scene.tsx`, `ui/App.tsx`; strict build |
| 23 | original readable art, event-driven audio | M1/M2/M6 | `public/art/manifest.json`, `visual.spec.ts`, `game/audio.ts`, `audio.test.ts`; human listening unverified |
| 24 | complete first battle checklist | M2 | `battle.spec.ts`, `controls.spec.ts`, `emergency.spec.ts`; exact outcomes in release ledger |
| 25 | exact sandbox content and 20-30 minute pacing target | M3/M6 | 100-seed content checks and production commerce/survey; human timing unverified |
| 26 | staged implementation order | M0-M6 | this plan |
| 27 | explicit non-goals absent from required scope | all | architecture boundary |
| 29 | distinguishing systems actually interact | M5/M6 | `careers.test.ts`, physical emergency chain, retreat/stranding/priced recovery |
| 32 | engineering documents and contracts | M0 | Seven-document baseline; four explicit design ACCEPTs in `review-decisions.md` |

## Quantitative acceptance cases

- Replay: identical seed/commands produce byte-equivalent canonical simulation
  state after 10,000 ticks; exclude UI-only selections and wall-clock metadata.
- Save continuation: save at tick N, reload and replay the next 1,000 ticks;
  compare canonical state including PRNG, missiles, AI timers and rewards.
- Generation: at least 100 seeds satisfy archive/extraction/service reachability,
  unique IDs, valid room/route references and documented recovery constraints.
- Invariants: nonnegative finite hull/health/stock/cargo/fuel; power <= output;
  occupancy/path validity; each reward/contract resolves once; pressure bounds.
- Pause/focus: ten seconds wall time paused or hidden advances zero ticks;
  queued orders do not execute until explicit resume.
- Presentation: inspect at 1664x936 and 1280x720; all tactical controls reachable;
  no overlap with ships, tooltips or critical warnings; no console errors.
- Performance: record average and p95 frame/tick times on named hardware with
  representative combat/emergency scenes; target 60 FPS/20 Hz, disclose misses.
- Browser acceptance: start -> combat -> repair -> station -> trade -> survey ->
  derelict -> contract -> final objective -> extraction; plus defeat/reload.

## Consultation policy

Resolve ordinary implementation decisions autonomously within the reviewed
design. For a critical scope, rights, credentials or irreconcilable design
decision, contact the user at the address supplied in the conversation using an
authenticated mail tool, preserve the question and monitor that thread for a
reply. Do not commit the address, private replies or credentials. Do not claim
mail was sent or replies monitored unless the tool actually confirms it. If
mail capability is unavailable, state that blocker in chat rather than pretend
to wait for a nonexistent message. Never pause all independent work while a
nonblocking question is outstanding.
