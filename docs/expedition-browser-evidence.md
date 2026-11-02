# Full Expedition browser acceptance

## Final immutable-artifact verification, 2026-11-02

### Corrected final source: 75eac32

After the final queued-fitting/market-record guards and equivalent crew-sort
hoist, the parent repeated the entire matrix against source
`75eac32a3de22296a487ef138cc8341950fd0a1e`, not the earlier bundle:

| Asset | SHA-256 |
|---|---|
| `index-BIF077lt.js` | `4F8D3280BF828848B204E64803F585CE2A216A5F03798CEBC29B41A2BD82C03A` |
| `index-CXeRX3E1.css` | `8C83B6D6627EBD493518DB33C86EE88B86AAE435AAC0525C47E1891CB5201FE3` |

Offline cache: `starship-4e71928d8add280e`. The same command below passed
**14/14 in 6.6 minutes**, both engines and viewports. Invalid-import coverage
now has **14 cases**, adding queued fittings named `constructor`, `toString`
and `__proto__`, with matching queue metadata so rejection exercises the
content guard. Every rejection retains live/current/previous bytes.

The independent final Vitest run passed **199/199 in 57.88 seconds**, exit 0.
An earlier concurrent attempt reached 199 passing assertions but exited 1
with a Vitest worker `onTaskUpdate` RPC timeout; it is retained as a runner
failure, not counted as a clean pass. The successful repeat did not change
source, tests or thresholds. Clean strict TypeScript/Vite/offline-cache build
and final named-hardware timing evidence are recorded in `release-status.md`.

The final corrections do not change art/layout. The six bounded visual
captures below were taken on ec8f04c; they are not relabeled as screenshots
from the later JavaScript bundle. Full final-build gameplay/recovery/defeat
journeys were rerun as stated above.

### Prior final-candidate checkpoint: ec8f04c

The independent parent reviewer integrated source
`ec8f04c73a2d850cc4c015336903b4bc74921775` and verified the copied clean
production artifact before serving it statically on port 4184:

| Asset | SHA-256 |
|---|---|
| `index-CXpUTCCZ.js` | `A132FB30F79962F504FD22862CB8F31B42379B726143865C26BCA99F0CEA3349` |
| `index-CXeRX3E1.css` | `8C83B6D6627EBD493518DB33C86EE88B86AAE435AAC0525C47E1891CB5201FE3` |

Offline cache identity: `starship-d903bb93dfbf43fb`.

```powershell
$env:STARSHIP_TEST_PORT='4184'
node .\node_modules\@playwright\test\cli.js test expedition.spec.ts persistence.spec.ts endings.spec.ts --reporter=line
```

**14/14 passed in 6.0 minutes**, with one worker: seven cases in Chromium at
1664x936 and the same seven in Firefox at 1280x720. These results supersede the
older-artifact rerun obligations below for these particular journeys:

- The fixture-free new-run-to-victory Expedition, archive hand-in and terminal
  reload described below passed again through actual production controls.
- Eleven invalid imports now include unknown cargo and fitted-module IDs.
  Every rejection preserves the live exported run and both known-good slots.
- Corrupt-primary recovery preserves original bytes, allows a successful
  subsequent save, exports the diagnostic, and checks both cancellation and
  confirmed discard. Valid primary/previous slots and live state remain intact.
- Quota, missing read-back and invalid read-back report save failure without
  losing the live run or previous known-good slot.
- Captain pause survives overlapping modal/visibility changes and ten seconds
  of real waiting. A queued power order survives save/reload unchanged and
  executes only after explicit resume.
- Bounded validated fixtures use a genuine imminent missile impact for hull
  loss and oxygen depletion for crew loss. Actual resume/clock processing
  produces defeat, immediate terminal autosave and the same debrief after
  reload. These are deliberately not fixture-free campaign journeys.

The independent final regression run also passed **192/192 tests in 86.81
seconds** across seven Vitest files. The developer's clean strict TypeScript,
Vite and offline-cache build supplied the fingerprinted artifact; the parent
does not claim its incomplete local dependency restore or clean build passed.
This browser matrix does not replace separate combat, retreat, emergency,
visual, performance or human assessments. Human pacing/fun remains unverified
under the user's explicit delivery authorization.

## Bounded final visual assessment

The parent inspected all six production captures from `visual.spec.ts`:
Chromium 1664x936 and Firefox 1280x720, each showing pristine combat,
selection/targeting and the physical fire/breach drill at High/full resolution.
The images are retained in the development session's private artifacts as
`{chromium,firefox}-{pristine-combat,targeting,fire-breach}.png`.
The assessment uses the eight separate categories in `validation.md`; no
aggregate score substitutes for an individual category.

| Category | Score | Observed acceptance |
|---|---:|---|
| Composition | 2 | Player and enemy ships remain distinct, with telemetry, threat information and bottom command instruments separated. |
| Original hull detail | 2 | Authored hull silhouettes and surface detail distinguish the ships from their room overlays; these are not flat placeholder rectangles. |
| Interiors | 2 | Compartment boundaries, doors and system marks remain readable; the fire/breach inspector identifies the affected compartment. |
| Crew | 2 | Crew sprites and selectable roster entries are distinguishable; selection and location feedback remain visible. |
| Effects | 2 | Shield/target feedback and the fire/breach state are visually distinct from normal compartments; warnings also use text. |
| HUD | 2 | Consistent framed command panels separate resources, system allocation and weapon state; the 720p instruments remain inside the viewport. |
| Environment | 2 | Original space/hull assets provide depth without obscuring the tactical geometry; provenance is recorded in `public/art/manifest.json`. |
| Interaction/access | 2 | Labels and dialogs remain usable at both viewports; collapsed drill instructions leave room controls available. Browser assertions also check layout bounds and accessible controls. |

