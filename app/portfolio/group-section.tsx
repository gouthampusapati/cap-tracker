import { Suspense } from 'react';
import { fetchPortfolio, defaultSort } from '@/lib/portfolio';
import PortfolioTable from './portfolio-table';
import { GroupHeader, AddOrgs } from './group-ui';

export interface GroupSectionData {
  id: string;
  name: string;
  monitored: boolean;
  eins: string[];
}

/**
 * One portfolio group as a self-contained section: title + Monitor
 * toggle, the same PortfolioTable used for an ad-hoc lookup, and a soft
 * "add organizations" input at the bottom. The table's FAC lookup is
 * wrapped in its own Suspense boundary so each group streams in
 * independently and the page shell paints immediately.
 */
export function GroupSection({ group }: { group: GroupSectionData }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <GroupHeader id={group.id} name={group.name} monitored={group.monitored} />
      <div className="mt-4">
        <Suspense
          fallback={
            <p className="text-sm text-gray-500 py-6">
              Loading {group.eins.length} organization{group.eins.length === 1 ? '' : 's'}…
            </p>
          }
        >
          <GroupTable eins={group.eins} />
        </Suspense>
      </div>
      <AddOrgs id={group.id} />
    </section>
  );
}

async function GroupTable({ eins }: { eins: string[] }) {
  if (eins.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-6">
        No organizations in this group yet — add some below.
      </p>
    );
  }
  const rows = defaultSort(await fetchPortfolio(eins));
  return <PortfolioTable initialRows={rows} />;
}
