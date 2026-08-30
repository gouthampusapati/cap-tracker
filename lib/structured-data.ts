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

/**
 * The site as an Organization. For the homepage — every other page's
 * JSON-LD already carries an Organization node inside its breadcrumb /
 * article / service shape, so this is the one place the top-level entity
 * is declared on its own.
 */
export function organization() {
  return {
    '@context': 'https://schema.org',
    ...PUBLISHER_NODE,
    description:
      'Independent search tool for U.S. Single Audit data from the Federal Audit Clearinghouse — audit findings, corrective action plans, and audit firms.',
  };
}

/**
 * WebSite node with a SearchAction, so search engines can offer a
 * sitelinks search box that goes straight to an org page. The FAC uses
 * a 9-digit EIN as the entity key, so that's the query input.
 */
export function webSite() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Single Audit Intelligence',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/single-audit/{ein}`,
      },
      'query-input': 'required name=ein',
    },
  };
}

/**
 * A glossary as a schema.org DefinedTermSet. Each entry's `url` is the
 * on-page anchor so a term can be cited directly.
 */
export function definedTermSet(
  name: string,
  url: string,
  terms: { term: string; slug: string; definition: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name,
    url,
    hasDefinedTerm: terms.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.term,
      description: t.definition,
      url: `${url}#${t.slug}`,
      inDefinedTermSet: url,
    })),
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
