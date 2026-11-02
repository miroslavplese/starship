import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: process.env.STARSHIP_BASE_PATH ?? '/',
  plugins: [react()],
  test: { include: ['tests/sim/**/*.test.ts'], maxWorkers: 1, fileParallelism: false, testTimeout: 30000 },
});
