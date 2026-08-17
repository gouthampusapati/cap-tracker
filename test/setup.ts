import { expect, afterEach, vi } from 'vitest';

// Mock environment variables
process.env.DATABASE_URL = ':memory:';
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.FAC_API_KEY = 'test-key';

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});
