import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware, PUBLIC_API_PATHS, PUBLIC_PAGE_PATHS } from "../src/middleware";
import { safeAuthenticatedPath } from "../src/lib/safe-next-path";

describe("acceso a contenido", () => {
  it.each(["/estudio", "/practica", "/simulador", "/perfil", "/instructivo", "/temario", "/admin"])(
    "redirige %s al login cuando no hay sesión",
    (path) => {
      const response = middleware(new NextRequest(`https://excoba.example${path}`));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `https://excoba.example/login?next=${encodeURIComponent(path)}`,
      );
    },
  );

  it.each(["/", "/activar", "/login", "/recuperar-password", "/recuperar-password/confirmar"])(
    "mantiene pública %s",
    (path) => {
      expect(middleware(new NextRequest(`https://excoba.example${path}`)).status).toBe(200);
    },
  );

  it("mantiene todas las páginas internas conocidas en la protección", () => {
    expect(PUBLIC_PAGE_PATHS).not.toEqual(
      expect.arrayContaining(["/instructivo", "/temario", "/estudio", "/practica", "/simulador"]),
    );
  });

  it.each([
    "/contenido-nuevo",
    "/resultados/intento-ajeno",
    "/api/contenido-nuevo",
    "/api/subjects",
    "/api/admin/licenses",
    "/api/privacy/accept",
    "/api/account/recovery-code",
    "/api/feedback",
    "/api/admin/feedback/report-id",
    "/admin/feedback",
  ])("protege por defecto incluso rutas futuras: %s", (path) => {
    const response = middleware(new NextRequest(`https://excoba.example${path}`));
    expect(response.status).toBe(path.startsWith("/api/") ? 401 : 307);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("solo deja públicas las APIs necesarias para autenticarse o canjear un folio", () => {
    expect(PUBLIC_API_PATHS).toEqual([
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/recover-with-code",
      "/api/licenses/activate",
    ]);
  });
});

describe("retorno después del login", () => {
  it.each(["/estudio", "/practica?area=matematicas", "/instructivo", "/temario", "/perfil"])(
    "acepta el destino interno %s",
    (path) => expect(safeAuthenticatedPath(path)).toBe(path),
  );

  it.each([
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/activar",
    "/estudio/../../activar",
  ])("rechaza un destino no autorizado", (path) =>
    expect(safeAuthenticatedPath(path)).toBe("/estudio"),
  );
});
