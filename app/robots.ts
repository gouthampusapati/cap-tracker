import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/single-audit/'],
        disallow: ['/api/', '/auth/', '/dashboard/', '/.next/'],
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_URL || 'https://single-audit-intelligence.com'}/sitemap.xml`,
  };
}
