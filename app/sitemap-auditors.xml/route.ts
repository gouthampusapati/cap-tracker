import { topAuditorEins, US_STATES } from '@/lib/auditors';
import { SITE_URL } from '@/lib/site-url';

// The mirror refreshes weekly; a day-old auditor sitemap is fine.
export const revalidate = 86400;

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
