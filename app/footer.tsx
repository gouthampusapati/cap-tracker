import Link from 'next/link';

/**
 * Shared 3-column footer (Product / Resources / Legal), replacing the
 * inline footer block every page used to duplicate. Phase 4 of the
 * UI/branding overhaul — see /Users/Bunnu/.claude/plans/merry-enchanting-kay.md.
 *
 * Before this, 7 of 8 pages had byte-identical footer text and the
 * homepage alone had a slightly different (shorter) wording — one
 * canonical string here closes that gap. Also fixes the one stale
 * legal citation on the site: "OMB Circular A-133" was superseded by
 * the Uniform Guidance (2 CFR 200) in 2014.
 *
 * Rendered on every page (not just the homepage) so Privacy/Terms are
 * reachable everywhere, not just from "/" — a footer link 404 from a
 * page that doesn't even have the link isn't better than one that does.
 */
export function Footer() {
  return (
    // bg-surface-alt, not a dark fill — checked the actual stripe.com
    // production site (per the redesign brief's own reference) rather
    // than guess again: their "Ready to get started?" CTA and their
    // footer are BOTH the same light mist tone (#F8FAFD, computed style
    // confirmed live), not dark. Matches our own --color-surface-alt
    // token almost exactly, and now matches the homepage CTA band
    // directly above this (see app/page.tsx) — same light color, same
    // reasoning as the "two different darks clash" fix before, just
    // resolved by going light like Stripe actually does instead of by
    // matching two darks.
    <div className="bg-surface-alt text-gray-600 py-8 border-t border-gray-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h4 className="font-bold text-gray-900 mb-3">Product</h4>
            <ul className="text-sm space-y-2">
              <li>
                <Link href="/" className="hover:text-gray-900">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/single-audit" className="hover:text-gray-900">
                  Organization lookup
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className="hover:text-gray-900">
                  Portfolio
                </Link>
              </li>
              <li>
                <Link href="/auditors" className="hover:text-gray-900">
                  Auditor directory
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-gray-900">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/auth/signin" className="hover:text-gray-900">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-gray-900 mb-3">Resources</h4>
            <ul className="text-sm space-y-2">
              <li>
                <a
                  href="https://www.fac.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900"
                >
                  Federal Audit Clearinghouse
                </a>
              </li>
              <li>
                <a
                  href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900"
                >
                  2 CFR 200 (Uniform Guidance)
                </a>
              </li>
              <li>
                {/* Same URL/label already used in
                    app/guide/compliance-requirements/page.tsx — this is
                    the specific document auditors and pass-throughs
                    actually cite, more useful here than a link to the
                    eCFR homepage. */}
                <a
                  href="https://www.fac.gov/compliance/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900"
                >
                  Compliance Supplement
                </a>
              </li>
              <li>
                <Link href="/guide" className="hover:text-gray-900">
                  Compliance guide
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-gray-900">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-gray-900 mb-3">Legal</h4>
            <ul className="text-sm space-y-2 mb-3">
              <li>
                <Link href="/privacy" className="hover:text-gray-900">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-gray-900">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-gray-900">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-gray-900">
                  Contact
                </Link>
              </li>
            </ul>
            <p className="text-xs">
              Single Audit Intelligence is an independent tool powered by Federal Audit
              Clearinghouse data. Not affiliated with GSA, OMB, or any federal agency.
            </p>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-8 text-xs text-gray-500 text-center">
          <p>© 2026 Single Audit Intelligence. All data is public domain.</p>
        </div>
      </div>
    </div>
  );
}
