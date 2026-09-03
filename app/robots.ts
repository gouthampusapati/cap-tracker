import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

const allow = ['/', '/single-audit/', '/auditors', '/guide', '/glossary', '/portfolio', '/faq', '/pricing', '/about'];
// `/single-audit/*/risk-assessment` is the ONE route whose data (SEFA
// federal_awards) isn't in the local mirror — every uncached hit is a
// live FAC fetch. Crawlers walking it via the org-page link pinned the
// shared FAC budget (lib/fac-budget.ts) and spiked 5xx. The award detail
// has little standalone search value; the org page summarises it.
const disallow = ['/api/', '/auth/', '/dashboard/', '/admin/', '/.next/', '/single-audit/*/risk-assessment'];

// A sitemap crawler discovering a brand-new (never-cached) EIN every ~5s
// (~720/hr) outran the shared FAC fetch budget (~180/hr, see
// lib/fac-budget.ts) 4x over, so most of its own requests were landing on
// the "not checked yet" placeholder (see 05d0c7f) instead of real content
// — wasted crawl budget on both sides, on top of the load itself.
// Identified via a temporary diagnostic log (middleware.ts) as ClaudeBot,
// Anthropic's own crawler — confirmed at
// https://support.claude.com/en/articles/8896518 to respect Crawl-delay,
// and its documented example uses a bot-specific block
// (`User-agent: ClaudeBot`) rather than `*`. Per standard robots.txt
// matching, a bot with its own block ignores the wildcard block entirely
// (no merging), so ClaudeBot needs its own complete rule, not just a
// crawlDelay bolted onto `*`.
const CRAWL_DELAY_SECONDS = 20;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: 'ClaudeBot',
        allow,
        disallow,
        crawlDelay: CRAWL_DELAY_SECONDS,
      },
      {
        // Not Googlebot-effective (it explicitly ignores Crawl-delay —
        // rate has to be set via Search Console instead), but harmless
        // to offer and respected by other compliant crawlers.
        userAgent: '*',
        allow,
        disallow,
        crawlDelay: CRAWL_DELAY_SECONDS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
