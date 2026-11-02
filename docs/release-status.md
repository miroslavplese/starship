# STARSHIP implementation evidence

This ledger records actual implementation evidence, not release approval. The
accepted M0 design remains authoritative. AI reviewers are not human players.

## Current status

The application now has a playable tactical/strategic implementation. Full
release acceptance is **not yet granted**. In particular, human pacing/fun
validation and the complete M6 matrix remain unverified. The first implementation
checkpoint includes integrated work beyond M1; this does not pre-approve later
milestones.

## Foundation checkpoint

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
have not occurred. Performance/soak, cross-browser, full new-run browser
victory, negative persistence matrix, actual implementation reviewer agreement,
and final traceability sign-off are still pending.

No Captain Mode, multiplayer, additional player ship classes or permanent
stat-bonus meta progression is claimed.
