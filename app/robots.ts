import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/single-audit/', '/guide', '/portfolio'],
        disallow: ['/api/', '/auth/', '/dashboard/', '/.next/'],
        // A sitemap crawler discovering a brand-new (never-cached) EIN
        // every ~5s (~720/hr) outran the shared FAC fetch budget
        // (~180/hr, see lib/fac-budget.ts) 4x over, so most of its own
        // requests were landing on a placeholder "not checked yet" page
        // instead of real content — wasted crawl budget on both sides.
        // 20s keeps a compliant crawler within ~180/hr, matching what we
        // can actually serve live, leaving some headroom for real
        // visitors. NOTE: Googlebot explicitly ignores Crawl-delay — its
        // rate has to be set in Search Console instead if it turns out
        // to be the culprit here.
        crawlDelay: 20,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
