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

```powershell
npm test
npx playwright install chromium firefox
npm run test:e2e
```

Space pauses; 1–3 select crew; Q/E select weapons; M/J opens navigation;
F saves; Escape cancels targeting/closes a panel. Equivalent visible controls
and an accessible room list are available in Ship Systems.

Start at Haven, prepare through trading/contracts/surveys, obtain the three
archive coordinates in Verdant/Vesper/Nacre, resolve the Terminus guardian,
recover the beacon archive and return to Haven. Paused tactical orders queue
until resume; station/map dialogs pause the interaction without erasing manual
pause.

**Release status:** implementation and acceptance are tracked honestly in
[`docs/release-status.md`](docs/release-status.md). Human pacing/fun has not
been verified; the GDD's 90–180 minute Expedition and 20–30 minute sandbox
durations are targets, not measured claims.

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