import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import EinSearchForm from './ein-search-form';
import { FoundingCtaButton } from './founding-cta-button';
import { Footer } from './footer';
import { HomeSampleCard } from './home-sample-card';
import { HomePortfolioMockup } from './home-portfolio-mockup';
import { HomeFacVsMonitoring } from './home-fac-vs-monitoring';
import { HomeTheProblem } from './home-the-problem';
import { HomeFeatureGrid } from './home-feature-grid';
import { SITE_STATS, approxCount } from '@/lib/site-stats';
import { JsonLd } from './json-ld';
import { organization, webSite } from '@/lib/structured-data';

const title = 'Single Audit Intelligence';
const description =
  'Search the Federal Audit Clearinghouse. See audit findings and corrective action plans for any organization that receives federal awards.';

export const metadata: Metadata = {
  title,
  description,
  // The homepage previously had no canonical tag at all — it's a client
  // component (needs the EIN search form's state/router), and Next's
  // metadata API only works in Server Components, so it silently fell
  // back to the root layout's metadata, which doesn't set alternates.
  // Splitting the interactive form out to ein-search-form.tsx lets this
  // file be a plain Server Component that can declare its own canonical,
  // same as every other page.
  alternates: { canonical: SITE_URL },
  openGraph: {
    title,
    description,
    type: 'website',
    url: SITE_URL,
  },
};

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top-level entity + site search action. Every other page's
          JSON-LD carries an Organization node inside a breadcrumb or
          service shape; the homepage is where it's declared standalone,
          alongside the WebSite SearchAction. */}
      <JsonLd data={[organization(), webSite()]} />

      {/* The site-wide sticky header (app/header.tsx, mounted in
          app/layout.tsx) now covers brand + Guide/Portfolio nav + Sign
          in/Get Started — this page no longer renders its own. */}

      {/* Hero. relative + overflow-hidden contains the decorative blurred
          shapes below without letting them affect page layout/scroll
          width; the actual content sits in a `relative z-10` wrapper so
          it always renders above them. Stripe-inspired redesign pass —
          existing brand blues, not Stripe's violet (see the plan's
          Context section for why). */}
      <div className="relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute top-24 -left-32 w-80 h-80 bg-accent-soft/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute top-0 left-1/3 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 max-w-6xl mx-auto px-4 py-12 sm:py-16 lg:py-20 sm:px-6 lg:px-8">
          {/* ~1.618 : 1 column split (golden ratio) — the left column
              carries the headline, search, and supporting actions, so it
              earns the larger share; the preview card is a supporting
              visual. items-center so the card sits against the vertical
              midpoint of the taller left column rather than top-aligning
              and leaving a block of dead space beneath it. */}
          <div className="lg:grid lg:grid-cols-[1.618fr_1fr] lg:gap-12 lg:items-center">
            {/* Left column, in four deliberate tiers with widening gaps
                (identity → primary action → the two paths → examples), so
                the eye is led down instead of meeting six evenly-spaced
                blocks of equal weight. Centered on mobile/tablet (search
                is the single focal point there); left-aligned once the
                preview card sits beside it. */}
            <div className="text-center lg:text-left">
              {/* Tier 1 — identity + the dual-path promise */}
              <h1 className="text-h1 sm:text-display font-medium tracking-tight text-balance text-gray-900 mb-3">
                Look up any organization&apos;s Single Audit findings
              </h1>
              <p className="text-lg text-gray-600 mb-2 max-w-2xl mx-auto lg:mx-0 font-light">
                Search the Federal Audit Clearinghouse free — or let us monitor your whole
                portfolio and surface only the organizations that changed.
              </p>
              {/* Independence statement — above the fold on purpose. The
                  visual language here is institutional and the subject is
                  federal; say plainly what this is so nobody has to infer
                  it. */}
              <p className="text-caption text-gray-500">
                Independent tool built on public Federal Audit Clearinghouse data. Not affiliated
                with GSA, OMB, or any federal agency.
              </p>

              {/* Tier 2 — the primary action, given the most air */}
              <div className="mt-9">
                <EinSearchForm />
              </div>

              {/* Tier 3 — the two paths from the promise line, as matched
                  peers: research-at-scale (a real, working, no-login
                  tool) and monitoring (the paid product, scrolls to the
                  mockup below). The monitoring button is a step lighter
                  so it doesn't imply parity with the free portfolio tool,
                  but it's a first-class action here, not a trailing text
                  link. Side by side on wide screens, stacked below. */}
              <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <Link
                  href="/portfolio"
                  className="inline-block text-center border-2 border-accent text-accent hover:bg-accent hover:text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  Try the portfolio view — free →
                </Link>
                <a
                  href="#how-monitoring-works"
                  className="inline-block text-center border-2 border-gray-300 text-gray-700 hover:border-accent hover:text-accent font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  See how monitoring works →
                </a>
              </div>
              <p className="mt-2 text-caption text-gray-500">
                The portfolio view is free and needs no account.
              </p>

              {/* Tier 4 — examples, the tertiary tail. Clickable chips,
                  not plain links + <br>. Just the org name (no EIN) so
                  the three fit one row; the link still carries the EIN.
                  PROPEL Nonprofits is a GOING CONCERN record on purpose,
                  so the chips reinforce the preview card. */}
              <div className="mt-8">
                <p className="text-caption text-gray-500 mb-2">Try these examples</p>
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-1.5">
                  <Link
                    href="/single-audit/916001236"
                    className="whitespace-nowrap rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-card transition-all hover:border-accent/40 hover:text-accent hover:shadow-card-hover"
                  >
                    City of Cheney, WA
                  </Link>
                  <Link
                    href="/single-audit/411916337"
                    className="whitespace-nowrap rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-card transition-all hover:border-accent/40 hover:text-accent hover:shadow-card-hover"
                  >
                    PROPEL Nonprofits
                  </Link>
                  <Link
                    href="/single-audit/421079767"
                    className="whitespace-nowrap rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 shadow-card transition-all hover:border-accent/40 hover:text-accent hover:shadow-card-hover"
                  >
                    Grinnell Housing Authority
                  </Link>
                </div>
              </div>
            </div>

            {/* Right column — a static recreation of an org page card, so
                the payoff of searching is visible before a visitor
                commits to typing an EIN (redesign brief, Section 1).
                Dialled back — no shadow (in home-sample-card.tsx), 80%
                opacity beside the search, so it reads as a supporting
                illustration rather than competing with the search box
                for the first click. Full strength on mobile, where it's
                the stand-alone "here's the payoff" below the search. */}
            <div className="mt-12 lg:mt-0 lg:opacity-80">
              <HomeSampleCard />
            </div>
          </div>
        </div>
      </div>

      {/* Stat bar — real row counts from the FAC bulk mirror
          (lib/site-stats.json, refreshed each weekly sync). A standard
          trust device for a data product; numbers are rounded down with
          a "+" since the mirror is a subset of FAC's full history. */}
      <div className="border-y border-border bg-surface-alt">
        <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <dl className="grid grid-cols-2 gap-y-6 text-center sm:grid-cols-4">
            <div>
              <dt className="text-h3 font-semibold tabular-nums text-gray-900">
                {approxCount(SITE_STATS.organizations)}
              </dt>
              <dd className="mt-1 text-small text-gray-600">Organizations</dd>
            </div>
            <div>
              <dt className="text-h3 font-semibold tabular-nums text-gray-900">
                {approxCount(SITE_STATS.auditReports)}
              </dt>
              <dd className="mt-1 text-small text-gray-600">Single audits indexed</dd>
            </div>
            <div>
              <dt className="text-h3 font-semibold tabular-nums text-gray-900">
                {approxCount(SITE_STATS.findings)}
              </dt>
              <dd className="mt-1 text-small text-gray-600">Audit findings</dd>
            </div>
            <div>
              <dt className="text-h3 font-semibold tabular-nums text-gray-900">
                {approxCount(SITE_STATS.auditFirms)}
              </dt>
              <dd className="mt-1 text-small text-gray-600">Audit firms</dd>
            </div>
          </dl>
          <p className="mt-6 text-center text-caption text-gray-500">
            Covering fiscal years {SITE_STATS.earliestAuditYear}–present · mirrored from the{' '}
            <a
              href="https://www.fac.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-accent"
            >
              Federal Audit Clearinghouse
            </a>{' '}
            and refreshed weekly
          </p>
        </div>
      </div>

      {/* Portfolio monitoring mockup — the primary product visual, and
          the target of the hero's "See how monitoring works →" link.
          Static / illustrative (invented org names, labelled). */}
      <HomePortfolioMockup />

      {/* PR-1: names the institutional-memory problem explicitly, mapped
          honestly to shipped vs planned answers, ahead of the by-hand
          vs monitored comparison below. */}
      <HomeTheProblem />

      {/* Why FAC alone isn't enough — the manual loop vs. the monitored
          one, then a Free-research-vs-Founding-monitoring capability
          table. Static; the paid column is framed as the Founding
          Customer Program, not "live today". */}
      <HomeFacVsMonitoring />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Info sections. Both audience framings kept as explanation, but
            now point at working features — straight into the real
            product (dashboard / portfolio), not the waitlist. "For
            Recipients" now routes through /auth/signin rather than
            straight into a guest workspace — same reversal, and same
            reasoning, as the org-page "Are you this organization?" CTA
            (see app/single-audit/[ein]/page.tsx). "For Pass-Throughs"
            still goes straight to /portfolio, which needs no account. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 mb-16">
          <div className="flex flex-col bg-white p-8 rounded-xl border border-gray-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-8 h-8 text-primary mb-3"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 21V7a1 1 0 011-1h6a1 1 0 011 1v14M14 21v-8a1 1 0 011-1h4a1 1 0 011 1v8M4 21h16"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 9h.01M7.5 12h.01M7.5 15h.01M10.5 9h.01M10.5 12h.01M10.5 15h.01"
              />
            </svg>
            <h2 className="text-lg font-bold text-gray-900 mb-3">For Recipients</h2>
            <p className="text-gray-600 mb-4">
              Track your Single Audit findings across years. Watch for repeat-finding risk. Stay
              on top of corrective action plans.
            </p>
            <Link
              href="/auth/signin"
              className="mt-auto self-start bg-accent hover:opacity-90 text-white font-semibold px-4 py-2 rounded"
            >
              Start tracking findings →
            </Link>
          </div>

          <div className="flex flex-col bg-white p-8 rounded-xl border border-gray-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-8 h-8 text-primary mb-3"
              aria-hidden="true"
            >
              <circle cx="12" cy="5" r="2" />
              <circle cx="5" cy="19" r="2" />
              <circle cx="12" cy="19" r="2" />
              <circle cx="19" cy="19" r="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v3M12 10L6.5 17M12 10v7M12 10l5.5 7" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900 mb-3">For Pass-Throughs</h2>
            <p className="text-gray-600 mb-4">
              Check your whole subrecipient list at once — audit findings, filing records,
              management-decision deadlines. Verify audit history.
            </p>
            <Link
              href="/portfolio"
              className="mt-auto self-start bg-accent hover:opacity-90 text-white font-semibold px-4 py-2 rounded"
            >
              Open the portfolio view →
            </Link>
          </div>

          {/* For Auditors — the directory is built (Sprint C) but the
              homepage never pointed a firm at it. Framed as a
              record/benchmarking tool, not a lead-gen pitch. */}
          <div className="flex flex-col bg-white p-8 rounded-xl border border-gray-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-8 h-8 text-primary mb-3"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h10M3 12h7M3 18h7M15 13l6 6M20 11.5a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900 mb-3">For Auditors</h2>
            <p className="text-gray-600 mb-4">
              Look up any firm&apos;s Single Audit track record — client roster, audit counts,
              findings history. Benchmark against peers, or show a prospective client your record.
            </p>
            <Link
              href="/auditors"
              className="mt-auto self-start bg-accent hover:opacity-90 text-white font-semibold px-4 py-2 rounded"
            >
              Browse the directory →
            </Link>
          </div>
        </div>

        <HomeFeatureGrid />

        {/* "What is a Single Audit?" — a heavy definition paragraph in
            the middle of the page interrupts product discovery, so it's
            collapsed by default and sits at the end. Native <details>:
            no JS, and the text stays in the DOM for search + anyone who
            actually wants the primer. */}
        <details className="group mt-16 rounded-xl border border-gray-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 [&::-webkit-details-marker]:hidden">
            <h2 className="text-lg font-semibold text-gray-900">What is a Single Audit?</h2>
            <svg
              className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z"
                clipRule="evenodd"
              />
            </svg>
          </summary>
          <div className="space-y-4 border-t border-gray-200 px-6 pb-6 pt-4 text-gray-700">
            <p>
              A non-Federal entity that expends $1,000,000 or more during the non-Federal
              entity&apos;s fiscal year in Federal awards must have a single or program-specific
              audit conducted for that year in accordance with the provisions of this part.
            </p>
            <p>
              When auditors find a problem, they report it as a &ldquo;finding.&rdquo; The
              organization must respond with a Corrective Action Plan (CAP). If the problem shows
              up again in the next year&apos;s audit, it becomes a &ldquo;repeat finding&rdquo; — a
              risk flag for federal agencies.
            </p>
            <p>
              All Single Audit data is public domain and lives in the{' '}
              <a
                href="https://www.fac.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-blue-600 hover:text-blue-800"
              >
                Federal Audit Clearinghouse
              </a>
              . This site adds the structure raw FAC search doesn&apos;t: risk badges, deadline
              tracking, and views across organizations and firms.
            </p>
          </div>
        </details>
      </div>

      {/* CTA Footer — the Founding Customer entry point for a visitor
          who's scrolled the whole homepage without self-identifying
          (unlike "For Recipients"/"For Pass-Throughs" above, which link
          straight into the real product). The three alerts plus the
          monthly exception report are concrete features, not a vague
          pitch, and the copy is honest that we're "onboarding a limited
          number of founding customers" rather than claiming the product
          is finished. Still deliberately does NOT advertise
          repeat-finding alerts: that consequence thesis was tested
          against real data and falsified, so it's not a claim this site
          makes — reconfirmed each time this copy is rewritten.

          This band is a teaser + a single button, NOT its own form:
          everyone goes through the one qualifying form on
          /pricing#founding-form so we're not maintaining two capture
          paths that drift out of sync. FoundingCtaButton fires the
          monitor-CTA-click event with surface:'homepage-band'.

          Full-bleed, light mist background (bg-surface-alt), not a dark
          box — matches the actual stripe.com production site's
          "Ready to get started?" CTA-before-footer section (#F8FAFD,
          confirmed via computed style), and app/footer.tsx matches this
          section's bg-surface-alt so there's no color break into the
          footer. No rounded corners, no bottom margin. */}
      <div className="bg-surface-alt text-gray-900 text-center py-16 sm:py-20">
        <div className="max-w-2xl mx-auto px-4">
          {/* logo-mark.png — the current red/navy "SAI" mark. This
              section is light, so no dark-background knockout variant
              is needed here. */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src="/brand/logo-mark.png" alt="" className="h-8 w-8" />
            <span className="text-lg font-semibold text-gray-900">Single Audit Intelligence</span>
          </div>
          <h2 className="text-2xl font-bold mb-1">Stop checking. Start monitoring.</h2>
          <p className="text-base font-semibold text-accent mb-3">
            Continuous monitoring of the Federal Audit Clearinghouse
          </p>
          {/* Left-aligned, not centered — a ragged left edge costs
              nothing on a two-line tagline but makes multi-line body
              copy harder to skim; this audience is skimming. max-w-md
              mx-auto keeps this list narrow and centered under the
              heading. "Up to 100" — not an arbitrary round number.
              Checked against the FAC's full national pass-through
              dataset (225k entities): a 100-subrecipient cap covers
              99.8% of every pass-through entity that exists, so a real
              state-agency-scale customer practically never hits it. */}
          <div className="text-left mb-4 space-y-3 max-w-md mx-auto">
            <div>
              <p className="text-gray-600 mb-2">
                Keep up to 100 organizations in one monitored portfolio and get alerted when:
              </p>
              <ul className="list-disc list-outside pl-5 text-gray-600 space-y-1">
                <li>A new FAC audit is accepted</li>
                <li>A new finding appears</li>
                <li>A management decision deadline is approaching</li>
              </ul>
            </div>
            <p className="text-gray-600">Plus: a monthly portfolio exception report.</p>
          </div>
          <p className="font-semibold text-gray-900 mb-1">
            We&apos;re onboarding a limited number of founding customers.
          </p>
          <p className="text-sm text-gray-600 mb-4">
            $3,600 for your first year, then a locked founding rate. See{' '}
            <Link href="/pricing#founding" className="underline font-semibold hover:text-accent">
              full founding pricing
            </Link>
            .
          </p>
          <FoundingCtaButton surface="homepage-band" />
          <p className="text-xs text-gray-500 mt-3">
            Takes you to a short form about what you need to monitor — not a checkout.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
