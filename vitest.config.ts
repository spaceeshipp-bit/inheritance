import { defineConfig } from 'vitest/config';

// Several tests play whole matches, run real servers or do thousands of random
// edits; they take seconds, and on a loaded machine (CI, e2e running alongside)
// the default 5 s timeout fails them for no reason. A hang still fails.
export default defineConfig({ test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', testTimeout: 30_000, hookTimeout: 30_000 } });
