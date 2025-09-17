// app/layout.tsx  (no "use client", no useState)
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import DrawerWrapper from '@/components/DrawerWrapper'; // <-- new

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GitLab Sanitation Dashboard',
  description: 'DevOps tool for GitLab repository analysis and cleanup',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <Providers>
          <DrawerWrapper>{children}</DrawerWrapper>
        </Providers>
      </body>
    </html>
  );
}