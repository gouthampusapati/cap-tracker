import { expect, afterEach, vi } from 'vitest';

// Mock environment variables for tests
process.env.DATABASE_URL = ':memory:';
process.env.NEXTAUTH_SECRET = 'test-secret-min-32-chars-long-ok';
process.env.FAC_API_KEY = 'test-key';
process.env.NODE_ENV = 'test';

// Cleanup after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock better-sqlite3 if it fails to load
vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(),
    })),
  })),
}), { virtual: true });
