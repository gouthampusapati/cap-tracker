import Link from 'next/link';
import { agencyName, type NormalizedAward } from '@/lib/fac-api';
import type { AwardYear } from '@/lib/federal-awards';

/**
 * One audit year's Schedule of Expenditures of Federal Awards, grouped
 * cluster -> program -> award. Server component, no client JS.
 *
 * Grouping mirrors how a SEFA actually reads: clustered programs are
 * evaluated for major-program determination as a unit, so they're shown
 * as a unit with FAC's own `cluster_total`; multiple award lines under
 * one ALN get a `federal_program_total` subtotal. Single-award programs
 * with no cluster are just a plain row — no subtotal chrome for a number
 * that equals the row above it.
 */

const fmtUsd = (n: number) =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

interface ProgramGroup {
  aln: string;
  programName: string;
  federalProgramTotal: number;
  awards: NormalizedAward[];
}
interface ClusterGroup {
  clusterName: string | null;
  clusterTotal: number;
  programs: ProgramGroup[];
  total: number;
}

function groupAwards(awards: NormalizedAward[]): ClusterGroup[] {
  const clusters = new Map<string, ClusterGroup>();
  for (const a of awards) {
    const cKey = a.clusterName ?? ' none';
    let cluster = clusters.get(cKey);
    if (!cluster) {
      cluster = { clusterName: a.clusterName, clusterTotal: 0, programs: [], total: 0 };
      clusters.set(cKey, cluster);
    }
    const pKey = `${a.aln} ${a.programName}`;
    let program = cluster.programs.find((p) => `${p.aln} ${p.programName}` === pKey);
    if (!program) {
      program = { aln: a.aln, programName: a.programName, federalProgramTotal: a.federalProgramTotal, awards: [] };
      cluster.programs.push(program);
    }
    program.awards.push(a);
    cluster.total += a.amountExpended;
    // FAC's cluster_total repeats on every row in the cluster; take the
    // max rather than summing it N times.
    cluster.clusterTotal = Math.max(cluster.clusterTotal, a.clusterTotal);
  }

  const groups = [...clusters.values()];
  for (const g of groups) {
    g.programs.sort((a, b) => sumAwards(b.awards) - sumAwards(a.awards));
    for (const p of g.programs) p.awards.sort((a, b) => b.amountExpended - a.amountExpended);
  }
  // Clustered groups first (they drive major-program risk), then by size.
  groups.sort((a, b) => {
    if (!!a.clusterName !== !!b.clusterName) return a.clusterName ? -1 : 1;
    return b.total - a.total;
  });
  return groups;
}

const sumAwards = (awards: NormalizedAward[]) =>
  awards.reduce((s, a) => s + a.amountExpended, 0);

function AwardFlags({ award }: { award: NormalizedAward }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {award.isMajor && (
        <span className="inline-block bg-accent/10 text-accent border border-accent/30 text-xs font-bold px-2 py-0.5 rounded">
          MAJOR PROGRAM
          {award.majorProgramOpinion ? ` — ${award.majorProgramOpinion.toUpperCase()}` : ''}
        </span>
      )}
      {award.isDirect && (
        <span className="inline-block bg-severity-neutral/10 text-severity-neutral border border-severity-neutral/30 text-xs font-semibold px-2 py-0.5 rounded">
          DIRECT
        </span>
      )}
      {award.isPassthrough && (
        <span className="inline-block bg-severity-neutral/10 text-severity-neutral border border-severity-neutral/30 text-xs font-semibold px-2 py-0.5 rounded">
          PASS-THROUGH
          {award.passthroughAmount != null ? ` — ${fmtUsd(award.passthroughAmount)} to subrecipients` : ''}
        </span>
      )}
      {award.isLoan && (
        <span className="inline-block bg-severity-warning/10 text-severity-warning border border-severity-warning/30 text-xs font-semibold px-2 py-0.5 rounded">
          LOAN/LOAN GUARANTEE
          {award.loanBalance != null ? ` — ${fmtUsd(award.loanBalance)} balance` : ''}
        </span>
      )}
    </div>
  );
}

