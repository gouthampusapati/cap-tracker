/**
 * Integration test for scripts/monitor-fac-changes.mjs — runs the real
 * job as a subprocess against a file DB seeded with the committed FAC
 * fixture + a watchlist, and drives it through baseline → change →
 * idempotent → digest. RESEND is forced unset so no email is sent.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const FIXTURE = join(__dirname, 'fixtures', 'fac');

let DB_PATH: string;
let WATCHED_EIN: string;
let LATEST_REPORT: string;

function run(script: string, args: string[] = [], extraEnv: Record<string, string> = {}) {
  return execFileSync('node', [join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: `file:${DB_PATH}`,
      TURSO_AUTH_TOKEN: '',
      NEXTAUTH_SECRET: 'test-secret-min-32-chars-long-okay',
      RESEND_API_KEY: '',
      WAITLIST_NOTIFY_EMAIL: '',
      ...extraEnv,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const open = () => new Database(DB_PATH);

beforeAll(() => {
  DB_PATH = join(mkdtempSync(join(tmpdir(), 'monitor-')), 'm.db');

  run('create-monitor-tables.mjs');
  run('sync-fac-mirror.mjs', ['--full'], { FAC_CSV_DIR: FIXTURE });

  const db = open();
  db.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, created_at INTEGER)');
  // pick the watched EIN: the org with the most findings in the fixture
  const row = db
    .prepare(
      `SELECT g.auditee_ein AS ein, count(*) AS n
       FROM fac_mirror_general g JOIN fac_mirror_findings f ON f.report_id = g.report_id
       GROUP BY g.auditee_ein ORDER BY n DESC LIMIT 1`
    )
    .get() as { ein: string };
  WATCHED_EIN = row.ein;
  LATEST_REPORT = (
    db
      .prepare(
        `SELECT report_id FROM fac_mirror_general WHERE auditee_ein = ? ORDER BY fy_end_date DESC LIMIT 1`
      )
      .get(WATCHED_EIN) as { report_id: string }
  ).report_id;

  const t = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').run('u1', 'a@example.com', t);
  db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').run('u2', 'b@example.com', t);
  // two users watch the same EIN
  db.prepare('INSERT INTO watchlist (id, user_id, ein, created_at) VALUES (?, ?, ?, ?)').run('w1', 'u1', WATCHED_EIN, t);
  db.prepare('INSERT INTO watchlist (id, user_id, ein, created_at) VALUES (?, ?, ?, ?)').run('w2', 'u2', WATCHED_EIN, t);
  db.close();
});

describe('monitor job', () => {
  it('first run baselines — records monitor_state, raises no alerts', () => {
    const out = run('monitor-fac-changes.mjs');
    expect(out).toMatch(/1 EINs baselined/);
    const db = open();
    expect((db.prepare('SELECT count(*) n FROM monitor_alert').get() as any).n).toBe(0);
    const state = db.prepare('SELECT * FROM monitor_state WHERE ein = ?').get(WATCHED_EIN) as any;
    expect(state).toBeTruthy();
    expect(JSON.parse(state.finding_refs).length).toBeGreaterThan(0);
    // the fixture org's deadline is long past, so baseline records it as
    // "already alerted" — a pre-existing deadline is not a change
    expect(state.md_deadline_alerted).toBe(state.soonest_md_deadline);
    db.close();
  });

  it('a new + a repeat finding raise one alert each, fanned out to both watchers', () => {
    const db = open();
    db.prepare('INSERT INTO fac_mirror_findings (report_id, reference_number, is_repeat_finding) VALUES (?, ?, ?)').run(
      LATEST_REPORT,
      'ZZ-NEW-1',
      'N'
    );
    db.prepare('INSERT INTO fac_mirror_findings (report_id, reference_number, is_repeat_finding) VALUES (?, ?, ?)').run(
      LATEST_REPORT,
      'ZZ-NEW-2',
      'Y'
    );
    db.close();

    run('monitor-fac-changes.mjs');

    const d = open();
    const rows = d.prepare('SELECT user_id, type FROM monitor_alert ORDER BY user_id, type').all() as any[];
    // 2 change types × 2 users
    expect(rows).toEqual([
      { user_id: 'u1', type: 'new_finding' },
      { user_id: 'u1', type: 'repeat_finding' },
      { user_id: 'u2', type: 'new_finding' },
      { user_id: 'u2', type: 'repeat_finding' },
    ]);
    // the repeat ref is NOT also reported as new_finding
    const newFinding = d.prepare("SELECT payload_json FROM monitor_alert WHERE type='new_finding' AND user_id='u1'").get() as any;
    expect(JSON.parse(newFinding.payload_json).referenceNumber).toBe('ZZ-NEW-1');
    d.close();
  });

  it('is idempotent — a second run with no further change raises nothing', () => {
    const before = (open().prepare('SELECT count(*) n FROM monitor_alert').get() as any).n;
    const out = run('monitor-fac-changes.mjs');
    expect(out).toMatch(/diff: 0 alert rows/);
    expect((open().prepare('SELECT count(*) n FROM monitor_alert').get() as any).n).toBe(before);
  });

  it('digest phase: opted-out user gets alerts marked sent, no email', () => {
    const db = open();
    db.prepare('INSERT INTO monitor_prefs (user_id, digest_opt_out, updated_at) VALUES (?, 1, ?)').run(
      'u2',
      Math.floor(Date.now() / 1000)
    );
    db.close();

    const out = run('monitor-fac-changes.mjs');
    expect(out).toMatch(/u2: opted out/);

    const d = open();
    const u2unsent = (
      d.prepare("SELECT count(*) n FROM monitor_alert WHERE user_id='u2' AND digest_sent_at IS NULL").get() as any
    ).n;
    const u1unsent = (
      d.prepare("SELECT count(*) n FROM monitor_alert WHERE user_id='u1' AND digest_sent_at IS NULL").get() as any
    ).n;
    expect(u2unsent).toBe(0); // opted out -> marked sent
    expect(u1unsent).toBeGreaterThan(0); // no RESEND key -> left for a later run
    d.close();
  });

  it('a watched EIN not in the mirror is baselined with a null-report state', () => {
    const db = open();
    db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').run('u3', 'c@example.com', 0);
    db.prepare('INSERT INTO watchlist (id, user_id, ein, created_at) VALUES (?, ?, ?, ?)').run(
      'w3',
      'u3',
      '999000999',
      0
    );
    db.close();

    run('monitor-fac-changes.mjs');
    const state = open().prepare('SELECT * FROM monitor_state WHERE ein = ?').get('999000999') as any;
    expect(state).toBeTruthy();
    expect(state.latest_report_id).toBeNull();
  });
});
