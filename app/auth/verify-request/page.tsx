import Link from 'next/link';

/**
 * Auth.js redirects here after a magic-link request succeeds
 * (pages.verifyRequest in auth.ts) — without this, it shows its own
 * unstyled default page. Static/server component, unlike
 * app/auth/signin/page.tsx — nothing here is interactive or reads
 * search params.
 */
export default function VerifyRequest() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-96 text-center">
        <Link href="/" className="text-sm text-blue-600 hover:text-blue-800">
          ← Back to home
        </Link>
        <h1 className="flex items-center justify-center gap-2 text-2xl font-bold mb-2 text-center mt-2">
          <img src="/brand/logo-mark.png" alt="" className="h-7 w-7" />
          Single Audit Intelligence
        </h1>

        <p className="text-lg font-semibold text-gray-900 mt-4">Check your email</p>
        <p className="text-sm text-gray-600 mt-2">
          We sent a sign-in link to the address you entered. Click it to continue — it expires in
          30 minutes.
        </p>
        <p className="text-xs text-gray-500 mt-4">
          Didn&apos;t get it? Check spam, or{' '}
          <Link href="/auth/signin" className="text-blue-600 hover:text-blue-800">
            try again
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
