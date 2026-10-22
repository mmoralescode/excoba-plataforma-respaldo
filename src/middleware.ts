import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware de plataforma:
 * 1. Agrega cabeceras de seguridad (incluida una CSP basada en nonce) a
 *    toda respuesta.
 * 2. Redirige a /login si no hay cookie de sesión en rutas protegidas.
 *
 * Nota sobre la CSP: Next.js necesita ejecutar scripts en línea propios
 * para la hidratación de React (el payload de streaming del App Router).
 * Un `script-src 'self'` sin más los bloquea por completo — la app se ve
 * bien (HTML del servidor) pero ningún botón, formulario o navegación
 * funciona, porque React nunca termina de "encender" en el navegador. La
 * solución correcta (documentada por Next.js) no es debilitar la CSP con
 * 'unsafe-inline', sino generar un nonce distinto en cada solicitud y
 * autorizar sólo los scripts que lo incluyan.
 *
 * La verificación de sesión aquí es sólo de "¿existe una cookie con forma
 * válida?" (Edge Runtime no puede consultar PostgreSQL directamente). La
 * validación fuerte —sesión no revocada, no expirada, rol correcto— ocurre
 * siempre en el servidor dentro de cada Route Handler/Server Component vía
 * `requireUser`/`requireRole` (ver `src/lib/authorization.ts`).
 */
export const PUBLIC_PAGE_PATHS = [
  "/",
  "/activar",
  "/login",
  "/recuperar-password",
  "/recuperar-password/confirmar",
] as const;
export const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/recover-with-code",
  "/api/licenses/activate",
] as const;
const SESSION_COOKIE_NAME = "excoba_session";

export function isPublicPath(pathname: string) {
  return (
    PUBLIC_PAGE_PATHS.some((path) => pathname === path) ||
    PUBLIC_API_PATHS.some((path) => pathname === path)
  );
}

function secureResponse(response: NextResponse, cspHeader: string, privateContent = false) {
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (privateContent) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const isProtected = !isPublicPath(request.nextUrl.pathname);
  if (isProtected) {
    const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
    if (!hasSessionCookie) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return secureResponse(
          NextResponse.json({ error: "No autenticado." }, { status: 401 }),
          cspHeader,
          true,
        );
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
      return secureResponse(NextResponse.redirect(loginUrl), cspHeader, true);
    }
  }

  return secureResponse(
    NextResponse.next({ request: { headers: requestHeaders } }),
    cspHeader,
    isProtected,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
