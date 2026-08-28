import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admin';
import { getFacUsageReport, type FacUsageReport } from '@/lib/fac-usage';

// Always live — this is an operational dashboard, a cached view would
// defeat its purpose.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'FAC API Usage',
  robots: { index: false, follow: false },
};

function cellClass(count: number, max: number): string {
  if (count === 0) return 'bg-gray-50 text-gray-300';
  const r = count / max;
  if (r > 0.75) return 'bg-blue-700 text-white';
  if (r > 0.5) return 'bg-blue-500 text-white';
  if (r > 0.25) return 'bg-blue-300 text-blue-900';
  return 'bg-blue-100 text-blue-800';
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'bad' }) {
  const color =
    tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

function Grid({ report }: { report: FacUsageReport }) {
  const max = Math.max(
    1,
    ...report.days.flatMap((d) => d.hours.map((h) => h.count))
  );
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-gray-50 px-2 py-1 text-left font-semibold text-gray-500">
              Date (UTC)
            </th>
            {hours.map((h) => (
              <th key={h} className="px-1 py-1 text-center font-medium text-gray-400 w-8">
                {h}
              </th>
            ))}
            <th className="px-2 py-1 text-right font-semibold text-gray-500">Day</th>
          </tr>
        </thead>
        <tbody>
          {report.days.map((day) => (
            <tr key={day.date}>
              <td className="sticky left-0 bg-gray-50 px-2 py-1 font-mono text-gray-600 whitespace-nowrap">
                {day.date}
              </td>
              {day.hours.map((cell, h) => (
                <td
                  key={h}
                  title={`${day.date} ${String(h).padStart(2, '0')}:00 UTC — ${cell.count} call${
                    cell.count === 1 ? '' : 's'
                  }${cell.errorCount ? `, ${cell.errorCount} error` : ''}`}
                  className={`px-1 py-1 text-center tabular-nums rounded ${cellClass(cell.count, max)} ${
                    cell.errorCount > 0 ? 'ring-1 ring-inset ring-red-400' : ''
                  }`}
                >
                  {cell.count || ''}
                </td>
              ))}
              <td className="px-2 py-1 text-right font-semibold text-gray-700 tabular-nums">
                {day.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function FacUsagePage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) notFound();

  const report = await getFacUsageReport();

  const limitKnown = report.minRemainingLastHour != null;
  const lowHeadroom = limitKnown && report.minRemainingLastHour! < 150;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">FAC API Usage</h1>
        <p className="text-sm text-gray-500 mb-6">
          One row per individual FAC API call (a page load is ~4). Last {report.retentionDays} days,
          UTC. Generated {report.generatedAt.toISOString().replace('T', ' ').slice(0, 19)}.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <Stat label={`calls / ${report.retentionDays}d`} value={report.totalCalls.toLocaleString()} />
          <Stat label="calls last hour" value={report.callsLastHour.toLocaleString()} />
          <Stat
            label="min quota remaining (1h)"
            value={limitKnown ? report.minRemainingLastHour!.toLocaleString() : '—'}
            tone={lowHeadroom ? 'bad' : undefined}
          />
          <Stat
            label="errors / window"
            value={report.errorCalls.toLocaleString()}
            tone={report.errorCalls > 0 ? 'warn' : undefined}
          />
          <Stat
            label="fallback-key calls"
            value={report.fallbackCalls.toLocaleString()}
            tone={report.fallbackCalls > 0 ? 'warn' : undefined}
          />
          <Stat
            label="busiest hour (window)"
            value={Math.max(
              0,
              ...report.days.flatMap((d) => d.hours.map((h) => h.count))
            ).toLocaleString()}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Calls by hour</h2>
          {report.totalCalls === 0 ? (
            <p className="text-sm text-gray-500">
              No FAC calls logged yet. This table fills in as live lookups happen (most requests are
              served from the local mirror and never hit the API).
            </p>
          ) : (
            <Grid report={report} />
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">By endpoint</h2>
            <table className="w-full text-sm">
              <tbody>
                {report.byPath.map((p) => (
                  <tr key={p.path} className="border-t border-gray-100 first:border-0">
                    <td className="py-1.5 font-mono text-gray-600">{p.path}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-900">
                      {p.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {report.byPath.length === 0 && (
                  <tr>
                    <td className="py-1.5 text-gray-400">no data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">By key</h2>
            <table className="w-full text-sm">
              <tbody>
                {report.byKey.map((k) => (
                  <tr key={k.keyLabel} className="border-t border-gray-100 first:border-0">
                    <td className="py-1.5 text-gray-600">{k.keyLabel}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-900">
                      {k.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {report.byKey.length === 0 && (
                  <tr>
                    <td className="py-1.5 text-gray-400">no data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
