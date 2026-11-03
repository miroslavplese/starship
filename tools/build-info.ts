import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function buildInfo(root: string, env: NodeJS.ProcessEnv, now = new Date()) {
  const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };
  const revision = env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const builtAt = now.toISOString();
  const timestamp = builtAt.replace(/\D/g, '');
  const number = env.GITHUB_RUN_NUMBER ? `${env.GITHUB_RUN_NUMBER}.${env.GITHUB_RUN_ATTEMPT || '1'}.${timestamp}` : timestamp;
  return {
    version,
    build: `${number}-${revision.slice(0, 7)}`,
    revision,
    builtAt,
    diagnostics: env.VITE_STARSHIP_DIAGNOSTICS === '1',
  };
}