This is an AI visual assessment of these bounded states, not human aesthetic
approval or proof of every animation frame, display scale or hardware path.
The separate real-control targeting/emergency tests provide interaction
evidence; still images alone do not prove hit testing or simulation behavior.
Final victory debrief captures were also inspected at both viewports without
clipped headings or terminal action buttons.

## Observed results, 2026-11-01

The independent parent reviewer ran
`tests/e2e/expedition.spec.ts` against a production-built static artifact, not
the development server. Both runs passed:

| Browser | Viewport | Result | Runner duration |
|---|---|---|---|
| Chromium | 1664x936 | 1 passed | 1.4 minutes |
| Firefox | 1280x720 | 1 passed | 2.2 minutes |

These are automated acceptance durations using the actual SAFE SPEED 8x
control. They are **not human playtest, fun or 90-180 minute pacing evidence**.
The inspected Firefox victory screenshot reports 6.2 active simulation minutes
for this deliberately efficient chart/negotiation route.

## What the journey proves

The test starts a new seed-12345 run through the title screen. All actions use
visible production controls, keyboard save, and displayed progress/status.
There is no imported fixture, direct simulation call, hidden state inspection,
clock injection or teleport.

1. Accept freight at Haven, travel to the actual destination, claim it, assert
   the completion message and credits increasing from 60 to 92.
2. Charge working FTL and follow legal routes through Cinder, Verdant, Orison
   and Vesper; purchase two separate coordinates and assert progress.
3. Visit Vesper I, explicitly evade the approaching threat, investigate it,
   verify its journal entry, return to a station, sell data and refuel to 10.
4. Visit Nacre, acquire the third coordinate, save through settings, reload the
   page, continue and verify all three coordinates remain.
5. Enter The Veil and Terminus, negotiate the guardian, travel to the beacon,
   recover the archive and assert that this alone is not Expedition victory.
6. Return by legal routes to Haven, hand in the archive and assert the
   "THE ARCHIVE IS HOME" debrief. Save using the documented F key, reload and
   continue to the same terminal result.

Both runs assert no uncaught page errors. The 1280x720 debrief screenshot was
visually inspected: heading, resource/crew/coordinate summary and both action
buttons are visible without clipping. This is not a blanket visual acceptance
of all combat/emergency screens.

## Artifact identity and reproducibility limits

The tested static `dist` was copied into the parent review worktree from the
development worktree after source checkpoint `9399f8b`; subsequent development
changes were still in flight. Its principal JavaScript asset was
`index-DTKu5vgp.js`, SHA-256
`6759e1fe5bdc998389dfa45cd872a1fca7b14dc9bc8fa3643015a746128bb974`.
CSS `index-BQqGFtrE.css` had SHA-256
`2c63a65eaf060347b1604c8c35677ee7eeecefd74dca3515c10aa947412f24c2`.
These fingerprints identify the tested artifact; they do not imply that
uncommitted source changes were part of `9399f8b`.

The parent used installed Playwright and a direct Vite preview on isolated port
4184 after a separate dependency restore stalled in optional-platform reify.
This did not change game code or justify reporting the restore as passed.
An initial test assertion incorrectly expected a completed origin contract to
remain visible at the destination. It was corrected to check the actual
completion message and resource accounting; no game change was needed.

Re-run this committed test against the final source commit's clean production
build before final release acceptance. Other gates (combat spatial targeting,
performance/soak, negative persistence cases, remaining reviewer findings and
human-only pacing/fun validation) remain independent obligations.

## Independent browser persistence matrix, 2026-11-01

The parent reviewer added `tests/e2e/persistence.spec.ts` and ran it against the
live implementation preview on port 5173. Both configured browser projects
passed all three tests:

| Browser | Viewport | Result | Runner duration |
|---|---|---|---|
| Chromium | 1664x936 | 3 passed | 4.8 minutes |
| Firefox | 1280x720 | 3 passed | 7.9 minutes |

These are working-tree development-preview results, **not an immutable
production-artifact sign-off**. Re-run them with the final production build.
The tests create the baseline expedition and saves through actual controls;
they never create game state through a simulation API.

- Nine invalid imports cover malformed JSON, unknown envelope/content versions,
  incorrect checksum, nonfinite numeric input, duplicate crew identities,
  broken room references, out-of-bounds health and the 1 MiB import limit.
  Correct checksums are generated for invalid payload fixtures so those cases
  exercise state validation rather than only checksum rejection. Each case
  asserts explicit failure, byte-identical exported live state and preservation
  of both known-good slots.
- A deliberately corrupt primary slot produces a visible load error without
  replacing the live run. Previous-slot recovery produces the same exported
  expedition, remains paused, and preserves both the corrupt diagnostic bytes
  and the good previous slot.
- Browser Storage faults simulate quota exhaustion, missing read-back and
  invalid read-back. Each asserts an explicit failed-save message, unchanged
  exported live run and retention of the previous known-good bytes. Interrupted
  primary writes also retain the prior primary.

These bounded storage/import fixtures are intentionally different from the
fixture-free full Expedition journey. They do not prove the entire combat
save-continuation matrix or browser soak.

## Hosted CI availability

The GitHub Actions run for `8368d47` failed before executing any workflow steps.
Its check annotation states: "GitHub Actions hosted runners are disabled for
this repository. For more information please contact your GitHub Enterprise
Administrator." [Run 41372877014](https://github.com/miplese_microsoft/starship/actions/runs/41372877014)
therefore supplies no build or test result. Local results above are reported
independently; unavailable hosted CI is not a passing check or a demonstrated
game-code failure.
