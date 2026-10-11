const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const apiOrigin = new URL(apiUrl).origin;
const apiWs = apiOrigin.replace(/^http/, 'ws');
const production = process.env.NODE_ENV === 'production';

/**
 * Content-Security-Policy: the app only talks to its own origin and the API
 * (HTTP + socket.io websocket); attachments and avatars load from the API.
 * Next.js inlines its bootstrap scripts, hence 'unsafe-inline' for scripts
 * and styles (no third-party script hosts are allowed).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${apiWs}`,
  `media-src 'self' ${apiOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://sandbox.aamarpay.com https://secure.aamarpay.com",
  "object-src 'none'",
  ...(production ? ['upgrade-insecure-requests'] : []),
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image (node server.js).
  output: 'standalone',
  // Lets a production build be verified locally without clobbering a running dev server's .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          ...(production ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
