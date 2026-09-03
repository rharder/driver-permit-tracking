import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rharder.github.io/driver-permit-tracking/'),
  title: 'Permit Miles — Teen driving log',
  description: 'A simple, private, offline driving practice tracker for permit hours.',
  manifest: './manifest.webmanifest',
  applicationName: 'Permit Miles',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Permit Miles' },
  openGraph: {
    title: 'Permit Miles — Teen driving log',
    description: 'Teen driving hours, simply tracked.',
    type: 'website',
    images: [{ url: './og.png', width: 1200, height: 630, alt: 'Permit Miles — Teen driving hours, simply tracked.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Permit Miles — Teen driving log',
    description: 'Teen driving hours, simply tracked.',
    images: ['./og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#f4f2ec',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
