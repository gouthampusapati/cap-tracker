/**
 * The acceptance bar for the incremental FAC mirror sync:
 *
 *   an incremental run must converge to a BYTE-IDENTICAL mirror as a
 *   full reload from the same CSVs.
 *
 * Runs the real scripts/sync-fac-mirror.mjs as a subprocess against a
 * local file DB and the committed CSV fixture (FAC_CSV_DIR) — no network,
 * no Turso. "Week 2" is synthesised from the fixture to exercise every
 * diff branch: unchanged / general-changed / child-only-changed / new /
 * removed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

const SCRIPT = join(__dirname, '..', 'scripts', 'sync-fac-mirror.mjs');
const FIXTURE = join(__dirname, 'fixtures', 'fac');

const BASE_TABLES = [
  'fac_mirror_general',
  'fac_mirror_findings',
  'fac_mirror_findings_text',
  'fac_mirror_corrective_action_plans',
  'fac_mirror_additional_eins',
  'fac_mirror_additional_ueis',
];
const DERIVED_TABLES = ['fac_mirror_auditor_firms', 'fac_mirror_org_summary'];

function runSync(dbPath: string, csvDir: string, args: string[] = []): { ok: boolean; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], {
      env: {
        ...process.env,
        DATABASE_URL: `file:${dbPath}`,
        TURSO_AUTH_TOKEN: '',
        FAC_CSV_DIR: csvDir,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out };
  } catch (e: any) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** Every mirror table, content only (surrogate `id` stripped), each
 * table's rows sorted deterministically so two DBs compare equal iff
 * they hold the same data. */
