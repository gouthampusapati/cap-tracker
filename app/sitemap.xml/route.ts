import { getSitemapChunkCount } from '@/lib/sitemap-orgs';
import { SITE_URL } from '@/lib/site-url';

// Same cadence as the child sitemaps in app/sitemap.ts — no reason for the
// index to redeploy more often than the data behind it changes.
export const revalidate = 86400;

/**
 * Hand-written sitemap index at /sitemap.xml, pointing at the numbered
 * child sitemaps Next generates from app/sitemap.ts (/sitemap/0.xml,
 * /sitemap/1.xml, ...).
 *
 * This exists because Next's generateSitemaps() convention serves the
 * numbered children but does NOT also serve an index at /sitemap.xml — see
 * the comment in app/sitemap.ts. robots.txt advertises /sitemap.xml as
 * *the* sitemap, so something has to answer there with a proper
 * <sitemapindex>, not a 404.
 */
export async function GET() {
  const baseUrl = SITE_URL;
  const chunkCount = getSitemapChunkCount();
  const lastmod = new Date().toISOString();

  const entries = [
    ...Array.from(
      { length: chunkCount },
      (_, id) => `<sitemap><loc>${baseUrl}/sitemap/${id}.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`
    ),
    `<sitemap><loc>${baseUrl}/sitemap-auditors.xml</loc><lastmod>${lastmod}</lastmod></sitemap>`,
  ].join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
