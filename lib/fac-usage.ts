import 'server-only';
import { and, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { facApiCallLog } from '@/lib/db/schema';

/**
 * FAC API call logging + the aggregation behind /admin/fac-usage.
 *
 * logFacCall is called once per individual FAC request from
 * lib/fac-api.ts's facGet. It must NEVER throw or meaningfully delay the
 * caller — a logging failure is not a reason to fail a FAC fetch — so
 * every path here is wrapped and swallows its own errors.
 */

const RETENTION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FacCallRecord {
  path: string;
  status: number;
  keyLabel: 'primary' | 'fallback';
  rateRemaining: number | null;
  rateLimit: number | null;
}

export async function logFacCall(rec: FacCallRecord): Promise<void> {
  try {
    await db.insert(facApiCallLog).values({
      id: crypto.randomUUID(),
      calledAt: new Date(),
      path: rec.path,
      status: rec.status,
      keyLabel: rec.keyLabel,
      rateRemaining: rec.rateRemaining,
      rateLimit: rec.rateLimit,
    });

    // Opportunistic cleanup — ~1 call in 30, not every time.
    if (Math.random() < 1 / 30) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
      await db.delete(facApiCallLog).where(lt(facApiCallLog.calledAt, cutoff));
    }
  } catch (err) {
    console.error('[fac-usage] logFacCall failed (non-fatal):', err);
  }
}

/* ------------------------------------------------------------------ */
/* Report aggregation                                                  */
/* ------------------------------------------------------------------ */

export interface UsageCell {
  count: number;
  errorCount: number;
}
export interface UsageDay {
  /** "YYYY-MM-DD" in UTC */
  date: string;
  hours: UsageCell[]; // length 24, index = UTC hour
  total: number;
}
export interface FacUsageReport {
  days: UsageDay[];
  totalCalls: number;
  callsLastHour: number;
  /** Lowest x-ratelimit-remaining seen in the last hour, across keys. */
  minRemainingLastHour: number | null;
  byPath: { path: string; count: number }[];
  byKey: { keyLabel: string; count: number }[];
  fallbackCalls: number;
  errorCalls: number;
  generatedAt: Date;
  retentionDays: number;
}

interface RawRow {
  calledAt: Date;
  path: string;
  status: number;
  keyLabel: string;
  rateRemaining: number | null;
}

/** UTC "YYYY-MM-DD" for a Date. */
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pure shaping of raw call rows into the day×hour grid — separated from
 * the DB read so it can be unit-tested. `now` is injected for the same
 * reason. Days run newest-first; every day in the window is present even
 * with zero calls, so the grid doesn't jump over quiet days.
 */
export function buildUsageReport(
  rows: RawRow[],
  now: Date,
  windowDays: number
): FacUsageReport {
  const dayMap = new Map<string, UsageDay>();
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = utcDateKey(d);
    dayMap.set(key, {
      date: key,
      hours: Array.from({ length: 24 }, () => ({ count: 0, errorCount: 0 })),
      total: 0,
    });
  }

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  let callsLastHour = 0;
  let minRemainingLastHour: number | null = null;
  let fallbackCalls = 0;
  let errorCalls = 0;
  const pathCounts = new Map<string, number>();
  const keyCounts = new Map<string, number>();

  for (const r of rows) {
    const isError = r.status === 0 || r.status >= 400;
    const day = dayMap.get(utcDateKey(r.calledAt));
    if (day) {
      const cell = day.hours[r.calledAt.getUTCHours()];
      cell.count++;
      if (isError) cell.errorCount++;
      day.total++;
    }

    pathCounts.set(r.path, (pathCounts.get(r.path) ?? 0) + 1);
    keyCounts.set(r.keyLabel, (keyCounts.get(r.keyLabel) ?? 0) + 1);
    if (r.keyLabel === 'fallback') fallbackCalls++;
    if (isError) errorCalls++;

    if (r.calledAt >= hourAgo) {
      callsLastHour++;
      if (r.rateRemaining != null) {
        minRemainingLastHour =
          minRemainingLastHour == null
            ? r.rateRemaining
            : Math.min(minRemainingLastHour, r.rateRemaining);
      }
    }
  }

  const days = [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date));

  return {
    days,
    totalCalls: rows.length,
    callsLastHour,
    minRemainingLastHour,
    byPath: [...pathCounts.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count),
    byKey: [...keyCounts.entries()]
      .map(([keyLabel, count]) => ({ keyLabel, count }))
      .sort((a, b) => b.count - a.count),
    fallbackCalls,
    errorCalls,
    generatedAt: now,
    retentionDays: windowDays,
  };
}

export async function getFacUsageReport(windowDays = RETENTION_DAYS): Promise<FacUsageReport> {
  const now = new Date();
  const since = new Date(now.getTime() - windowDays * DAY_MS);

  const rows = await db
    .select({
      calledAt: facApiCallLog.calledAt,
      path: facApiCallLog.path,
      status: facApiCallLog.status,
      keyLabel: facApiCallLog.keyLabel,
      rateRemaining: facApiCallLog.rateRemaining,
    })
    .from(facApiCallLog)
    .where(and(gte(facApiCallLog.calledAt, since), lt(facApiCallLog.calledAt, now)))
    .orderBy(sql`${facApiCallLog.calledAt} desc`)
    .limit(200_000);

  return buildUsageReport(rows, now, windowDays);
}
