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
      </body>
    </html>
  );
}
