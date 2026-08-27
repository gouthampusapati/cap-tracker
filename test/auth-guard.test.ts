import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Covers lib/auth-guard.ts's core decision: guest/never-verified
 * identities are untouched (pre-existing trust model), Google- or
 * magic-link-verified identities require a matching session. See
 * /Users/Bunnu/.claude/plans/staged-baking-lake.md for the full design
 * rationale — including why "verified" means checking two different
 * signals (an `accounts` row for Google, `users.emailVerified` for
 * magic-link, since Auth.js's email-provider flow never creates an
 * `accounts` row at all).
 *
 * Mocks '@/lib/db' with a minimal chainable stub — auth-guard.ts's
 * queries all end in a single `.limit(1)` (with or without an
 * `.innerJoin()` in between), so one shared results queue, consumed in
 * call order, is enough to drive every test case without modeling
 * Drizzle's real query builder. Query order for a verified-check path is
 * always: [user/entity lookup] → [accounts lookup] → [emailVerified
 * lookup, only reached when accounts came back empty].
 */

// lib/auth-guard.ts (and lib/db) import 'server-only', which throws
// unconditionally outside Next.js's own build (it relies on a webpack
// resolve condition Next sets, which Vitest's plain Node resolution
// doesn't) — see lib/db/index.ts's comment on why that guard exists.
// No-op it for this test file the same way as importing it for real.
vi.mock('server-only', () => ({}));

const queryQueue: unknown[][] = [];
function queueResult(rows: unknown[]) {
  queryQueue.push(rows);
}

vi.mock('@/lib/db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => queryQueue.shift() ?? [],
  };
  return { db: chain };
});

const mockAuth = vi.fn();
vi.mock('@/auth', () => ({ auth: () => mockAuth() }));

const { authorizeEmailAccess, authorizeFindingAccess, authorizeCapItemAccess } = await import(
  '@/lib/auth-guard'
);

beforeEach(() => {
  queryQueue.length = 0;
  mockAuth.mockReset();
});

describe('authorizeEmailAccess', () => {
  it('allows a request for an email with no users row yet (first-time guest/typed-email)', async () => {
    queueResult([]); // users lookup: no row
    const result = await authorizeEmailAccess('new@example.org');
    expect(result).toEqual({ email: 'new@example.org' });
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('allows a request for an existing user with no linked account and no verified email', async () => {
    queueResult([{ id: 'u1' }]); // users lookup: found
    queueResult([]); // accounts lookup: no linked account
    queueResult([{ emailVerified: null }]); // fallback emailVerified check: unset
    const result = await authorizeEmailAccess('guest-abc@anonymous.local');
    expect(result).toEqual({ email: 'guest-abc@anonymous.local' });
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('allows a Google-linked user when the session matches', async () => {
    queueResult([{ id: 'u1' }]);
    queueResult([{ userId: 'u1' }]); // linked account exists — emailVerified fallback never queried
    mockAuth.mockResolvedValue({ user: { email: 'real@gmail.com' } });

    const result = await authorizeEmailAccess('real@gmail.com');
    expect(result).toEqual({ email: 'real@gmail.com' });
  });

  it('rejects a Google-linked user with no session (the gap this closes)', async () => {
    queueResult([{ id: 'u1' }]);
    queueResult([{ userId: 'u1' }]);
    mockAuth.mockResolvedValue(null);

    const result = await authorizeEmailAccess('victim@gmail.com');
    expect('response' in result).toBe(true);
    if ('response' in result) expect(result.response.status).toBe(401);
  });

  it('rejects a Google-linked user when the session belongs to someone else', async () => {
    queueResult([{ id: 'u1' }]);
    queueResult([{ userId: 'u1' }]);
    mockAuth.mockResolvedValue({ user: { email: 'attacker@gmail.com' } });

    const result = await authorizeEmailAccess('victim@gmail.com');
    expect('response' in result).toBe(true);
    if ('response' in result) expect(result.response.status).toBe(401);
  });

  it('allows a magic-link-verified user (no accounts row) when the session matches', async () => {
    queueResult([{ id: 'u1' }]);
    queueResult([]); // no accounts row — magic-link never creates one
    queueResult([{ emailVerified: new Date() }]); // but emailVerified is set
    mockAuth.mockResolvedValue({ user: { email: 'real@gmail.com' } });

    const result = await authorizeEmailAccess('real@gmail.com');
    expect(result).toEqual({ email: 'real@gmail.com' });
  });

  it('rejects a magic-link-verified user (no accounts row) with no session', async () => {
    queueResult([{ id: 'u1' }]);
    queueResult([]);
    queueResult([{ emailVerified: new Date() }]);
    mockAuth.mockResolvedValue(null);

    const result = await authorizeEmailAccess('victim@gmail.com');
    expect('response' in result).toBe(true);
    if ('response' in result) expect(result.response.status).toBe(401);
  });
});

describe('authorizeFindingAccess', () => {
  it('returns notFound when the finding does not exist', async () => {
    queueResult([]); // joined lookup: nothing
    const result = await authorizeFindingAccess('missing-finding');
    expect(result).toEqual({ notFound: true });
  });

  it("allows access when the finding's owner is a guest", async () => {
    queueResult([{ userId: 'u1', email: 'guest-xyz@anonymous.local' }]);
    queueResult([]); // no linked account
    queueResult([{ emailVerified: null }]);
    const result = await authorizeFindingAccess('f1');
    expect(result).toEqual({ email: 'guest-xyz@anonymous.local' });
  });

  it("rejects access when the finding's owner is Google-linked and the caller has no session", async () => {
    queueResult([{ userId: 'u1', email: 'victim@gmail.com' }]);
    queueResult([{ userId: 'u1' }]);
    mockAuth.mockResolvedValue(null);

    const result = await authorizeFindingAccess('f1');
    expect('response' in result).toBe(true);
    if ('response' in result) expect(result.response.status).toBe(401);
  });

  it("rejects access when the finding's owner is magic-link-verified (no accounts row) and the caller has no session", async () => {
    queueResult([{ userId: 'u1', email: 'victim@gmail.com' }]);
    queueResult([]);
    queueResult([{ emailVerified: new Date() }]);
    mockAuth.mockResolvedValue(null);

    const result = await authorizeFindingAccess('f1');
    expect('response' in result).toBe(true);
    if ('response' in result) expect(result.response.status).toBe(401);
  });
});

describe('authorizeCapItemAccess', () => {
  it('returns notFound when the CAP item does not exist', async () => {
    queueResult([]);
    const result = await authorizeCapItemAccess('missing-item');
    expect(result).toEqual({ notFound: true });
  });

  it("allows access when the CAP item's owner is a guest", async () => {
    queueResult([{ userId: 'u1', email: 'guest-xyz@anonymous.local' }]);
    queueResult([]);
    queueResult([{ emailVerified: null }]);
    const result = await authorizeCapItemAccess('c1');
    expect(result).toEqual({ email: 'guest-xyz@anonymous.local' });
  });
});
