import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: 'Pondera HR & Personel Yönetim Dashboard',
  description: 'TeamHub SaaS tarzı Kurumsal İK, Personel & Şantiye Yönetim Analitikleri',
  icons: {
    icon: [
      { url: '/favicon-64.png?v=6', type: 'image/png', sizes: '64x64' },
      { url: '/pondera-icon.png?v=6', type: 'image/png', sizes: '192x192' },
      { url: '/pondera-icon.svg?v=6', type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: '/favicon-64.png?v=6',
    apple: '/pondera-icon.png?v=6',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('pondera_hr_user')){document.documentElement.classList.add('pondera-has-saved-session');}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased selection:bg-indigo-500 selection:text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