function AwardRow({
  award,
  ein,
  findingAnchors,
  indented,
}: {
  award: NormalizedAward;
  ein: string;
  findingAnchors: string[];
  indented: boolean;
}) {
  const agency = agencyName(award.agencyPrefix);
  return (
    <div className={`py-3 ${indented ? 'pl-4 border-l-2 border-border' : ''}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text">{award.programName || 'Unnamed program'}</div>
          <div className="text-xs text-muted mt-0.5">
            <span className="font-mono">{award.aln || '—'}</span>
            {agency ? ` · ${agency}` : ''}
            {award.additionalIdentification ? ` · ${award.additionalIdentification}` : ''}
          </div>
        </div>
        <div className="text-sm font-semibold text-text whitespace-nowrap">
          {fmtUsd(award.amountExpended)}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <AwardFlags award={award} />
        {award.findingsCount > 0 && (
          <span className="text-xs font-semibold">
            {findingAnchors.length > 0 ? (
              findingAnchors.map((anchor, i) => (
                <span key={anchor}>
                  {i > 0 && ', '}
                  <Link
                    href={`/single-audit/${ein}#${anchor}`}
                    className="text-severity-warning underline hover:no-underline"
                  >
                    finding {anchor.split('-').slice(-2).join('-')}
                  </Link>
                </span>
              ))
            ) : (
              <span className="text-severity-warning">
                {award.findingsCount} finding{award.findingsCount === 1 ? '' : 's'}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export function AwardTable({
  year,
  ein,
  findingAnchorsByAward,
}: {
  year: AwardYear;
  ein: string;
  findingAnchorsByAward: Record<string, string[]>;
}) {
  const groups = groupAwards(year.awards);
  const majorCount = year.awards.filter((a) => a.isMajor).length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-xl font-bold text-gray-900">FY {year.fiscalYearEnd}</h2>
        <div className="text-sm text-muted">
          {fmtUsd(sumAwards(year.awards))} across {year.awards.length}
          {year.awards.length === 1 ? ' award' : ' awards'}
          {majorCount > 0 ? ` · ${majorCount} major` : ''}
        </div>
      </div>

      {/* Cross-check against the general-table total for the same report —
          shown only when they diverge, since a mismatch is a data-quality
          signal worth seeing, not noise when they agree. */}
      {year.totalAmountExpended > 0 &&
        Math.abs(year.totalAmountExpended - sumAwards(year.awards)) > 1 && (
          <p className="text-xs text-muted mb-3">
            Audit summary reports {fmtUsd(year.totalAmountExpended)} total federal expenditures for
            this year; the award lines above sum to {fmtUsd(sumAwards(year.awards))}.
          </p>
        )}

      <div className="bg-surface border border-border rounded-lg divide-y divide-border">
        {groups.map((g, gi) => (
          <div key={gi} className="p-4">
            {g.clusterName && (
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">
                  Cluster: {g.clusterName}
                </span>
                {/* Subtotal only when the cluster actually aggregates more
                    than one award — otherwise it just restates the single
                    row below it. */}
                {g.programs.reduce((n, p) => n + p.awards.length, 0) > 1 && (
                  <span className="text-xs font-semibold text-muted">
                    {fmtUsd(g.clusterTotal > 0 ? g.clusterTotal : g.total)} cluster total
                  </span>
                )}
              </div>
            )}
            <div className="divide-y divide-border">
              {g.programs.map((p, pi) => {
                const multi = p.awards.length > 1;
                return (
                  <div key={pi} className="py-1">
                    {multi && (
                      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
                        <span className="text-xs font-semibold text-muted">
                          {p.programName} <span className="font-mono">({p.aln})</span> —{' '}
                          {p.awards.length} awards
                        </span>
                        <span className="text-xs font-semibold text-muted">
                          {fmtUsd(
                            p.federalProgramTotal > 0 ? p.federalProgramTotal : sumAwards(p.awards)
                          )}{' '}
                          program total
                        </span>
                      </div>
                    )}
                    {p.awards.map((a) => (
                      <AwardRow
                        key={a.awardReference}
                        award={a}
                        ein={ein}
                        findingAnchors={findingAnchorsByAward[a.awardReference] ?? []}
                        indented={multi}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
