import { afterEach, vi } from 'vitest';

// lib/db and anything importing it (lib/fac-usage, lib/auth-guard, …)
// import 'server-only', which throws outside a real RSC build. Stub it
// globally so pure helpers in those modules stay unit-testable — the
// same thing test/auth-guard.test.ts did locally before this.
vi.mock('server-only', () => ({}));

// Environment for tests
process.env.DATABASE_URL = ':memory:';
process.env.NEXTAUTH_SECRET = 'test-secret-min-32-chars-long-ok';
process.env.FAC_API_KEY = 'test-key';

afterEach(() => {
  vi.clearAllMocks();
});
