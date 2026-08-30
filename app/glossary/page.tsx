import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { Footer } from '@/app/footer';
import { JsonLd } from '@/app/json-ld';
import { breadcrumbList, definedTermSet } from '@/lib/structured-data';

const title = 'Single Audit Glossary';
const description =
  'Plain-language definitions of the terms on a Single Audit — auditee, pass-through entity, major program, low-risk auditee, questioned costs, material weakness, management decision, and more — each tied to its section of 2 CFR 200.';

const canonical = `${SITE_URL}/glossary`;

export const metadata: Metadata = {
  title: `${title} — Key Terms Defined | Single Audit Intelligence`,
  description,
  alternates: { canonical },
  openGraph: {
    title: `${title} | Single Audit Intelligence`,
    description,
    type: 'website',
    url: canonical,
    images: [{ url: `${SITE_URL}/opengraph-image.png`, width: 1200, height: 630 }],
  },
};

/**
 * One flat list, grouped only for reading. `definition` is the
 * plain-text version that feeds the DefinedTerm JSON-LD; `body` is the
 * on-page version and may carry links. Keep the two saying the same
 * thing. CFR citations are to 2 CFR 200 (the Uniform Guidance) unless
 * noted; verify anything load-bearing against the current eCFR text.
 */
type Term = {
  term: string;
  slug: string;
  definition: string;
  body: React.ReactNode;
};

type Group = { heading: string; terms: Term[] };

const CFR = (section: string, label: string) => (
  <a
    href={`https://www.ecfr.gov/current/title-2/section-200.${section}`}
    target="_blank"
    rel="noopener noreferrer"
    className="text-blue-600 hover:text-blue-800 underline"
  >
    {label}
  </a>
);

