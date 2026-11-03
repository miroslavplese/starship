import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { buildInfo } from './tools/build-info';
export default defineConfig(({ mode }) => {
  const info = buildInfo(process.cwd(), { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env });
  return {
    base: process.env.STARSHIP_BASE_PATH ?? '/',
    define: {
      __STARSHIP_BUILD__: JSON.stringify(info),
      __STARSHIP_DIAGNOSTICS__: JSON.stringify(info.diagnostics),
    },
    plugins: [react(), {
      name: 'starship-build-info',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build-info.json', source: JSON.stringify(info, null, 2) });
      },
    }],
    test: { include: ['tests/sim/**/*.test.ts'], maxWorkers: 1, fileParallelism: false, testTimeout: 30000 },
  };
});
