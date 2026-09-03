import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const requirePortfolioUser = vi.fn();
const createPortfolio = vi.fn();
const renamePortfolio = vi.fn();
const deletePortfolio = vi.fn();
const setMonitored = vi.fn();
const addItems = vi.fn();
const removeItem = vi.fn();

vi.mock('@/lib/portfolio-store', () => ({
  requirePortfolioUser: (...a: unknown[]) => requirePortfolioUser(...a),
  createPortfolio: (...a: unknown[]) => createPortfolio(...a),
  renamePortfolio: (...a: unknown[]) => renamePortfolio(...a),
  deletePortfolio: (...a: unknown[]) => deletePortfolio(...a),
  setMonitored: (...a: unknown[]) => setMonitored(...a),
  addItems: (...a: unknown[]) => addItems(...a),
  removeItem: (...a: unknown[]) => removeItem(...a),
}));

const pf = await import('../app/api/portfolio/route');
const items = await import('../app/api/portfolio/items/route');

const req = (b: unknown, method = 'POST') =>
  ({ json: async () => b, nextUrl: new URL('https://x/api/portfolio') }) as any;

const ACTIVE = { ok: true as const, user: { userId: 'u1', email: 'a@b.com' } };

beforeEach(() => {
  vi.clearAllMocks();
  requirePortfolioUser.mockResolvedValue(ACTIVE);
  createPortfolio.mockResolvedValue({ id: 'p1' });
  renamePortfolio.mockResolvedValue(true);
  deletePortfolio.mockResolvedValue(true);
  setMonitored.mockResolvedValue({ ok: true });
  addItems.mockResolvedValue({ added: 2, skipped: 0, capped: 0 });
  removeItem.mockResolvedValue(true);
});

describe('/api/portfolio access gate', () => {
  it('401 unauthenticated, 403 no access — for every verb', async () => {
    requirePortfolioUser.mockResolvedValue({ ok: false, reason: 'unauthenticated' });
    expect((await pf.POST(req({ name: 'x' }))).status).toBe(401);
    requirePortfolioUser.mockResolvedValue({ ok: false, reason: 'no_access' });
    expect((await pf.PATCH(req({ id: 'p1', name: 'y' }))).status).toBe(403);
    expect((await items.POST(req({ id: 'p1', eins: ['123456789'] }))).status).toBe(403);
    expect(createPortfolio).not.toHaveBeenCalled();
  });
});

describe('POST /api/portfolio (create)', () => {
  it('creates with a name and only valid EINs', async () => {
    const res = await pf.POST(req({ name: 'Subs', eins: ['916001236', 'nope', '742089103'] }));
    expect(await res.json()).toEqual({ id: 'p1' });
    expect(createPortfolio).toHaveBeenCalledWith('u1', 'Subs', [
      { ein: '916001236' },
      { ein: '742089103' },
    ]);
  });
  it('400 on an empty name', async () => {
    createPortfolio.mockResolvedValue({ error: 'name_required' });
    expect((await pf.POST(req({ name: '  ' }))).status).toBe(400);
  });
});

describe('PATCH /api/portfolio', () => {
  it('renames', async () => {
    await pf.PATCH(req({ id: 'p1', name: 'New name' }));
    expect(renamePortfolio).toHaveBeenCalledWith('u1', 'p1', 'New name');
  });
  it('toggles monitored, surfacing the cap error', async () => {
    setMonitored.mockResolvedValue({ ok: false, error: 'monitored_cap' });
    const res = await pf.PATCH(req({ id: 'p1', monitored: true }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'monitored_cap' });
  });
  it('400 without an id', async () => {
    expect((await pf.PATCH(req({ name: 'x' }))).status).toBe(400);
  });
});

describe('/api/portfolio/items', () => {
  it('adds EINs and returns the add/skip/cap counts', async () => {
    const res = await items.POST(req({ id: 'p1', eins: ['916001236', '742089103'] }));
    expect(await res.json()).toEqual({ added: 2, skipped: 0, capped: 0 });
    expect(addItems).toHaveBeenCalledWith('u1', 'p1', [{ ein: '916001236' }, { ein: '742089103' }]);
  });
  it('400 when no valid EIN is supplied', async () => {
    expect((await items.POST(req({ id: 'p1', eins: ['x'] }))).status).toBe(400);
    expect(addItems).not.toHaveBeenCalled();
  });
  it('removes one', async () => {
    const res = await items.DELETE(req({ id: 'p1', ein: '916001236' }));
    expect(await res.json()).toEqual({ ok: true });
    expect(removeItem).toHaveBeenCalledWith('u1', 'p1', '916001236');
  });
});
