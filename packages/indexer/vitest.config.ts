import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The adapter tests moved to client/test/discovery/http.test.ts as part of
    // jinn-mono-280n.4. This package currently has no test files of its own;
    // passWithNoTests lets CI pass until handler integration tests arrive.
    passWithNoTests: true,
  },
});
