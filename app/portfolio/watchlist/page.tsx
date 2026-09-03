import Link from 'next/link';
import type { Metadata } from 'next';
import { Footer } from '@/app/footer';
import { FoundingCtaButton } from '@/app/founding-cta-button';
import { requirePortfolioUser, getMonitoredView } from '@/lib/portfolio-store';
import { parseEinList } from '@/lib/ein-list';
import { GroupCard } from './group-card';
import { NewGroup } from './new-group';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Monitored Portfolios | Single Audit Intelligence',
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="max-w-3xl w-full mx-auto px-4 py-10 sm:px-6 lg:px-8 flex-1">
        <Link href="/portfolio" className="text-sm text-accent hover:underline">
          ← Portfolio
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mt-3 mb-2">Monitored portfolios</h1>
        {children}
      </div>
      <Footer />
    </div>
  );
}

export default async function MonitoredPortfoliosPage(props: {
  searchParams: Promise<{ eins?: string }>;
}) {
  const res = await requirePortfolioUser();

  if (!res.ok && res.reason === 'unauthenticated') {
    return (
      <Shell>
        <p className="text-gray-600 mt-2 mb-6">Sign in to manage the organizations you monitor.</p>
        <Link
          href="/auth/signin?next=/portfolio/watchlist"
          className="inline-block bg-accent hover:opacity-90 text-white font-semibold px-5 py-2.5 rounded-md"
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  if (!res.ok) {
    return (
      <Shell>
        <p className="text-gray-600 mt-2 mb-6 max-w-prose">
          Continuous monitoring — new audits, findings, repeat findings, and management-decision
          deadlines for the organizations you choose, grouped how you like — is a founding-customer
          feature. Your account doesn&apos;t have monitoring access yet.
        </p>
        <FoundingCtaButton surface="watchlist" />
      </Shell>
    );
  }

  const { eins: importEins } = parseEinList((await props.searchParams).eins ?? '');
  const groups = await getMonitoredView(res.user.userId);
  const serialisable = groups.map((g) => ({
    ...g,
    items: g.items.map((i) => ({ ...i, checkedAt: i.checkedAt ? i.checkedAt.toISOString() : null })),
    alerts: g.alerts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  }));

  return (
    <Shell>
      <p className="text-gray-600 mt-2 mb-6">
        Weekly checks against the Federal Audit Clearinghouse. Changes are emailed to{' '}
        {res.user.email}, grouped by portfolio.
      </p>

      {importEins.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900 mb-3">
            Add {importEins.length} organization{importEins.length === 1 ? '' : 's'} from your
            portfolio to a group:
          </p>
          <NewGroup initialEins={importEins} />
        </div>
      )}

      <div className="mb-6">
        <NewGroup />
      </div>

      {serialisable.length === 0 ? (
        <p className="text-sm text-gray-500">
          No groups yet. Create one above, or open an organization and use{' '}
          <span className="font-semibold">Add to Watchlist</span>.
        </p>
      ) : (
        <div className="space-y-4">
          {serialisable.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </Shell>
  );
}
