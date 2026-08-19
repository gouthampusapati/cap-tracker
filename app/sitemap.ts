import type { MetadataRoute } from 'next';
import { getSitemapChunkCount, loadOrgEins, SITEMAP_CHUNK_SIZE } from '@/lib/sitemap-orgs';
import { SITE_URL } from '@/lib/site-url';

// FAC bulk data (data/fac-orgs.csv.gz) is refreshed at most daily by
// scripts/ingest-fac-orgs.mjs; no need to regenerate these chunks more
// often than that.
export const revalidate = 86400;

/**
 * Splits the org list into <=50,000-URL chunks and tells Next.js to serve
 * one child sitemap per chunk at /sitemap/0.xml, /sitemap/1.xml, ... —
 * this is Next's built-in mechanism for exactly this
 * (https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap#generate-a-sitemap).
 *
 * IMPORTANT: unlike a single (non-chunked) sitemap.ts, using
 * generateSitemaps() here means Next does NOT also serve a sitemap index
 * at /sitemap.xml — only the numbered child files above. The index that
 * robots.txt points at is hand-written in app/sitemap.xml/route.ts,
 * driven by the same getSitemapChunkCount() so the two can't drift apart.
 *
 * Note on "gzipped": these routes aren't served as literal .xml.gz files —
 * Vercel's edge network transparently gzip/brotli-compresses the response
 * body (Content-Encoding) for any client that sends Accept-Encoding, which
 * is what search engine crawlers do and is the standard way large sitemaps
 * are served. If a literal .xml.gz artifact turns out to be required,
 * that's a custom route handler instead of the sitemap.ts convention.
 */
export async function generateSitemaps() {
  return Array.from({ length: getSitemapChunkCount() }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;
  const eins = loadOrgEins();
  const start = id * SITEMAP_CHUNK_SIZE;
  const orgEntries: MetadataRoute.Sitemap = eins
    .slice(start, start + SITEMAP_CHUNK_SIZE)
    .map((ein) => ({
      url: `${baseUrl}/single-audit/${ein}`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }));

  // Static pages ride along in the first chunk only, so they're not
  // duplicated across every child sitemap. /about and /guide are left out
  // deliberately — they don't exist yet (see app/page.tsx), and listing a
  // URL that 404s is worse for SEO than not listing it. Add them back here
  // once those pages exist.
  if (id === 0) {
    return [
      {
        url: baseUrl,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: 1.0,
      },
      ...orgEntries,
    ];
  }

  return orgEntries;
}
