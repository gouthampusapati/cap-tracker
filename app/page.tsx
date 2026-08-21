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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header. "Sign in" deliberately isn't primary nav here — there's
          no real onboarding behind it yet for a general visitor, and a
          CTA that leads nowhere useful costs more trust than it earns
          clicks (see the org-page CTA discussion — a general homepage
          visitor is a different, lower-intent audience than someone who
          self-identifies as an actual audited org). It's still reachable
          from the footer's Product column below. */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <img src="/brand/logo-mark.svg" alt="" className="h-7 w-7" />
            Single Audit Intelligence
          </h1>
          <div className="space-x-4">
            <Link href="/guide" className="text-accent hover:text-blue-800 font-semibold">
              Guide
            </Link>
            <Link href="/portfolio" className="text-accent hover:text-blue-800 font-semibold">
              Portfolio
            </Link>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 py-10 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-h1 sm:text-display font-bold text-gray-900 mb-3">
            Look up any organization&apos;s Single Audit findings
          </h2>
          <p className="text-body text-gray-600 mb-2 max-w-2xl mx-auto">
            Search the Federal Audit Clearinghouse. See audit findings and corrective action
            plans for any organization that receives federal awards.
          </p>
          {/* Independence statement — above the fold on purpose. The
              visual language here is institutional and the subject is
              federal; say plainly what this is so nobody has to infer
              it. */}
          <p className="text-caption text-gray-500 mb-6">
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
              without burying it. */}
          <div className="mt-5 flex flex-col items-center gap-1.5">
            <p className="text-small text-gray-600">Checking more than one organization?</p>
            <Link
              href="/portfolio"
              className="inline-block border-2 border-accent text-accent hover:bg-accent hover:text-white font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              Try the portfolio view — free, no account →
            </Link>
          </div>

          {/* Example links */}
          <div className="mt-8 text-sm text-gray-600">
            <p className="mb-3">Try these examples:</p>
            <div className="space-y-2">
              <Link href="/single-audit/916001236" className="text-accent hover:underline">
                City of Cheney, WA (916001236)
              </Link>
              <br />
              <Link href="/single-audit/742089103" className="text-accent hover:underline">
                Atascosa Health Center (742089103)
              </Link>
              <br />
              <Link href="/single-audit/421079767" className="text-accent hover:underline">
                Grinnell Housing Authority (421079767)
              </Link>
            </div>
          </div>
        </div>

        {/* Info sections. Both audience framings kept as explanation, but
            now point at working features — both straight into the real
            product (sign-in / portfolio), not the waitlist. Getting real
            first users into the actual product for feedback matters more
            here than filtering for "qualified" intent — see the org-page
            "Are you this organization?" CTA for the same reasoning. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 my-16">
          <div className="bg-white p-6 rounded-lg border border-gray-200">
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
            <h3 className="text-lg font-bold text-gray-900 mb-3">For Recipients</h3>
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

          <div className="bg-white p-6 rounded-lg border border-gray-200">
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
            <h3 className="text-lg font-bold text-gray-900 mb-3">For Pass-Throughs</h3>
            <p className="text-gray-600 mb-4">
              Monitor your subrecipients' audit findings. Check compliance status. Verify audit
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 my-16">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">What is a Single Audit?</h3>
          <p className="text-gray-700 mb-4">
            Organizations that receive $1,000,000 or more in federal awards in a single fiscal
            year must have a Single Audit — a comprehensive audit that includes compliance with
            federal requirements.
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
            asset/dependency for three icons. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-16">
          <div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-8 h-8 text-primary mb-2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M8 17V10M13 17V6M18 17v-4" />
            </svg>
            <h4 className="font-bold text-gray-900 mb-2">Audit History</h4>
            <p className="text-sm text-gray-600">
              See all years of audit history for any organization.
            </p>
          </div>
          <div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-8 h-8 text-primary mb-2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 4h11l-2.5 3.5L16 11H5" />
            </svg>
            <h4 className="font-bold text-gray-900 mb-2">Findings at a Glance</h4>
            <p className="text-sm text-gray-600">
              View findings by category, flag repeats, and track status.
            </p>
          </div>
          <div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="w-8 h-8 text-primary mb-2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v6h6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6M9 17h4" />
            </svg>
            <h4 className="font-bold text-gray-900 mb-2">CAP Text</h4>
            <p className="text-sm text-gray-600">
              Read the corrective action plans organizations filed with auditors.
            </p>
          </div>
        </div>

        {/* CTA Footer — the one CTA that's genuinely just general-interest
            capture (a visitor who hasn't self-identified as anything in
            particular — unlike "For Recipients"/"For Pass-Throughs"
            above, which now link straight into the real product). Copy
            stays present-tense and describes what's already free and
            live (search, portfolio) rather than promising a roadmap —
            "developing"/"building"/"help shape" all read as prototype,
            not product. The segment radio question (in WaitlistForm) is
            the actual point of this block: recipient-vs-pass-through is
            the question the whole strategy hangs on, and this is the one
            moment a visitor is motivated to answer it. The mark sits
            above the heading so the block reads as branded, not just an
            arbitrary dark box. */}
        <div className="bg-primary text-white rounded-lg p-8 text-center mb-16">
          <img src="/brand/logo-mark.svg" alt="" className="h-10 w-10 mx-auto mb-4" />
          <h3 className="text-2xl font-bold mb-3">Get notified</h3>
          <p className="text-white/80 mb-6 max-w-md mx-auto">
            Search and portfolio lookup are free and available now. Leave your email and
            we&apos;ll tell you when we add something you&apos;d use.
          </p>
          <WaitlistForm source="homepage-cta-band" className="max-w-md mx-auto" />
        </div>
      </div>

      <Footer />
    </div>
  );
}
