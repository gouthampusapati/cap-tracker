import { SITE_URL } from './site-url';

/**
 * schema.org JSON-LD builders, shared so the same shapes aren't
 * hand-rolled (and allowed to drift) on every page. Rendered with
 * <JsonLd> (app/json-ld.tsx).
 */

const ORG_NODE = {
  '@type': 'Organization',
  name: 'Single Audit Intelligence',
  url: SITE_URL,
} as const;

const PUBLISHER_NODE = {
  ...ORG_NODE,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/logo-mark.png` },
} as const;

export function breadcrumbList(crumbs: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

/**
 * Reference-article schema for the /guide pages. Deliberately omits
 * datePublished / dateModified — the guide content isn't dated and a
 * fabricated date would be worse than none (and off-ethos for a site
 * whose whole pitch is being right about the facts).
 */
export function article(opts: { headline: string; description: string; url: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.headline,
    description: opts.description,
    url: opts.url,
    author: ORG_NODE,
    publisher: PUBLISHER_NODE,
    isAccessibleForFree: true,
  };
}

/** An ordered list of links — e.g. the guide hub's list of its pages. */
export function itemList(name: string, items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: it.url,
    })),
  };
}
