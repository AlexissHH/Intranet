import type {NextConfig} from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content-Security-Policy.
 *
 * Por defecto se publica en modo "solo reporte" (Content-Security-Policy-Report-Only): el
 * navegador NO bloquea nada y muestra en la consola las violaciones. Así se puede validar en una
 * vista previa de Vercel que el login con Google (Firebase), la generación de PDF y la vista de
 * .docx funcionan, y recién entonces activar el bloqueo con la variable CSP_MODE=enforce.
 *
 * 'unsafe-inline' en script-src es necesario hoy porque Next.js inyecta scripts en línea; pasar a
 * nonces es una mejora posterior. En desarrollo se agrega 'unsafe-eval' (lo requiere React Refresh).
 */
function buildCsp(): string {
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const firebaseFrame = authDomain ? [`https://${authDomain}`] : [];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      'https://accounts.google.com',
      'https://apis.google.com',
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://*.googleapis.com',
      'https://accounts.google.com',
      'https://*.firebaseapp.com',
      ...firebaseFrame,
    ],
    'frame-src': ['https://accounts.google.com', 'https://*.firebaseapp.com', ...firebaseFrame],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    // La intranet no debe poder incrustarse en sitios de terceros (clickjacking).
    // Si más adelante se embebe a propósito (ej. Shopify), agregar ese origen aquí.
    'frame-ancestors': ["'self'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

const cspHeaderName =
  process.env.CSP_MODE === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';

const securityHeaders = [
  { key: cspHeaderName, value: buildCsp() },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
