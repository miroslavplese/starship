# STARSHIP

A desktop-browser tactical starship command Expedition. React supplies the
accessible command deck; Pixi renders original ship/crew/space art; the seeded
TypeScript simulation runs independently at 20 Hz.

## Run

Requires Node.js 20.19+ (or 22.12+) and npm.

```powershell
npm ci
npm run dev
```

Open the printed local URL. Production: `npm run build`, then `npm run preview`.
The generated `dist` is a static site; no account/backend/asset CDN is used
during play. Keep local-save JSON exports as backups.

## GitHub Pages

`.github/workflows/pages.yml` builds/tests `main`, reads the site's configured
base path, uploads `dist` and deploys using GitHub Pages. On an eligible
repository, enable **Settings > Pages > Source > GitHub Actions**, then push
`main` or run **Deploy GitHub Pages** manually. The workflow reports the actual
site URL; a successful source push alone does not mean the site is live.

**Play:** [STARSHIP on GitHub Pages](https://miroslavplese.github.io/starship/).
The public source is [miroslavplese/starship](https://github.com/miroslavplese/starship).
On 2026-11-02 the complete source history was copied to the personal account
after the managed work account could not publish Pages. The private source
repository remains intact as a backup. The personal-account
[Pages deployment](https://github.com/miroslavplese/starship/actions/runs/41545289678)
passed its unit tests, production build and deployment. Historical platform
failures and acceptance limitations remain in the release-status ledger.

To verify a project-path deployment locally:

```powershell
$env:STARSHIP_BASE_PATH='/starship/'
npm run build
npm run preview
# Open the printed URL with /starship/ appended.
# In another shell, set the same STARSHIP_BASE_PATH and run:
node .\node_modules\@playwright\test\cli.js test pages.spec.ts
Remove-Item Env:STARSHIP_BASE_PATH
```

Default builds still use `/`. Art and service-worker URLs follow the configured
base; offline caches are isolated by deployment path so another Pages project
on the same origin is not cleared. Saves remain local to each browser/origin:
export/import JSON to move an expedition from localhost to the hosted site.
Hosting does not make the desktop layout phone-responsive.

The cinematic main menu offers New Game, Load Game (including JSON import and
backup recovery), Settings and About. New Game offers the full
Cartographer expedition, a planetary survey, flight-recorder recovery, convoy
escort, or a seed-generated choice among those commissions. Missions use actual
contract objectives and deadlines, leave the campaign available, and survive
save/load without changing the save format. Browsing setup never overwrites a
save. Beginning another run saves it under a new, seed-independent identity
after keeping current live progress; existing expeditions are not replaced.

Load Game lists each expedition with a single **Load** action, mission,
location, seed, progress and known saved/import time. Save and live export belong
in Settings, not Load Game. Each expedition has its own current and previous
checkpoint; manual saves, autosaves and endings stay with the selected expedition.
Imports create independent expeditions, even for an identical seed/save file.
Legacy current, previous and quarantined bytes are never removed or overwritten:
read-only browsing exposes readable snapshots; the first load/write makes
verified, idempotent migration copies. Unknown legacy dates remain unknown.
**Backups and damaged-save recovery** separates earlier checkpoints from ordinary
loading, and appears only when backups or damaged data exist. The normal file
import also accepts recovery backups in an empty library. Loading a checkpoint creates a new expedition instead of rewinding the
latest save. Recovery backup downloads include all raw saved/damaged bytes;
their importer adds readable copies, reports unreadable data and can resume a
partial import without duplicating verified copies. Keep the original file.
Previously overwritten history cannot be reconstructed; other browsers,
devices and origins have separate storage and may hold other saves.

Navigation, dock/operations, journal and field manual are icon buttons immediately
left of Settings. Navigation shows actual known interstellar routes and a local
orbital schematic; selecting a node highlights its course card, where existing
travel costs and gates apply. Select crew then a room for an anchored order popup,
or use the keyboard-accessible room list in Ship Systems. The transparent,
scrollable ship log overlays the scene below the expedition/contact tile without
reserving header or scene space. All five top action buttons have 48px hit targets.
Accepted crew orders close the popup and return focus to the selected crew;
rejected orders leave it open with visible feedback.

Wayfarer's compartment display follows its original hull: engines and reactor
are aft beside the left exhaust, with cockpit and sensors toward the right bow,
weapons/life support amidships and medbay forward. The renderer reflects complete
room bounds, including crew, doors, hazards, targeting and order anchors; labels
and hull art remain unflipped. Simulation geometry, stable room IDs, adjacency,
room volumes and travel timing stay unchanged, so existing saved expeditions
need no migration. Other ships retain their own display orientation.

Graphics quality is selectable in Settings. Auto detects the adapter;
developer tools are absent from ordinary builds. Only an explicit
`VITE_STARSHIP_DIAGNOSTICS=1` build offers the diagnostics section in Settings,
including an initially off rendered-FPS checkbox. Pages explicitly disables the
flag. FPS counts actual scene submissions and settles to zero when paused. Screen
changes fade out and in, block input during transition and respect reduced motion.
Headful Iris Xe meets the previously measured performance target;
headless software rendering currently does not.

```powershell
npm test
npx playwright install chromium firefox
npm run build
npm run test:e2e
```

`tests/e2e/expedition.spec.ts` completes a new Expedition using production
controls, including freight, all three coordinates, survey/fuel preparation,
save/continue, guardian passage, archive extraction and a persisted victory.
It uses the player's safe-speed control, not hidden state or fixture saves.
`tests/e2e/persistence.spec.ts` uses UI-created saves to verify rejected imports,
legacy current/previous migration, distinct same-seed expeditions, selected-save
autosave routing, backup recovery, quota failures and failed read-back without
losing the live expedition or claiming a successful save. Damaged originals are
retained, with player-facing backup export/import and no destructive removal UI.
Storage conflicts offer download or saving live progress as a separate
expedition; they do not silently replace another window's newer version.
The persistence journey also checks pause/visibility overlap and queued orders
across reload. `tests/e2e/endings.spec.ts` uses bounded lethal-impact and
oxygen-loss fixtures to verify actual defeat, terminal autosave and reload.
`tests/e2e/away-team.spec.ts` verifies full-hold salvage rejection, blocked
recall, explicit paid extraction, reboarding, physical door authorization and
traversal, log recovery and normal recall through the production controls.
`tests/e2e/interface.spec.ts` covers pre-run menus/credits/settings, save-safe
setup, selected-mission completion and reload, both visual map levels,
settings-driven rendering, viewport-clamped room orders, modal focus and fades.
`tests/e2e/corrections.spec.ts` measures equal toolbar dimensions and scene/footer/
log rectangles at 1280x720, 1440x1080 and 2263x1462, samples the actual rendered
scenery in both former letterbox bands, and checks canvas room targeting,
accepted/rejected orders, player copy and build metadata.
About displays the package version, automatic timestamped build identifier,
revision and UTC build time. Vite emits matching `build-info.json`; every build
regenerates it, and CI includes its run number/attempt. A two-production-build
test checks changed metadata and compiled About values, without a manual release
metadata update.
`tests/sim/scenarios.test.ts` checks distinct generated objectives and full-state
save continuation without changing the existing campaign.
For parallel worktrees, set `STARSHIP_TEST_PORT` to an unused preview port.
See [browser journey evidence](docs/expedition-browser-evidence.md) for measured
results and their limits.

Space pauses; 1–3 select crew; Q/E select weapons; M/J opens navigation;
F saves; Escape cancels targeting/closes a panel. Equivalent visible controls
and an accessible room list are available in Ship Systems.

Start at Haven, prepare through trading/contracts/surveys, obtain the three
archive coordinates in Verdant/Vesper/Nacre, resolve the Terminus guardian,
recover the beacon archive and return to Haven. Paused tactical orders queue
until resume; station/map dialogs pause the interaction without erasing manual
pause.

**Delivery authorized with limitations:** on 2026-11-02 the user explicitly
authorized delivery with human-only pacing/fun gates marked **unverified**.
Implementation and engineering evidence are tracked in
[`docs/release-status.md`](docs/release-status.md). Human pacing/fun has not
been verified; the GDD's 90–180 minute Expedition and 20–30 minute sandbox
durations are targets, not measured claims.

Opt-in diagnostics are separate from the normal browser suite:

```powershell
$env:VITE_STARSHIP_DIAGNOSTICS='1'
npm run build
$env:EXPECT_DIAGNOSTICS='1'
node .\node_modules\@playwright\test\cli.js test --grep 'developer feature flag'
Remove-Item Env:EXPECT_DIAGNOSTICS
$env:PERFORMANCE='1'
$env:GRAPHICS_QUALITY='auto'
$env:PERFORMANCE_FIXTURE='baseline'
node .\node_modules\@playwright\test\cli.js test --project=chromium --headed --grep 'actual production battle rendering'
Remove-Item Env:PERFORMANCE,Env:GRAPHICS_QUALITY,Env:PERFORMANCE_FIXTURE
$env:SOAK='1'
node .\node_modules\@playwright\test\cli.js test --project=chromium --grep '25 production'
Remove-Item Env:SOAK
Remove-Item Env:VITE_STARSHIP_DIAGNOSTICS
npm run build
```

Verify the reported WebGL adapter rather than assuming headful hardware.
Hardware and software results, synthetic workload counts and memory limits
are recorded separately. Hosted CI was disabled by policy on the original
work-account repository; the personal repository now runs hosted workflows.
Local passing results are not presented as hosted CI results.

Tactical starship command, exploration and trading roguelike for desktop browsers.

## Design baseline

- [Game Design Document](STARSHIP_GDD.md)
- [Technical architecture](docs/architecture.md)
- [Components and interfaces](docs/components.md)
- [Player and system flows](docs/flows.md)
- [Concrete gameplay rules](docs/gameplay-rules.md)
- [Implementation milestones](docs/implementation-plan.md)
- [Requirements and acceptance](docs/validation.md)
- [Independent review decisions](docs/review-decisions.md)
- [Supplied combat UI reference](docs/reference/combat-mockup.png)

The design is accepted for implementation by architecture, software-developer,
gamer and game-quality AI reviewers. Development and measured release acceptance
remain separate milestones; design acceptance does not imply release acceptance.