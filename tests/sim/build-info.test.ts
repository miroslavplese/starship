import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { buildInfo } from '../../tools/build-info';

it('uses the package version, exact revision, UTC time and an explicitly enabled developer flag', async () => {
  const time = new Date('2026-11-03T01:02:03.004Z');
  const env = { GITHUB_SHA: '123456789abcdef', GITHUB_RUN_NUMBER: '42', GITHUB_RUN_ATTEMPT: '2' };
  const info = buildInfo(process.cwd(), env, time);
  expect(info).toMatchObject({ revision: env.GITHUB_SHA, builtAt: time.toISOString(), diagnostics: false });
  expect(info.build).toBe('42.2.20261103010203004-1234567');
  expect(info.version).toBe(JSON.parse(await readFile('package.json', 'utf8')).version);
  expect(buildInfo(process.cwd(), { ...env, VITE_STARSHIP_DIAGNOSTICS: 'true' }, time).diagnostics).toBe(false);
  expect(buildInfo(process.cwd(), { ...env, VITE_STARSHIP_DIAGNOSTICS: '1' }, time).diagnostics).toBe(true);
});

it('two real production builds emit changing metadata matching their compiled About screens and feature flags', async () => {
  const root = await mkdtemp(join(tmpdir(), 'starship-build-info-'));
  const original = process.env.VITE_STARSHIP_DIAGNOSTICS;
  const results: ReturnType<typeof buildInfo>[] = [];
  try {
    for (const flag of ['0', '1']) {
      process.env.VITE_STARSHIP_DIAGNOSTICS = flag;
      const outDir = join(root, flag);
      await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
      const info: ReturnType<typeof buildInfo> = JSON.parse(await readFile(join(outDir, 'build-info.json'), 'utf8'));
      const assets = join(outDir, 'assets');
      const scripts = await Promise.all((await readdir(assets)).filter(name => name.endsWith('.js')).map(name => readFile(join(assets, name), 'utf8')));
      expect(scripts.join('\n')).toContain(info.builtAt);
      expect(scripts.join('\n')).toContain(info.build);
      expect(info.diagnostics).toBe(flag === '1');
      expect(info.revision).toMatch(/^[a-f0-9]{40}$/);
      results.push(info);
    }
    expect(results[1].version).toBe(results[0].version);
    expect(results[1].builtAt).not.toBe(results[0].builtAt);
    expect(results[1].build).not.toBe(results[0].build);
  } finally {
    if (original === undefined) delete process.env.VITE_STARSHIP_DIAGNOSTICS;
    else process.env.VITE_STARSHIP_DIAGNOSTICS = original;
    await rm(root, { recursive: true, force: true });
  }
}, 60000);
