import { Analytics } from '@vercel/analytics/next';
import { Providers } from './providers';
import './globals.css';

export const metadata = {
  title: 'Single Audit Intelligence',
  description:
    'Search the Federal Audit Clearinghouse. See audit findings and corrective action plans for any organization that receives federal awards.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
        {/* Pageview tracking only for now — no cookies, no PII. Custom
            event tracking (portfolio EIN counts, guide-vs-org click-through)
            lands with Task 4. */}
        <Analytics />
      </body>
    </html>
  );
}
