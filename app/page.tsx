import Link from 'next/link';
import { Metadata } from 'next';
import { SITE_URL } from '@/lib/site-url';
import EinSearchForm from './ein-search-form';
import { WaitlistForm } from './waitlist-form';
import { Footer } from './footer';

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

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-14 sm:py-20 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h1 className="text-h1 sm:text-display font-medium tracking-tight text-gray-900 mb-4">
              Look up any organization&apos;s Single Audit findings
            </h1>
            <p className="text-lg text-gray-600 mb-2 max-w-2xl mx-auto font-light">
              Search the Federal Audit Clearinghouse. See audit findings and corrective action
              plans for any organization that receives federal awards.
            </p>
            {/* Independence statement — above the fold on purpose. The
                visual language here is institutional and the subject is
                federal; say plainly what this is so nobody has to infer
                it. */}
            <p className="text-caption text-gray-500 mb-8">
              Independent tool built on public Federal Audit Clearinghouse data. Not affiliated
              with GSA, OMB, or any federal agency.
            </p>

            {/* Search Box */}
            <EinSearchForm />

            {/* Portfolio promotion — a real second action in the hero, not
                a footnote under the search box. The genuinely
                differentiated, working, no-login feature deserves more
                than an inline text mention; outline style keeps it
                visually secondary to the primary Search button above
                without burying it. Pushed further down (mt-8, was mt-5)
                so search reads as the undeniable single focal point per
                the redesign brief. */}
            <div className="mt-8 flex flex-col items-center gap-1.5">
              <p className="text-small text-gray-600">Checking more than one organization?</p>
              <Link
                href="/portfolio"
                className="inline-block border-2 border-accent text-accent hover:bg-accent hover:text-white font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                Try the portfolio view — free, no account →
              </Link>
            </div>

            {/* Example links — clickable chips, not plain text links +
                <br>, per the redesign brief's Components section.
                tabular-nums keeps the EINs from jittering in width as
                the eye scans across them. */}
            <div className="mt-10">
              <p className="text-small text-gray-500 mb-3">Try these examples</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/single-audit/916001236"
                  className="inline-flex items-center gap-1.5 text-small text-gray-700 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-card hover:shadow-card-hover hover:border-accent/40 hover:text-accent transition-all"
                >
                  City of Cheney, WA
                  <span className="text-gray-400 tabular-nums">916001236</span>
                </Link>
                <Link
                  href="/single-audit/742089103"
                  className="inline-flex items-center gap-1.5 text-small text-gray-700 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-card hover:shadow-card-hover hover:border-accent/40 hover:text-accent transition-all"
                >
                  Atascosa Health Center
                  <span className="text-gray-400 tabular-nums">742089103</span>
                </Link>
                <Link
                  href="/single-audit/421079767"
                  className="inline-flex items-center gap-1.5 text-small text-gray-700 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-card hover:shadow-card-hover hover:border-accent/40 hover:text-accent transition-all"
                >
                  Grinnell Housing Authority
                  <span className="text-gray-400 tabular-nums">421079767</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Info sections. Both audience framings kept as explanation, but
            now point at working features — straight into the real
            product (dashboard / portfolio), not the waitlist. "For
            Recipients" now routes through /auth/signin rather than
            straight into a guest workspace — same reversal, and same
            reasoning, as the org-page "Are you this organization?" CTA
            (see app/single-audit/[ein]/page.tsx). "For Pass-Throughs"
            still goes straight to /portfolio, which needs no account. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-24">
          <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
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
              Track your Single Audit findings across years. Monitor repeat-finding risk. Stay
              on top of corrective action plans.
            </p>
            <Link
              href="/auth/signin"
              className="inline-block bg-accent hover:opacity-90 text-white font-semibold px-4 py-2 rounded"
            >
              Start tracking findings →
            </Link>
          </div>

          <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200">
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
              Monitor your subrecipients' audit findings and filing records. Verify audit
              history.
            </p>
            <Link
              href="/portfolio"
              className="inline-block bg-accent hover:opacity-90 text-white font-semibold px-4 py-2 rounded"
            >
              Start monitoring →
            </Link>
          </div>
        </div>

        {/* What is a Single Audit? */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 sm:p-10 my-24">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">What is a Single Audit?</h2>
          <p className="text-gray-700 mb-4">
            A non-Federal entity that expends $1,000,000 or more during the non-Federal entity&apos;s
            fiscal year in Federal awards must have a single or program-specific audit conducted
            for that year in accordance with the provisions of this part.
          </p>
          <p className="text-gray-700 mb-4">
            When auditors find a problem, they report it as a "finding." The organization must
            respond with a Corrective Action Plan (CAP). If the problem shows up again in the
            next year's audit, it becomes a "repeat finding" — a risk flag for federal agencies.
          </p>
          <p className="text-gray-700">
            All Single Audit data is public domain and lives in the{' '}
            <a
              href="https://www.fac.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-blue-600 hover:text-blue-800"
            >
              Federal Audit Clearinghouse
            </a>
            . This site makes it easier to find and understand that data.
          </p>
        </div>

        {/* Features. Inline SVG on the token palette, not emoji — a
            precise, institutional tone doesn't read well with emoji, and
            currentColor lets these inherit text-primary without a new
            asset/dependency for three icons. Wrapped in a bg-surface-alt
            "mist" panel — the alternating section rhythm the redesign
            brief asks for (white hero/cards → tinted explainer → mist
            feature panel → dark CTA), without a full-bleed background
            change that would be a bigger structural departure. */}
        <div className="bg-surface-alt rounded-2xl p-10 sm:p-12 my-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Each item "lights up" on hover — bg-white + shadow lifts
                it off the mist panel, icon shifts to the accent color —
                the cursor-follows-the-section feedback Stripe uses on
                its own feature grids, even though these aren't links.
                -m-5 p-5 so the larger hit/highlight area doesn't change
                the grid's outer spacing. */}
            <div className="group -m-5 p-5 rounded-xl transition-all duration-200 hover:bg-white hover:shadow-card">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-8 h-8 text-primary mb-3 transition-colors duration-200 group-hover:text-accent"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M8 17V10M13 17V6M18 17v-4" />
              </svg>
              <h3 className="font-semibold text-gray-900 mb-2">Audit History</h3>
              <p className="text-sm text-gray-600">
                See all years of audit history for any organization.
              </p>
            </div>
            <div className="group -m-5 p-5 rounded-xl transition-all duration-200 hover:bg-white hover:shadow-card">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-8 h-8 text-primary mb-3 transition-colors duration-200 group-hover:text-accent"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2.5 3.5L16 11H5" />
              </svg>
              <h3 className="font-semibold text-gray-900 mb-2">Findings at a Glance</h3>
              <p className="text-sm text-gray-600">
                View findings by category, flag repeats, and track status.
              </p>
            </div>
            <div className="group -m-5 p-5 rounded-xl transition-all duration-200 hover:bg-white hover:shadow-card">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-8 h-8 text-primary mb-3 transition-colors duration-200 group-hover:text-accent"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v6h6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h4" />
              </svg>
              <h3 className="font-semibold text-gray-900 mb-2">CAP Text</h3>
              <p className="text-sm text-gray-600">
                Read the corrective action plans organizations filed with auditors.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Footer — the one CTA that's genuinely just general-interest
          capture (a visitor who hasn't self-identified as anything in
          particular — unlike "For Recipients"/"For Pass-Throughs"
          above, which link straight into the real product). Named as
          its own product ("Single Audit Watchlist"), not generic
          "early access to enterprise features" framing — the three
          alerts plus the monthly exception report are concrete
          features, not a vague pitch. Still deliberately does NOT
          mention repeat-finding alerts: that consequence thesis was
          tested against real data and falsified, so it's not a claim
          this site makes — reconfirmed (not just inherited) when this
          copy was rewritten, since the new draft initially included it
          and that was caught and removed before shipping. The role
          radio question (in WaitlistForm) is the actual point of this
          block: recipient vs. pass-through vs. adviser/auditor is the
          split the whole strategy hangs on, and this is the one moment
          a visitor is motivated to answer it.

          Full-bleed, light mist background (bg-surface-alt), not a dark
          box — went back to the actual stripe.com production site
          rather than guess a third time: their own "Ready to get
          started?" CTA-before-footer section is a light mist tone
          (#F8FAFD, confirmed via computed style), not dark, and their
          footer is that exact same light color too — no color break at
          all between the two. app/footer.tsx now matches this
          section's bg-surface-alt for the same reason. No rounded
          corners, no bottom margin, so it still flows directly into the
          Footer with zero gap. */}
      <div className="bg-surface-alt text-gray-900 text-center py-16 sm:py-20">
        {/* max-w-2xl, not max-w-md — that narrower width was sized for
            just the form and left the heading (now the longer
            "Enterprise-Grade..." version) wrapping across 3 cramped
            lines, visibly narrower than every other heading on the
            page. Heading/body copy get the wider column; the form
            itself stays at max-w-md (passed via className below) so the
            email input/button don't stretch into an awkwardly wide
            single row. */}
        <div className="max-w-2xl mx-auto px-4">
          {/* logo-mark.png — the current red/navy "SAI" mark. This
              section is light, so no dark-background knockout variant
              is needed here. */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src="/brand/logo-mark.png" alt="" className="h-8 w-8" />
            <span className="text-lg font-semibold text-gray-900">Single Audit Intelligence</span>
          </div>
          <h2 className="text-2xl font-bold mb-1">Single Audit Watchlist</h2>
          <p className="text-base font-semibold text-accent mb-3">
            Continuous monitoring for pass-through entities
          </p>
          {/* Left-aligned, not centered — a ragged left edge costs
              nothing on a two-line tagline but makes multi-line body
              copy harder to skim; this audience is skimming. max-w-md
              mx-auto so this block lines up with the form directly
              below it — only the heading above uses the full max-w-2xl
              width, to give it breathing room without also stretching
              the paragraph/bullets wider than the form they lead into.
              "Up to 100" — not an arbitrary round number. Checked
              against the FAC's full national pass-through dataset
              (225k entities): a 100-subrecipient cap covers 99.8% of
              every pass-through entity that exists, so a real
              state-agency-scale customer practically never hits it. */}
          <div className="text-left mb-4 space-y-3 max-w-md mx-auto">
            <div>
              <p className="text-gray-600 mb-2">
                Monitor up to 100 named subrecipients and get alerted when:
              </p>
              <ul className="list-disc list-outside pl-5 text-gray-600 space-y-1">
                <li>A new FAC audit is accepted</li>
                <li>A new finding appears</li>
                <li>A management decision deadline is approaching</li>
              </ul>
            </div>
            <p className="text-gray-600">Plus: a monthly portfolio exception report.</p>
          </div>
          <p className="font-semibold text-gray-900 mb-4">
            Coming soon — join the early-access list
          </p>
          <WaitlistForm source="homepage-cta-band" variant="light" className="max-w-md mx-auto" />
        </div>
      </div>

      <Footer />
    </div>
  );
}