const GROUPS: Group[] = [
  {
    heading: 'The audit itself',
    terms: [
      {
        term: 'Single Audit',
        slug: 'single-audit',
        definition:
          'An organization-wide audit of a non-federal entity that expends federal award funds, covering both the financial statements and compliance with the requirements attached to the federal money. Governed by 2 CFR 200 Subpart F (the Uniform Guidance); formerly the "OMB A-133 audit."',
        body: (
          <>
            An organization-wide audit of a non-federal entity that expends federal award
            funds, covering both the financial statements and compliance with the rules
            attached to the federal money — one audit instead of a separate audit for every
            grant. Governed by {CFR('501', '2 CFR 200 Subpart F')} (the Uniform Guidance);
            formerly the &ldquo;OMB A-133 audit.&rdquo; See the{' '}
            <Link href="/faq" className="text-blue-600 hover:text-blue-800 underline">
              FAQ
            </Link>{' '}
            for how it differs from a plain financial statement audit.
          </>
        ),
      },
      {
        term: 'Program-specific audit',
        slug: 'program-specific-audit',
        definition:
          'An alternative to a full Single Audit, available when an entity expends federal awards under only one federal program (and the program’s statute does not require a financial statement audit). It audits that one program rather than the whole entity. See 2 CFR 200.507.',
        body: (
          <>
            An alternative to a full Single Audit, available when an entity expends federal
            awards under only one federal program and that program&apos;s statute
            doesn&apos;t require a financial statement audit. It audits the one program
            rather than the whole entity. {CFR('507', '2 CFR 200.507')}.
          </>
        ),
      },
      {
        term: 'Uniform Guidance (2 CFR 200)',
        slug: 'uniform-guidance',
        definition:
          'The Office of Management and Budget’s government-wide rules for federal awards, codified at 2 CFR Part 200: "Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards." Subpart F contains the Single Audit requirements. Effective December 2014; it superseded OMB Circular A-133.',
        body: (
          <>
            OMB&apos;s government-wide rules for federal awards, at{' '}
            <a
              href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              2 CFR Part 200
            </a>
            : &ldquo;Uniform Administrative Requirements, Cost Principles, and Audit
            Requirements for Federal Awards.&rdquo; Subpart F is the Single Audit part.
            Effective December 2014; it superseded OMB Circular A-133.
          </>
        ),
      },
      {
        term: 'Single Audit threshold',
        slug: 'threshold',
        definition:
          'The level of federal award expenditures in a fiscal year that triggers the Single Audit requirement: $1,000,000 for fiscal years beginning on or after October 1, 2024, and $750,000 before that. Based on funds expended, aggregated across all federal programs.',
        body: (
          <>
            The level of federal award expenditures in a fiscal year that triggers the
            requirement: <strong>$1,000,000</strong> for fiscal years beginning on or after
            October 1, 2024, and <strong>$750,000</strong> before that ({CFR('501', '2 CFR 200.501')}
            ). It&apos;s based on funds <em>expended</em>, aggregated across every federal
            program — not funds received or awarded.
          </>
        ),
      },
      {
        term: 'Federal Audit Clearinghouse (FAC)',
        slug: 'fac',
        definition:
          'The federal government’s official repository for Single Audit reporting packages, at fac.gov. Every Single Audit must be submitted there, and the resulting data is public record. Operated by the General Services Administration (previously by the Census Bureau).',
        body: (
          <>
            The federal government&apos;s official repository for Single Audit reporting
            packages, at{' '}
            <a
              href="https://www.fac.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              fac.gov
            </a>
            . Every Single Audit must be submitted there and the resulting data is public
            record. Operated by the General Services Administration (previously the Census
            Bureau). This site is built entirely on that public data.
          </>
        ),
      },
      {
        term: 'Reporting package',
        slug: 'reporting-package',
        definition:
          'What the auditee submits to the FAC: the financial statements and Schedule of Expenditures of Federal Awards, the summary schedule of prior audit findings, the auditor’s reports, the schedule of findings and questioned costs, and the corrective action plan. Due within the earlier of 30 days after receipt of the auditor’s reports or nine months after the audit period ends.',
        body: (
          <>
            What the auditee submits to the FAC: the financial statements and{' '}
            <Link href="/glossary#sefa" className="text-blue-600 hover:text-blue-800 underline">
              SEFA
            </Link>
            , the summary schedule of prior audit findings, the auditor&apos;s reports, the
            schedule of findings and questioned costs, and the{' '}
            <Link href="/glossary#cap" className="text-blue-600 hover:text-blue-800 underline">
              corrective action plan
            </Link>
            . Due within the earlier of 30 days after receipt of the auditor&apos;s reports
            or nine months after the audit period ends ({CFR('512', '2 CFR 200.512')}).
          </>
        ),
      },
      {
        term: 'Data Collection Form (SF-SAC)',
        slug: 'sf-sac',
        definition:
          'The structured form submitted with the reporting package that summarizes the audit results — auditee identification, the federal programs covered, and each finding. It is the source of most of the machine-readable FAC data.',
        body: (
          <>
            The structured form filed with the reporting package summarizing the audit
            results — auditee identification, the federal programs covered, and each finding.
            It&apos;s the source of most of the machine-readable data the FAC publishes.
          </>
        ),
      },
    ],
  },
  {
    heading: 'Who is involved',
    terms: [
      {
        term: 'Auditee',
        slug: 'auditee',
        definition:
          'The non-federal entity being audited — a state, local government, federally recognized tribe, institution of higher education, or nonprofit organization that expends federal awards.',
        body: (
          <>
            The non-federal entity being audited — a state, local government, federally
            recognized tribe, institution of higher education, or nonprofit that expends
            federal awards.
          </>
        ),
      },
      {
        term: 'Pass-through entity',
        slug: 'pass-through-entity',
        definition:
          'A non-federal entity that provides a federal award to a subrecipient to carry out part of a federal program. It is responsible for monitoring that subrecipient’s use of the funds and compliance (2 CFR 200.332).',
        body: (
          <>
            A non-federal entity that passes a federal award to a{' '}
            <Link
              href="/glossary#subrecipient"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              subrecipient
            </Link>{' '}
            to carry out part of a federal program. It must monitor that subrecipient&apos;s
            use of the funds and compliance —{' '}
            <Link
              href="/guide/subrecipient-monitoring"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              see the monitoring guide
            </Link>{' '}
            ({CFR('332', '2 CFR 200.332')}).
          </>
        ),
      },
      {
        term: 'Subrecipient',
        slug: 'subrecipient',
        definition:
          'An entity that receives a federal award from a pass-through entity to carry out part of a federal program. Distinguished from a contractor, which provides goods or services for the pass-through entity’s own use (2 CFR 200.331).',
        body: (
          <>
            An entity that receives a federal award from a pass-through entity to carry out
            part of a federal program. Distinct from a <em>contractor</em>, which provides
            goods or services for the pass-through entity&apos;s own use — the distinction
            drives who owes the Single Audit ({CFR('331', '2 CFR 200.331')}).
          </>
        ),
      },
      {
        term: 'Cognizant agency for audit',
        slug: 'cognizant-agency',
        definition:
          'For an auditee that expends more than $50 million a year in federal awards, the single federal agency assigned to provide audit oversight — generally the agency that provides the most direct funding. It reviews audit quality and coordinates management decisions.',
        body: (
          <>
            For an auditee expending more than <strong>$50 million</strong> a year in federal
            awards, the one federal agency assigned to provide audit oversight — generally the
            predominant direct funder. It reviews audit quality and coordinates{' '}
            <Link
              href="/glossary#management-decision"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              management decisions
            </Link>{' '}
            ({CFR('513', '2 CFR 200.513')}).
          </>
        ),
      },
      {
        term: 'Oversight agency for audit',
        slug: 'oversight-agency',
        definition:
          'The federal awarding agency that provides the predominant amount of direct funding to an auditee that does not have a cognizant agency (i.e. expends $50 million a year or less). It carries the oversight role in place of a cognizant agency.',
        body: (
          <>
            The federal awarding agency that provides the most direct funding to an auditee
            that <em>doesn&apos;t</em> have a{' '}
            <Link
              href="/glossary#cognizant-agency"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              cognizant agency
            </Link>{' '}
            (expends $50 million a year or less). An entity has one or the other, never both.
          </>
        ),
      },
      {
        term: 'Auditor',
        slug: 'auditor',
        definition:
          'An independent public accountant or a state or local government audit organization that performs the Single Audit. Must meet the independence and continuing-education standards of Government Auditing Standards (the Yellow Book).',
        body: (
          <>
            An independent CPA firm, or a state/local government audit organization, that
            performs the Single Audit and meets the independence and CPE standards of{' '}
            <em>Government Auditing Standards</em> (the Yellow Book). The{' '}
            <Link href="/auditors" className="text-blue-600 hover:text-blue-800 underline">
              auditor directory
            </Link>{' '}
            lists every firm that has filed one with the FAC.
          </>
        ),
      },
    ],
  },
  {
    heading: 'What gets tested',
    terms: [
      {
        term: 'Federal award',
        slug: 'federal-award',
        definition:
          'Federal financial assistance that a non-federal entity receives directly from a federal awarding agency or indirectly from a pass-through entity — grants, cost-reimbursement contracts under the Federal Acquisition Regulation, loans, loan guarantees, and other assistance. Does not include procurement contracts for goods and services.',
        body: (
          <>
            Federal financial assistance received directly from a federal agency or
            indirectly through a pass-through entity — grants, cooperative agreements, loans,
            loan guarantees, food commodities, and other assistance. Ordinary procurement
            contracts for goods and services are not federal awards.
          </>
        ),
      },
      {
        term: 'Expenditures of federal awards',
        slug: 'expenditures',
        definition:
          'The basis for the Single Audit threshold and for identifying major programs. Includes expenditure/expense transactions, the disbursement of pass-through funds, the use of loan proceeds, the receipt of property or food commodities, disbursements to subrecipients, and the amount of insurance in force — per 2 CFR 200.502.',
        body: (
          <>
            The measure that drives both the audit{' '}
            <Link href="/glossary#threshold" className="text-blue-600 hover:text-blue-800 underline">
              threshold
            </Link>{' '}
            and{' '}
            <Link
              href="/glossary#major-program"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              major program
            </Link>{' '}
            selection. Beyond cash outlays it includes disbursements to subrecipients, the use
            of loan proceeds, and the value of property or commodities received ({CFR('502', '2 CFR 200.502')}).
          </>
        ),
      },
      {
        term: 'Schedule of Expenditures of Federal Awards (SEFA)',
        slug: 'sefa',
        definition:
          'A schedule the auditee prepares listing every federal award expended in the period by program, Assistance Listing (formerly CFDA) number, and federal agency, separately identifying pass-through funding and amounts provided to subrecipients. Required by 2 CFR 200.510(b).',
        body: (
          <>
            A schedule the auditee prepares listing every federal award expended in the
            period — by program, Assistance Listing (formerly CFDA) number, and agency —
            separately identifying pass-through funding and amounts provided to
            subrecipients ({CFR('510', '2 CFR 200.510(b)')}). Every organization page on this
            site has a{' '}
            <span className="text-gray-600">Federal awards &amp; risk assessment</span> view
            built from it.
          </>
        ),
      },
      {
        term: 'Major program',
        slug: 'major-program',
        definition:
          'A federal program the auditor selects for in-depth compliance testing, using the risk-based approach in 2 CFR 200.518 — starting from dollar thresholds that separate larger Type A programs from smaller Type B programs, then adjusting for risk. Compliance testing focuses on the major programs, not every program.',
        body: (
          <>
            A federal program the auditor selects for in-depth compliance testing under the
            risk-based approach in {CFR('518', '2 CFR 200.518')} — starting from the{' '}
            <Link href="/glossary#type-a-type-b" className="text-blue-600 hover:text-blue-800 underline">
              Type A / Type B
            </Link>{' '}
            dollar split, then adjusting for risk. The compliance opinion is given per major
            program.
          </>
        ),
      },
      {
        term: 'Type A and Type B programs',
        slug: 'type-a-type-b',
        definition:
          'The dollar-size split in major-program determination. Type A programs are those above a threshold that scales with total federal expenditures (a floor of $750,000 for smaller auditees); Type B programs are those below it. Type A programs are audited as major more often; Type B programs are assessed for risk and a subset selected.',
        body: (
          <>
            The size split in{' '}
            <Link
              href="/glossary#major-program"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              major program
            </Link>{' '}
            determination. <strong>Type A</strong> programs sit above a threshold that scales
            with total federal expenditures (floor of $750,000); <strong>Type B</strong>{' '}
            programs sit below it. Type A programs are tested as major more often; a
            risk-assessed subset of Type B programs is added ({CFR('518', '2 CFR 200.518')}).
          </>
        ),
      },
      {
        term: 'Low-risk auditee',
        slug: 'low-risk-auditee',
        definition:
          'An auditee that met all of the criteria in 2 CFR 200.520 for both of the two preceding years — audits performed and submitted on time, unmodified opinions on the financial statements and SEFA, no going-concern doubt, and no material weaknesses or material noncompliance in major programs. It lets the auditor cover a lower percentage of total federal expenditures (20% rather than 40%).',
        body: (
          <>
            An auditee that met every criterion in {CFR('520', '2 CFR 200.520')} for both
            preceding years — audits done and filed on time, unmodified opinions on the
            financials and{' '}
            <Link href="/glossary#sefa" className="text-blue-600 hover:text-blue-800 underline">
              SEFA
            </Link>
            , no{' '}
            <Link
              href="/glossary#going-concern"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              going-concern
            </Link>{' '}
            doubt, and no material weaknesses or material noncompliance in major programs. The
            reward: the auditor must cover only <strong>20%</strong> of total federal
            expenditures instead of <strong>40%</strong>. Losing it roughly doubles audit
            scope — a real recurring cost. This site badges it per audit year.
          </>
        ),
      },
      {
        term: 'Compliance requirement',
        slug: 'compliance-requirement',
        definition:
          'One of the categories of rules attached to federal awards that the auditor tests for major programs — activities allowed, allowable costs, cash management, eligibility, equipment and real property management, matching, period of performance, procurement and suspension/debarment, program income, reporting, subrecipient monitoring, and special tests and provisions. Detailed each year in the OMB Compliance Supplement.',
        body: (
          <>
            One of the categories of award rules the auditor tests for major programs —
            allowable activities and costs, cash management, eligibility, matching, period of
            performance, procurement, reporting,{' '}
            <Link
              href="/guide/subrecipient-monitoring"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              subrecipient monitoring
            </Link>
            , and more. Each is a letter (A&ndash;P) detailed in the annual{' '}
            <a
              href="https://www.fac.gov/compliance/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              OMB Compliance Supplement
            </a>{' '}
            — the{' '}
            <Link
              href="/guide/compliance-requirements"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              guide breaks them down
            </Link>
            .
          </>
        ),
      },
    ],
  },
  {
    heading: 'Findings',
    terms: [
      {
        term: 'Audit finding',
        slug: 'finding',
        definition:
          'A deficiency the auditor is required to report — in internal control over compliance, in compliance with a federal program, questioned costs above the threshold, fraud, or a substantially inaccurate or incomplete SEFA. Each finding is numbered (e.g. 2024-001) and written up with a condition, criteria, cause, effect, and recommendation.',
        body: (
          <>
            A deficiency the auditor must report — in internal control over compliance, in
            compliance itself,{' '}
            <Link href="/glossary#questioned-costs" className="text-blue-600 hover:text-blue-800 underline">
              questioned costs
            </Link>{' '}
            above $25,000, fraud, or a substantially wrong{' '}
            <Link href="/glossary#sefa" className="text-blue-600 hover:text-blue-800 underline">
              SEFA
            </Link>
            . Numbered (e.g. 2024-001) and written up with condition, criteria, cause,
            effect, and recommendation ({CFR('516', '2 CFR 200.516')}). Findings are the core
            of what this site surfaces per organization.
          </>
        ),
      },
      {
        term: 'Questioned cost',
        slug: 'questioned-costs',
        definition:
          'A cost the auditor questions because it may violate an award term, is not supported by adequate documentation, or appears unreasonable. Reported as a finding when known questioned costs for a program exceed $25,000, and split between "known" (specifically identified) and "likely" (projected from a sample).',
        body: (
          <>
            A cost the auditor questions — possible violation of an award term, inadequate
            documentation, or an unreasonable amount. Reported as a{' '}
            <Link href="/glossary#finding" className="text-blue-600 hover:text-blue-800 underline">
              finding
            </Link>{' '}
            when known questioned costs for a program exceed <strong>$25,000</strong>, split
            into <em>known</em> (specifically identified) and <em>likely</em> (projected from
            a sample). A questioned cost is not the same as a disallowed cost — that comes
            later, if the agency makes it so.
          </>
        ),
      },
      {
        term: 'Material weakness',
        slug: 'material-weakness',
        definition:
          'A deficiency, or combination of deficiencies, in internal control over compliance such that there is a reasonable possibility that material noncompliance with a federal program will not be prevented, or detected and corrected, on a timely basis. The most severe internal-control finding category.',
        body: (
          <>
            A deficiency (or combination) in internal control over compliance severe enough
            that material noncompliance with a program could go unprevented or undetected.
            The most severe internal-control category — this site badges it per finding.
          </>
        ),
      },
      {
        term: 'Significant deficiency',
        slug: 'significant-deficiency',
        definition:
          'A deficiency, or combination of deficiencies, in internal control over compliance that is less severe than a material weakness yet important enough to merit attention by those charged with governance.',
        body: (
          <>
            A deficiency in internal control over compliance less severe than a{' '}
            <Link
              href="/glossary#material-weakness"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              material weakness
            </Link>{' '}
            but still important enough to report to those charged with governance.
          </>
        ),
      },
      {
        term: 'Material noncompliance',
        slug: 'material-noncompliance',
        definition:
          'Noncompliance with the compliance requirements of a major federal program that could have a material effect on that program. It results in a modified (qualified, adverse, or disclaimer) opinion on compliance for the program.',
        body: (
          <>
            Noncompliance with a major program&apos;s requirements large enough to have a
            material effect on the program — it produces a modified (qualified, adverse, or
            disclaimer) compliance opinion for that program.
          </>
        ),
      },
      {
        term: 'Repeat finding',
        slug: 'repeat-finding',
        definition:
          'A finding that was also reported in one or more prior audits and not fully resolved. The auditee must list it on the summary schedule of prior audit findings with the prior year’s finding number. A pattern of repeat findings is a risk factor in major-program selection and can cost an auditee its low-risk status.',
        body: (
          <>
            A finding also reported in a prior audit and not fully resolved — listed on the
            summary schedule of prior audit findings with the earlier finding number. A
            pattern of them is a risk factor in{' '}
            <Link
              href="/glossary#major-program"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              major-program
            </Link>{' '}
            selection and can cost an auditee its{' '}
            <Link
              href="/glossary#low-risk-auditee"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              low-risk status
            </Link>
            . Each repeat finding on this site shows the prior-year reference.
          </>
        ),
      },
      {
        term: 'Going concern',
        slug: 'going-concern',
        definition:
          'Substantial doubt, disclosed in the audit, about the entity’s ability to continue operating for a reasonable period. It is one of the conditions that disqualifies an auditee from low-risk status.',
        body: (
          <>
            Substantial doubt, disclosed in the audit, about the entity&apos;s ability to
            keep operating for a reasonable period. It disqualifies an auditee from{' '}
            <Link
              href="/glossary#low-risk-auditee"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              low-risk status
            </Link>{' '}
            — this site badges the audit years where it was disclosed.
          </>
        ),
      },
    ],
  },
  {
    heading: 'After the audit',
    terms: [
      {
        term: 'Corrective action plan (CAP)',
        slug: 'cap',
        definition:
          'The auditee’s written plan, prepared on its own letterhead and separate from the auditor’s findings, addressing each current-year finding: the responsible contact, the planned corrective action, and the anticipated completion date. Required by 2 CFR 200.511(c).',
        body: (
          <>
            The auditee&apos;s written plan — on its own letterhead, separate from the
            auditor&apos;s findings — addressing each current-year{' '}
            <Link href="/glossary#finding" className="text-blue-600 hover:text-blue-800 underline">
              finding
            </Link>
            : responsible contact, planned action, and target completion date ({CFR('511', '2 CFR 200.511(c)')}
            ). This site shows the CAP text alongside each finding.
          </>
        ),
      },
      {
        term: 'Summary schedule of prior audit findings',
        slug: 'summary-schedule',
        definition:
          'A schedule the auditee prepares reporting the status of every finding from the prior audit’s schedule of findings and questioned costs — fully corrected, not corrected (with reasons), or no longer valid. It is how repeat findings are identified.',
        body: (
          <>
            A schedule the auditee prepares reporting the status of each prior-year finding —
            corrected, not corrected (with reasons), or no longer valid ({CFR('511', '2 CFR 200.511(b)')}
            ). It&apos;s how{' '}
            <Link
              href="/glossary#repeat-finding"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              repeat findings
            </Link>{' '}
            are identified.
          </>
        ),
      },
      {
        term: 'Management decision',
        slug: 'management-decision',
        definition:
          'The written determination by a pass-through entity or federal awarding agency on whether it agrees with an audit finding and what corrective action is required, including any repayment. Due within six months of the FAC’s acceptance of the audit report (2 CFR 200.521).',
        body: (
          <>
            The written determination by a pass-through entity or federal agency on whether it
            agrees with a finding and what corrective action (including repayment) is
            required. Due within <strong>six months</strong> of the FAC accepting the audit
            report ({CFR('521', '2 CFR 200.521')}) — the{' '}
            <Link
              href="/guide/management-decisions"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              guide explains the clock
            </Link>
            , and the{' '}
            <Link href="/portfolio" className="text-blue-600 hover:text-blue-800 underline">
              portfolio view
            </Link>{' '}
            computes the deadline for every finding.
          </>
        ),
      },
      {
        term: 'Disallowed cost',
        slug: 'disallowed-cost',
        definition:
          'A charge to a federal award that the awarding agency or pass-through entity determines, in a management decision, to be unallowable — and typically requires the recipient to repay. A questioned cost becomes a disallowed cost only when that determination is made.',
        body: (
          <>
            A charge that the agency or pass-through entity determines, in a{' '}
            <Link
              href="/glossary#management-decision"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              management decision
            </Link>
            , to be unallowable — usually with repayment. A{' '}
            <Link
              href="/glossary#questioned-costs"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              questioned cost
            </Link>{' '}
            becomes disallowed only when that call is made.
          </>
        ),
      },
      {
        term: 'Audit resolution',
        slug: 'audit-resolution',
        definition:
          'The whole process of acting on audit findings — issuing management decisions, tracking corrective action to completion, and closing the findings. Federal agencies are expected to complete it within specified timeframes after the FAC receives the report.',
        body: (
          <>
            The whole process of acting on findings — issuing{' '}
            <Link
              href="/glossary#management-decision"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              management decisions
            </Link>
            , tracking corrective action to completion, and closing findings out.
          </>
        ),
      },
    ],
  },
];

