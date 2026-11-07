import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Pondera HR & Personel Yönetim Dashboard',
  description: 'TeamHub SaaS tarzı Kurumsal İK, Personel & Şantiye Yönetim Analitikleri',
  icons: {
    icon: [
      { url: '/pondera-icon.png', type: 'image/png', sizes: '192x192' },
      { url: '/favicon-64.png', type: 'image/png', sizes: '64x64' },
      { url: '/pondera-icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon-64.png',
    apple: '/pondera-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased selection:bg-indigo-500 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
