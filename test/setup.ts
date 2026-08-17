import { afterEach, vi } from 'vitest';

// Environment for tests
process.env.DATABASE_URL = ':memory:';
process.env.NEXTAUTH_SECRET = 'test-secret-min-32-chars-long-ok';
process.env.FAC_API_KEY = 'test-key';

afterEach(() => {
  vi.clearAllMocks();
});
