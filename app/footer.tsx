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
    // bg-primary (the actual brand dark green), not the generic
    // bg-gray-900 this used to be — the homepage's early-access CTA
    // band directly above the footer is also bg-primary, and two
    // different near-black-but-not-quite-matching darks stacked back to
    // back read as a color-system mismatch, not a deliberate "dark
    // footer zone." border-white/10 instead of border-gray-800 for the
    // same reason — a fixed gray border barely shows against this
    // particular dark green and doesn't visually scale with it.
    <div className="bg-primary text-gray-300 py-8 border-t border-white/10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h4 className="font-bold text-white mb-3">Product</h4>
            <ul className="text-sm space-y-2">
              <li>
                <Link href="/" className="hover:text-white">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/portfolio" className="hover:text-white">
                  Portfolio
                </Link>
              </li>
              <li>
                <Link href="/guide" className="hover:text-white">
                  Compliance guide
                </Link>
              </li>
              <li>
                <Link href="/auth/signin" className="hover:text-white">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white mb-3">Resources</h4>
            <ul className="text-sm space-y-2">
              <li>
                <a
                  href="https://www.fac.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                >
                  Federal Audit Clearinghouse
                </a>
              </li>
              <li>
                <a
                  href="https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
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
                  className="hover:text-white"
                >
                  Compliance Supplement
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white mb-3">Legal</h4>
            <ul className="text-sm space-y-2 mb-3">
              <li>
                <Link href="/privacy" className="hover:text-white">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white">
                  Terms
                </Link>
              </li>
              <li>
                {/* Placeholder inbox — swap for a real monitored address
                    before this is relied on for actual contact. */}
                <a href="mailto:hello@singleauditintel.com" className="hover:text-white">
                  Contact
                </a>
              </li>
            </ul>
            <p className="text-xs">
              Single Audit Intelligence is an independent tool powered by Federal Audit
              Clearinghouse data. Not affiliated with GSA, OMB, or any federal agency.
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 pt-8 text-xs text-gray-500 text-center">
          <p>© 2026 Single Audit Intelligence. All data is public domain.</p>
        </div>
      </div>
    </div>
  );
}