const ALL_TERMS = GROUPS.flatMap((g) => g.terms);

export default function GlossaryPage() {
  const structuredData = [
    breadcrumbList([
      { name: 'Single Audit Intelligence', url: SITE_URL },
      { name: 'Glossary', url: canonical },
    ]),
    definedTermSet(
      'Single Audit Glossary',
      canonical,
      ALL_TERMS.map((t) => ({ term: t.term, slug: t.slug, definition: t.definition }))
    ),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd data={structuredData} />

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-3">Single Audit Glossary</h1>
          <p className="text-gray-600 mt-2 max-w-2xl">
            The terms that show up on a Single Audit and its findings, in plain language —
            each tied to its section of 2 CFR 200. For a fuller walkthrough see the{' '}
            <Link href="/guide" className="text-blue-600 hover:text-blue-800 underline">
              compliance guide
            </Link>{' '}
            and the{' '}
            <Link href="/faq" className="text-blue-600 hover:text-blue-800 underline">
              FAQ
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Jump list */}
        <nav aria-label="Glossary terms" className="mb-10 rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
            Jump to
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {ALL_TERMS.map((t) => (
              <li key={t.slug}>
                <a href={`#${t.slug}`} className="text-blue-600 hover:underline">
                  {t.term}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {GROUPS.map((group) => (
          <section key={group.heading} className="mb-10">
            <h2 className="text-h4 font-semibold text-gray-900 mb-4">{group.heading}</h2>
            <dl className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
              {group.terms.map((t) => (
                <div key={t.slug} id={t.slug} className="scroll-mt-20 p-5">
                  <dt className="font-semibold text-gray-900">{t.term}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-gray-700">{t.body}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 text-sm text-blue-900">
          These definitions are independent explanations of 2 CFR 200 (the OMB Uniform
          Guidance), not legal advice and not an official publication of OMB, GSA, or any
          federal agency. Verify anything that matters against{' '}
          <a
            href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold hover:text-blue-700"
          >
            the current text at eCFR.gov
          </a>
          .
        </div>

        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/guide" className="font-semibold text-blue-600 hover:text-blue-800">
            Compliance guide →
          </Link>
          <Link href="/faq" className="font-semibold text-blue-600 hover:text-blue-800">
            FAQ →
          </Link>
          <Link href="/single-audit" className="font-semibold text-blue-600 hover:text-blue-800">
            Look up an organization →
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
