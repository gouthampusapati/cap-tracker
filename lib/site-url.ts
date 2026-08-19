/**
 * Canonical site origin (no trailing slash) — the single source of truth
 * for every URL this app emits: sitemap, robots.txt, Open Graph tags,
 * alternates.canonical.
 *
 * This exists because of a real bug: robots.ts/sitemap.ts read
 * NEXT_PUBLIC_URL while the org page's metadata had a hardcoded host,
 * and Vercel's actual primary domain (www.singleauditintel.com) didn't
 * match either fallback — the sitemap index, its child files, and
 * robots.txt each pointed at a different hostname. Every URL-emitting
 * path should import SITE_URL from here instead of reading
 * process.env.NEXT_PUBLIC_URL directly, so there's exactly one place
 * left to get this wrong.
 *
 * The fallback is the real production host, not localhost and not a
 * placeholder domain nobody owns — a missing env var should degrade to
 * a working host, not a dead one.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_URL || 'https://www.singleauditintel.com'
).replace(/\/+$/, '');
