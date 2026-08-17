import { describe, it, expect } from 'vitest';

describe('Smoke Tests', () => {
  it('should have required env vars', () => {
    expect(process.env.NEXTAUTH_SECRET).toBeDefined();
    expect(process.env.DATABASE_URL).toBeDefined();
  });

  it('should pass basic sanity check', () => {
    const fac = { ein: '123456789', year: 2024 };
    expect(fac.ein).toHaveLength(9);
    expect(fac.year).toBeGreaterThan(2000);
  });
});
