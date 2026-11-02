# Full Expedition browser acceptance

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
