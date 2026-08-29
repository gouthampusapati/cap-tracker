import Link from 'next/link';

/**
 * A single slim line linking the homepage into the /guide content —
 * kept deliberately minimal (not a card row) so it adds internal links
 * for SEO and a way in for someone new to the subject, without turning
 * the homepage into a content dump.
 */
export function HomeGuideTeaser() {
  return (
    <p className="my-12 text-sm text-gray-600">
      <span className="font-semibold text-gray-900">New to Single Audits?</span> Start with{' '}
      <Link href="/guide/compliance-requirements" className="text-accent hover:text-blue-800 underline">
        compliance requirements A–P
      </Link>
      ,{' '}
      <Link href="/guide/subrecipient-monitoring" className="text-accent hover:text-blue-800 underline">
        subrecipient monitoring
      </Link>
      , and{' '}
      <Link href="/guide/management-decisions" className="text-accent hover:text-blue-800 underline">
        management-decision deadlines
      </Link>
      {' '}— or the{' '}
      <Link href="/guide" className="text-accent hover:text-blue-800 underline">
        full compliance guide
      </Link>
      .
    </p>
  );
}
