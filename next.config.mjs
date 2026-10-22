/**
 * Configuración de Next.js para la plataforma EXCOBA.
 *
 * Nota: se usa .mjs (no .ts) porque Next.js 14.x no soporta
 * `next.config.ts` — ese soporte se agregó hasta Next.js 15. Si en el
 * futuro se actualiza el proyecto a Next.js 15+, este archivo puede
 * volver a convertirse a next.config.ts si se prefiere.
 *
 * Nota de seguridad: `poweredByHeader` se desactiva para no anunciar
 * la tecnología del servidor. Las cabeceras de seguridad adicionales
 * (CSP, X-Frame-Options, etc.) se agregan en el middleware
 * (ver src/middleware.ts, Módulo 10).
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
