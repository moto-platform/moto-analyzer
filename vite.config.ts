/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

/** Tag (or short commit) of the pinned moto-vehicle-defs submodule, shown in the UI. */
function defsRef(): string {
  const cwd = 'external/moto-vehicle-defs';
  for (const cmd of ['git describe --tags --exact-match', 'git rev-parse --short HEAD']) {
    try {
      return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      // try the next form
    }
  }
  return 'unknown';
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __DEFS_REF__: JSON.stringify(defsRef()),
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
