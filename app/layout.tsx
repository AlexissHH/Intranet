import type {Metadata} from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css'; // Global styles

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const SITE_TITLE = 'Intranet - Instituto de Capacitación Legislativa';
const SITE_DESCRIPTION =
  'Portal de trabajo y gestión interna del Instituto de Capacitación Legislativa: agenda institucional, visitas escolares, capacitaciones, novedades, recursos y sincronización con Google Workspace.';

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // Es una intranet de uso interno: no debe aparecer en buscadores.
  robots: { index: false, follow: false },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" suppressHydrationWarning className={plusJakartaSans.className}>
      <body suppressHydrationWarning className="bg-[#f8f9ff] text-[#0b1c30] antialiased">
        {children}
      </body>
    </html>
  );
}
