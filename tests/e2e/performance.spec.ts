import { expect, test } from '@playwright/test';
import { command, createGame, step } from '../../src/sim/game';
import { encode } from '../../src/game/persistence';
import { closeDialog, beginExpedition, enableDiagnostics } from './journeys';

test('actual production battle rendering cadence', async ({ page, browserName }) => {
  test.skip(process.env.PERFORMANCE !== '1' || browserName !== 'chromium', 'Run explicitly with PERFORMANCE=1 in Chromium.');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await beginExpedition(page);
  await page.getByRole('button', { name: 'Skip introduction' }).click();
  if (process.env.PERFORMANCE_FIXTURE === 'baseline') {
    const state = createGame(12345);
    expect(command(state, { type: 'travel', destination: 's0-pirate', system: false }).ok).toBe(true);
    for (let tick = 0; tick < 140; tick++) step(state);
    for (const ship of state.ships) ship.weapons = [];
    state.projectiles = Array.from({ length: 32 }, (_, i) => {
      const source = state.ships[i % 2], target = state.ships[(i + 1) % 2];
      return { id: `benchmark-${i}`, source: source.id, target: target.id, room: target.rooms[i % target.rooms.length].id, family: 'ion' as const, remaining: 1500 + i * 75, total: 5000 };
    });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'baseline.json', mimeType: 'application/json', buffer: Buffer.from(encode(state)) });
    await expect(page.locator('.dialog-footer')).toContainText('Imported validated run');
    await closeDialog(page);
  }
  await enableDiagnostics(page, process.env.GRAPHICS_QUALITY ?? 'performance');
  if (process.env.PERFORMANCE_FIXTURE !== 'baseline') {
    await page.getByRole('button', { name: /NAVIGATION/ }).click();
    await page.locator('.contact-card').last().getByRole('button', { name: 'SET COURSE' }).click();
  }
  await expect(page.locator('.enemy-readout')).toContainText('CONTACT HULL', { timeout: 60000 });
  await page.getByRole('button', { name: /RESUME/ }).click();
  await page.waitForTimeout(5000);
  const measurements = await page.evaluate(async () => {
    const canvas = document.querySelector('.tactical-scene canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    const deltas: number[] = [], fps: number[] = [];
    const end = performance.now() + 15000;
    let prior = performance.now();
    while (performance.now() < end) {
      await new Promise<void>(resolve => requestAnimationFrame(now => { deltas.push(now - prior); prior = now; resolve(); }));
      const current = Number(document.querySelector('[data-testid="tactical-rendered-fps"]')?.getAttribute('data-rendered-fps'));
      if (Number.isFinite(current)) fps.push(current);
    }
    deltas.sort((a, b) => a - b);
    return {
      renderedAverage: fps.reduce((sum, value) => sum + value, 0) / fps.length,
      displayRafAverage: 1000 / (deltas.reduce((sum, value) => sum + value, 0) / deltas.length),
      p95FrameMs: deltas[Math.floor(deltas.length * 0.95)],
      samples: deltas.length,
      userAgent: navigator.userAgent,
      webglRenderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      webglVendor: gl && debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : 'unavailable',
      renderer: document.querySelector('.graphics-diagnostics')?.textContent,
    };
  });
  const workload = process.env.PERFORMANCE_FIXTURE === 'baseline' ? 'Validated synthetic 2-ship/6-crew/32-projectile fixture; native guns absent, no in-window impacts' : 'Actual generated battle, variable projectile count';
  console.log(JSON.stringify({ workload, ...measurements }));
  await test.info().attach('render-performance.json', { body: JSON.stringify({ workload, ...measurements }, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: 'test-results/performance-battle.png' });
  expect(Math.round(measurements.renderedAverage)).toBeGreaterThanOrEqual(60);
  expect(measurements.p95FrameMs).toBeLessThanOrEqual(20);
});
