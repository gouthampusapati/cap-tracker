import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/single-audit/', '/guide'],
        disallow: ['/api/', '/auth/', '/dashboard/', '/.next/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
