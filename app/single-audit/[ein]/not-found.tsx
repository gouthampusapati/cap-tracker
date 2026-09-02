import Link from 'next/link';
import { Footer } from '@/app/footer';

/**
 * Shown when notFound() fires in this segment — i.e. we DID check and
 * this EIN has no Single Audit on record (not a component of a parent
 * entity's audit either; those redirect in page.tsx). Deliberately
 * distinct from error.tsx ("couldn't check right now") and the inline
 * "Not checked yet" state (budget exhausted) — this one is a confirmed
 * negative, so it says so plainly and points at fac.gov to verify.
 *
 * Matters more now that the homepage hero is an EIN search box: a
 * mistyped or genuinely-unaudited EIN lands here, and the Next.js
 * default 404 gave a visitor nothing to do next.
 */
export default function SingleAuditNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-3">No Single Audit on record</h1>
          <p className="text-gray-600 mb-6">
            The Federal Audit Clearinghouse has no Single Audit filed under this EIN. That can mean
            the organization expends under $1,000,000 in federal awards a year, files under a
            different EIN, or hasn&apos;t filed yet. Double-check the number, or search the FAC
            directly.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/single-audit"
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg"
            >
              Search another EIN
            </Link>
            <a
              href="https://app.fac.gov/dissemination/search/"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-5 py-2.5 rounded-lg"
            >
              Search at fac.gov →
            </a>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
