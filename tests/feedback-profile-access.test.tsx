import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), license: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.session }));
vi.mock("@/db/client", () => ({
  db: { license: { findUnique: mocks.license }, attempt: { findMany: mocks.history } },
}));
vi.mock("@/server/use-cases/study-priority", () => ({ getStudyRecommendations: async () => [] }));
vi.mock("@/components/feedback-box", () => ({
  FeedbackBox: () => <section>Enviar sugerencia</section>,
}));
vi.mock("@/components/recovery-code-settings", () => ({ RecoveryCodeSettings: () => null }));
vi.mock("next/link", () => ({ default: "a" }));

import PerfilPage from "../src/app/(alumno)/perfil/page";
import { UnauthorizedError } from "../src/lib/authorization";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  mocks.license.mockResolvedValue(null);
  mocks.history.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe("Acceso al buzón desde Perfil", () => {
  it.each([
    ["ALUMNO", false, false],
    ["ALUMNO", undefined, false],
    ["ALUMNO", true, true],
    ["SOPORTE", false, true],
    ["SUPER_ADMIN", false, true],
    ["EDITOR_ACADEMICO", false, false],
    ["ANALISTA", false, false],
  ])("muestra enlace solo con permiso: %s, %s", async (role, flag, expected) => {
    mocks.session.mockResolvedValue({
      id: "student",
      name: "Estudiante",
      email: "student@example.test",
      canReviewFeedback: flag,
      roles: [{ role: { name: role } }],
      passwordHash: "never-render",
    });
    const html = renderToStaticMarkup(await PerfilPage());
    expect(html.includes('href="/admin/feedback"')).toBe(expected);
    expect(html.includes("Revisar mensajes del buzón")).toBe(expected);
    expect(html).toContain("Enviar sugerencia");
    expect(html).not.toContain("never-render");
  });

  it("no consulta el perfil si no hay sesión", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(PerfilPage()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(mocks.license).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });
});
