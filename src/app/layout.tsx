// app/layout.tsx
'use client';

import './globals.css';
import { Inter } from 'next/font/google';
import { usePathname } from 'next/navigation';
import { Providers } from './providers';
import DrawerWrapper from '@/components/DrawerWrapper';
import Navigation from '@/components/Navigation';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register';

  return (
    <html lang="en" className={inter.className}>
      <body>
        <Providers>
          {isAuthPage ? (
            // Viewport-locked container (no scroll), navbar + centered main
            <div className="h-dvh overflow-hidden bg-base-200 flex flex-col">
              <Navigation variant="auth" />
              <main className="flex-1 min-h-0 grid place-items-center p-4">
                {children}
              </main>
            </div>
          ) : (
            <DrawerWrapper>{children}</DrawerWrapper>
          )}
        </Providers>
      </body>
    </html>
  );
}