function dump(dbPath: string): Record<string, string> {
  const db = new Database(dbPath, { readonly: true });
  const result: Record<string, string> = {};
  for (const t of [...BASE_TABLES, ...DERIVED_TABLES]) {
    const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as any[])
      .map((c) => c.name)
      .filter((c) => c !== 'id' && c !== 'content_hash');
    const rows = db.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(',')} FROM ${t}`).all() as any[];
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    result[t] = JSON.stringify(rows);
  }
  db.close();
  return result;
}

function rowCounts(dbPath: string): Record<string, number> {
  const db = new Database(dbPath, { readonly: true });
  const out: Record<string, number> = {};
  for (const t of [...BASE_TABLES, ...DERIVED_TABLES]) {
    out[t] = (db.prepare(`SELECT count(*) n FROM ${t}`).get() as any).n;
  }
  db.close();
  return out;
}

// ---- CSV fixture mutation -------------------------------------------------

function csvCell(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function readCsv(dir: string, name: string) {
  const recs = parse(readFileSync(join(dir, `${name}.csv`)), { columns: false }) as string[][];
  return { header: recs[0], rows: recs.slice(1) };
}
function writeCsv(dir: string, name: string, header: string[], rows: string[][]) {
  writeFileSync(
    join(dir, `${name}.csv`),
    [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
  );
}

interface Week2Plan {
  removeReports: string[];
  editGeneral: Array<{ reportId: string; set: Record<string, string> }>;
  editChildOnly: Array<{ reportId: string; file: string; col: string; value: string }>;
  addReports: string[];
}

/** Build a "week 2" fixture dir from week 1 per the plan. */
function makeWeek2(srcDir: string, plan: Week2Plan): string {
  const dest = mkdtempSync(join(tmpdir(), 'fac-week2-'));
  cpSync(srcDir, dest, { recursive: true });

  const gone = new Set(plan.removeReports);
  const files = [
    'general',
    'findings',
    'findings_text',
    'corrective_action_plans',
    'additional_eins',
    'additional_ueis',
  ];

  for (const f of files) {
    const { header, rows } = readCsv(dest, f);
    const ridCol = header.indexOf('report_id');
    let out = rows.filter((r) => !gone.has(r[ridCol]));

    if (f === 'general') {
      for (const e of plan.editGeneral) {
        const row = out.find((r) => r[ridCol] === e.reportId);
        if (!row) throw new Error(`editGeneral: ${e.reportId} not in fixture`);
        for (const [k, v] of Object.entries(e.set)) row[header.indexOf(k)] = v;
      }
      // new reports: clone an existing row, rename, tweak a field
      const template = out[0];
      for (const rid of plan.addReports) {
        const clone = [...template];
        clone[ridCol] = rid;
        clone[header.indexOf('auditee_name')] = `NEW ${rid}`;
        clone[header.indexOf('auditee_ein')] = String(900000000 + plan.addReports.indexOf(rid));
        out.push(clone);
      }
    }

    for (const e of plan.editChildOnly) {
      if (e.file !== f) continue;
      const row = out.find((r) => r[ridCol] === e.reportId);
      if (!row) throw new Error(`editChildOnly: ${e.reportId} has no ${f} row`);
      row[header.indexOf(e.col)] = e.value;
    }

    writeCsv(dest, f, header, out);
  }
  return dest;
}

// ---- tests --------------------------------------------------------------

let tmpRoot: string;
beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'fac-eqv-'));
});

describe('mirror sync — full reload', () => {
  it('loads the fixture end to end', () => {
    const db = join(tmpRoot, 'full1.db');
    const { ok, out } = runSync(db, FIXTURE, ['--full']);
    expect(ok, out).toBe(true);
    const counts = rowCounts(db);
    expect(counts.fac_mirror_general).toBe(120);
    expect(counts.fac_mirror_findings).toBeGreaterThan(400);
    expect(counts.fac_mirror_org_summary).toBe(120);
    expect(counts.fac_mirror_auditor_firms).toBeGreaterThan(0);
  });

  it('is deterministic — two full reloads produce identical mirrors', () => {
    const a = join(tmpRoot, 'fa.db');
    const b = join(tmpRoot, 'fb.db');
    expect(runSync(a, FIXTURE, ['--full']).ok).toBe(true);
    expect(runSync(b, FIXTURE, ['--full']).ok).toBe(true);
    expect(dump(a)).toEqual(dump(b));
  });
});

describe('mirror sync — incremental ≡ full', () => {
  // Build the week-2 plan from the actual fixture so the target reports
  // really have the child rows we mean to edit.
  const allReports = readCsv(FIXTURE, 'general').rows.map(
    (r) => r[readCsv(FIXTURE, 'general').header.indexOf('report_id')]
  );
  const textReports = [
    ...new Set(
      readCsv(FIXTURE, 'findings_text').rows.map(
        (r) => r[readCsv(FIXTURE, 'findings_text').header.indexOf('report_id')]
      )
    ),
  ];
  const capReports = [
    ...new Set(
      readCsv(FIXTURE, 'corrective_action_plans').rows.map(
        (r) => r[readCsv(FIXTURE, 'corrective_action_plans').header.indexOf('report_id')]
      )
    ),
  ];
  const used = new Set([textReports[0], capReports.find((r) => r !== textReports[0])!]);
  const plainReports = allReports.filter((r) => !used.has(r));

  const plan: Week2Plan = {
    removeReports: [plainReports[0], plainReports[1]],
    editGeneral: [
      { reportId: plainReports[2], set: { auditee_name: 'Renamed Org', total_amount_expended: '12345678' } },
      { reportId: plainReports[3], set: { is_going_concern_included: 'Yes' } },
    ],
    editChildOnly: [
      { reportId: textReports[0], file: 'findings_text', col: 'finding_text', value: 'REVISED narrative text' },
      {
        reportId: capReports.find((r) => r !== textReports[0])!,
        file: 'corrective_action_plans',
        col: 'planned_action',
        value: 'REVISED corrective action',
      },
    ],
    addReports: ['2025-06-GSAFAC-0009999001', '2025-06-GSAFAC-0009999002'],
  };

  it('converges to the same mirror as a full reload of week 2', () => {
    const full = join(tmpRoot, 'conv-full.db');
    const incr = join(tmpRoot, 'conv-incr.db');
    const week2 = makeWeek2(FIXTURE, plan);

    // both start from a full week-1 load
    expect(runSync(full, FIXTURE, ['--full']).ok).toBe(true);
    expect(runSync(incr, FIXTURE, ['--full']).ok).toBe(true);

    // week 2: one full, one incremental
    const f = runSync(full, week2, ['--full']);
    const i = runSync(incr, week2, []);
    expect(f.ok, f.out).toBe(true);
    expect(i.ok, i.out).toBe(true);

    expect(dump(incr)).toEqual(dump(full));
    rmSync(week2, { recursive: true, force: true });
  });

  it('is a no-op when the CSVs have not changed', () => {
    const db = join(tmpRoot, 'noop.db');
    expect(runSync(db, FIXTURE, ['--full']).ok).toBe(true);
    const before = dump(db);
    const res = runSync(db, FIXTURE, []);
    expect(res.ok, res.out).toBe(true);
    expect(res.out).toMatch(/0 changed|already current|no changes/i);
    expect(dump(db)).toEqual(before);
  });

  it('refuses to apply a truncated download and leaves the mirror untouched', () => {
    const db = join(tmpRoot, 'trunc.db');
    expect(runSync(db, FIXTURE, ['--full']).ok).toBe(true);
    const before = dump(db);

    const bad = mkdtempSync(join(tmpdir(), 'fac-trunc-'));
    cpSync(FIXTURE, bad, { recursive: true });
    const { header, rows } = readCsv(bad, 'general');
    writeCsv(bad, 'general', header, rows.slice(0, 10)); // 120 -> 10

    const res = runSync(db, bad, []);
    expect(res.ok).toBe(false);
    expect(res.out).toMatch(/truncat|refus/i);
    expect(dump(db)).toEqual(before);
    rmSync(bad, { recursive: true, force: true });
  });
});
