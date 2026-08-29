import { topAuditorEins, US_STATES } from '@/lib/auditors';
import { SITE_URL } from '@/lib/site-url';

// Render on request, not at build. topAuditorEins() reads the DB, which
// isn't reliably reachable during `next build` (it was returning [] — so
// the prerendered sitemap had the /auditors root + state facets but ZERO
// firm pages). Now that it's a fast indexed read of
// fac_mirror_auditor_firms, doing it per-request is cheap; the CDN still
// caches the response for a day via the Cache-Control header below.
export const dynamic = 'force-dynamic';

/**
 * Standalone sitemap for the /auditors directory: the directory root,
 * one URL per state facet, and the top ~3,000 firm pages by number of
 * Single Audits filed. Referenced from the sitemap index in
 * app/sitemap.xml/route.ts.
 */
export async function GET() {
  const lastmod = new Date().toISOString();
  const eins = await topAuditorEins(3000);

  const urls = [
    `${SITE_URL}/auditors`,
    ...Object.keys(US_STATES).map((code) => `${SITE_URL}/auditors?state=${code}`),
    ...eins.map((ein) => `${SITE_URL}/auditors/${ein}`),
  ];

  const body = urls
    .map((loc) => `<url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>`)
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
