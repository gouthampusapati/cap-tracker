'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

function formatPhone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

/**
 * Sign-in gated phone + email for the audit firm. The values never touch
 * the cached /auditors/[ein] HTML — a signed-in visitor fetches them
 * from /api/auditor-contact/[ein] after hydration; everyone else sees a
 * "Sign in to view" link. `hasPhone`/`hasEmail` come from the server so
 * the row is hidden entirely when the firm reported neither.
 */
export function AuditorContact({
  ein,
  hasPhone,
  hasEmail,
}: {
  ein: string;
  hasPhone: boolean;
  hasEmail: boolean;
}) {
  const { status } = useSession();
  const [data, setData] = useState<{ phone: string | null; email: string | null } | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || (!hasPhone && !hasEmail)) return;
    fetch(`/api/auditor-contact/${ein}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, [status, ein, hasPhone, hasEmail]);

  if (!hasPhone && !hasEmail) return null;

  if (status !== 'authenticated') {
    return (
      <p>
        <span className="font-semibold">Phone &amp; email on file:</span>{' '}
        <Link
          href={`/auth/signin?next=${encodeURIComponent(`/auditors/${ein}`)}`}
          className="text-blue-600 hover:underline"
        >
          Sign in to view
        </Link>
      </p>
    );
  }

  if (!data) return <p className="text-gray-400">Loading contact…</p>;

  const phone = formatPhone(data.phone);
  return (
    <>
      {phone && (
        <p>
          <span className="font-semibold">Phone:</span>{' '}
          <a
            href={`tel:${data.phone?.replace(/\D/g, '')}`}
            className="text-blue-600 hover:underline"
          >
            {phone}
          </a>
        </p>
      )}
      {data.email && (
        <p>
          <span className="font-semibold">Email on file:</span> {data.email}
        </p>
      )}
    </>
  );
}
