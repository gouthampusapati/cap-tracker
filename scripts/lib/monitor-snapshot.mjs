/**
 * Pure snapshot + diff core for the continuous-monitoring job
 * (scripts/monitor-fac-changes.mjs). No DB, no FAC — takes an org
 * already read from the mirror and the last-seen monitor_state, returns
 * the alerts to raise.
 *
 * Exhaustively unit-tested (test/monitor-snapshot.test.ts): a bug here
 * is a missed or false compliance alert to a paying customer.
 *
 * The org shape expected by buildSnapshot:
 *   { name, reports: [{ report_id, audit_year, fy_end_date, fac_accepted_date }],
 *     findings: [{ reportId, facFindingId, isRepeatFinding }] }
 * i.e. the ImportedOrg shape from lib/fac-api.ts (see readOrgFromMirror).
 */

/* --- management-decision deadline math ---------------------------------
 * A pass-through must issue a management decision within 6 months of FAC
 * accepting the audit (2 CFR 200.521(d)). Kept in lockstep with
 * lib/management-decision.ts (the app-side copy the org/portfolio pages
 * use) — same rule, duplicated because scripts/lib is standalone .mjs. */
const DUE_SOON_WINDOW_DAYS = 30;

export function mdDeadline(facAcceptedDate, now = new Date()) {
  if (!facAcceptedDate) return null;
  const accepted = new Date(`${facAcceptedDate}T00:00:00Z`);
  if (Number.isNaN(accepted.getTime())) return null;
  const deadline = new Date(accepted);
  deadline.setUTCMonth(deadline.getUTCMonth() + 6);
  const days = Math.round((deadline.getTime() - now.getTime()) / 86_400_000);
  const state = days < 0 ? 'past' : days <= DUE_SOON_WINDOW_DAYS ? 'due-soon' : 'future';
  return { label: deadline.toISOString().slice(0, 10), days, state };
}

/** Soonest upcoming deadline across an org's reports, else the most
 * recently passed one. Mirrors soonestDeadline in lib/management-decision.ts. */
export function soonestMdDeadline(reports, now = new Date()) {
  const all = reports.map((r) => mdDeadline(r.fac_accepted_date, now)).filter(Boolean);
  if (all.length === 0) return null;
  const upcoming = all.filter((d) => d.state !== 'past').sort((a, b) => a.days - b.days);
  if (upcoming.length > 0) return upcoming[0];
  return all.sort((a, b) => b.days - a.days)[0];
}

/* --- snapshot + diff -------------------------------------------------- */

/** Stable key for a finding: report + reference number. (Mirror findings
 * set facFindingId = reference_number — see normalizeFindings.) */
export function findingKey(f) {
  return `${f.reportId}::${f.facFindingId}`;
}

export function buildSnapshot(org, now = new Date()) {
  const reports = [...org.reports].sort((a, b) =>
    (b.fy_end_date ?? '').localeCompare(a.fy_end_date ?? '')
  );
  const latest = reports[0] ?? null;

  const findingRefs = [...new Set(org.findings.map(findingKey))].sort();
  const repeatFindingRefs = [
    ...new Set(org.findings.filter((f) => f.isRepeatFinding).map(findingKey)),
  ].sort();

  const soonest = soonestMdDeadline(reports, now);

  return {
    orgName: org.name,
    latestReportId: latest?.report_id ?? null,
    latestAuditYear: latest?.audit_year || null,
    latestFacAcceptedDate: latest?.fac_accepted_date ?? null,
    findingRefs,
    repeatFindingRefs,
    soonestMdDeadline: soonest?.label ?? null,
    soonestMdDeadlineState: soonest?.state ?? null,
  };
}

/**
 * Alerts to raise given the persisted state (JSON columns already
 * parsed) and the current snapshot. Only called when a monitor_state
 * row exists — a brand-new watched EIN is baselined with no alerts.
 *
 * @returns {{type: 'new_audit'|'new_finding'|'repeat_finding'|'deadline', payload: object}[]}
 */
export function diffSnapshot(prev, next) {
  const alerts = [];

  if (next.latestReportId && next.latestReportId !== prev.latestReportId) {
    alerts.push({
      type: 'new_audit',
      payload: {
        reportId: next.latestReportId,
        auditYear: next.latestAuditYear,
        facAcceptedDate: next.latestFacAcceptedDate,
      },
    });
  }

  const prevFindings = new Set(prev.findingRefs ?? []);
  const prevRepeats = new Set(prev.repeatFindingRefs ?? []);
  const newRepeatRefs = next.repeatFindingRefs.filter((k) => !prevRepeats.has(k));
  const newRepeatSet = new Set(newRepeatRefs);

  // A repeat finding is also a new finding — report it once, as the
  // stronger signal.
  for (const ref of next.findingRefs) {
    if (prevFindings.has(ref) || newRepeatSet.has(ref)) continue;
    const [reportId, referenceNumber] = ref.split('::');
    alerts.push({ type: 'new_finding', payload: { ref, reportId, referenceNumber } });
  }
  for (const ref of newRepeatRefs) {
    const [reportId, referenceNumber] = ref.split('::');
    alerts.push({ type: 'repeat_finding', payload: { ref, reportId, referenceNumber } });
  }

  const inWindow =
    next.soonestMdDeadlineState === 'due-soon' || next.soonestMdDeadlineState === 'past';
  if (inWindow && next.soonestMdDeadline && next.soonestMdDeadline !== prev.mdDeadlineAlerted) {
    alerts.push({
      type: 'deadline',
      payload: { deadline: next.soonestMdDeadline, state: next.soonestMdDeadlineState },
    });
  }

  return alerts;
}
