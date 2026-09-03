/**
 * One-off: what's driving the FAC call spike? Groups fac_api_call_log
 * for the last N hours by FAC endpoint + status + key.
 *   node scripts/diagnose-fac-spike.mjs [hours=6]
 */
import { createClient } from '@libsql/client';
import { readFileSync, existsSync } from 'node:fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const hours = Number(process.argv[2] || 6);
const since = Math.floor(Date.now() / 1000) - hours * 3600;

const endpoint = (p) => {
  const base = String(p).split('?')[0].replace(/^\/+/, '').split('/')[0];
  return base || '(root)';
};

const { rows } = await db.execute({
  sql: `SELECT called_at, path, status, key_label FROM fac_api_call_log WHERE called_at >= ? ORDER BY called_at`,
  args: [since],
});

console.log(`\n${rows.length} FAC calls in the last ${hours}h\n`);

// by endpoint
const byEp = {};
const byStatus = {};
const byKey = {};
const byHour = {};
const distinctEinByEp = {};
for (const r of rows) {
  const ep = endpoint(r.path);
  byEp[ep] = (byEp[ep] || 0) + 1;
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  byKey[r.key_label] = (byKey[r.key_label] || 0) + 1;
  const h = new Date(Number(r.called_at) * 1000).toISOString().slice(0, 13);
  byHour[h] = (byHour[h] || 0) + 1;
  const m = String(r.path).match(/(auditee_ein|report_id|auditee_uei)=([^&]+)/);
  if (m) {
    (distinctEinByEp[ep] ||= new Set()).add(m[2]);
  }
}

const show = (label, obj) => {
  console.log(label);
  for (const [k, v] of Object.entries(obj).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(k).padEnd(28)} ${v}`);
  }
  console.log();
};

show('By FAC endpoint:', byEp);
console.log('Distinct EIN/report params per endpoint:');
for (const [ep, s] of Object.entries(distinctEinByEp)) console.log(`  ${ep.padEnd(28)} ${s.size}`);
console.log();
show('By status:', byStatus);
show('By key:', byKey);
show('By hour (UTC):', byHour);

// sample of recent non-2xx paths
const bad = rows.filter((r) => r.status >= 400).slice(-15);
console.log('Last 15 error-status paths:');
for (const r of bad) {
  console.log(`  ${new Date(Number(r.called_at) * 1000).toISOString()}  ${r.status}  ${r.key_label}  ${r.path}`);
}

// sample of recent 2xx paths
const ok = rows.filter((r) => r.status < 400).slice(-15);
console.log('\nLast 15 ok-status paths:');
for (const r of ok) {
  console.log(`  ${new Date(Number(r.called_at) * 1000).toISOString()}  ${r.status}  ${r.key_label}  ${r.path}`);
}
