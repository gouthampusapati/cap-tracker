import { Providers } from './providers';
import './globals.css';

export const metadata = {
  title: 'CAP Tracker',
  description: 'Track corrective action plans for Single Audit findings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
