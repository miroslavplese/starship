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

Graphics quality is selectable in the tactical view. Auto detects the adapter;
the visible rendered-FPS diagnostic counts actual scene submissions and settles
to zero when paused. Headful Iris Xe meets the measured performance target;
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
previous-slot recovery, quota failures and failed read-back without losing the
live expedition or claiming a successful save. Corrupt originals are preserved
in a bounded diagnostic slot so recovery can continue saving. Settings exposes
diagnostic export and explicitly confirmed discard without deleting good saves.
The persistence journey also checks pause/visibility overlap and queued orders
across reload. `tests/e2e/endings.spec.ts` uses bounded lethal-impact and
oxygen-loss fixtures to verify actual defeat, terminal autosave and reload.
`tests/e2e/away-team.spec.ts` verifies full-hold salvage rejection, blocked
recall, explicit paid extraction, reboarding, physical door authorization and
traversal, log recovery and normal recall through the production controls.
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
$env:PERFORMANCE='1'
$env:GRAPHICS_QUALITY='auto'
$env:PERFORMANCE_FIXTURE='baseline'
node .\node_modules\@playwright\test\cli.js test --project=chromium --headed --grep 'actual production battle rendering'
Remove-Item Env:PERFORMANCE,Env:GRAPHICS_QUALITY,Env:PERFORMANCE_FIXTURE
$env:SOAK='1'
node .\node_modules\@playwright\test\cli.js test --project=chromium --grep '25 production'
Remove-Item Env:SOAK
```

Verify the reported WebGL adapter rather than assuming headful hardware.
Hardware and software results, synthetic workload counts and memory limits
are recorded separately. Hosted CI is currently disabled by repository policy;
local passing results are not presented as a hosted CI run.

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