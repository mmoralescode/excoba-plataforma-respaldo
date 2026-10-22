import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  redirect: vi.fn(),
  userCount: vi.fn(),
  licenseCount: vi.fn(),
  questionCount: vi.fn(),
  attemptCount: vi.fn(),
  licenses: vi.fn(),
  feedback: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSessionUser: mocks.session }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, useRouter: () => ({}) }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/db/client", () => ({
  db: {
    user: { count: mocks.userCount },
    license: { count: mocks.licenseCount, findMany: mocks.licenses },
    question: { count: mocks.questionCount },
    attempt: { count: mocks.attemptCount },
    feedback: { findMany: mocks.feedback },
  },
}));

// Use the real role guard: mocking requireRole would hide role-policy regressions.
import { ForbiddenError, requireRole } from "../src/lib/authorization";
import { requirePageRole } from "../src/lib/page-authorization";
import { AdminAccessDenied } from "../src/components/admin-access-denied";
import AdminLayout from "../src/app/(admin)/admin/layout";
import AdminHomePage from "../src/app/(admin)/admin/page";
import AdminLicensesPage from "../src/app/(admin)/admin/licenses/page";
import FeedbackPage from "../src/app/(admin)/admin/feedback/page";

const redirectSignal = Object.assign(new Error("NEXT_REDIRECT"), {
  digest: "NEXT_REDIRECT;replace;/login;307;",
});
const staffRoles = ["SUPER_ADMIN", "SOPORTE", "EDITOR_ACADEMICO", "ANALISTA"] as const;
const account = (...roles: string[]) => ({
  id: "account-test",
  name: "Cuenta de prueba",
  email: "cuenta@example.test",
  roles: roles.map((name) => ({ role: { name } })),
});
const queries = () => [
  mocks.userCount,
  mocks.licenseCount,
  mocks.questionCount,
  mocks.attemptCount,
  mocks.licenses,
  mocks.feedback,
];
const pages = [
  ["resumen", () => AdminHomePage()],
  ["licencias", () => AdminLicensesPage()],
  ["buzón", () => FeedbackPage({ searchParams: {} })],
  ["layout", () => AdminLayout({ children: <p>Contenido administrativo secreto</p> })],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  mocks.session.mockResolvedValue(account("ALUMNO"));
  mocks.redirect.mockImplementation(() => {
    throw redirectSignal;
  });
  mocks.userCount.mockResolvedValue(1);
  mocks.licenseCount.mockResolvedValue(2);
  mocks.questionCount.mockResolvedValue(3);
  mocks.attemptCount.mockResolvedValue(4);
  mocks.licenses.mockResolvedValue([]);
  mocks.feedback.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe("Autorización de páginas sin excepciones genéricas de permisos", () => {
  it.each(staffRoles)("devuelve la cuenta con el rol autorizado %s", async (role) => {
    const user = account(role);
    mocks.session.mockResolvedValue(user);
    await expect(requirePageRole(...staffRoles)).resolves.toBe(user);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["ALUMNO", "EDITOR_ACADEMICO", "ANALISTA"])(
    "deniega %s en el buzón sin elevar su rol ni cambiar la cuenta",
    async (role) => {
      const user = account(role);
      mocks.session.mockResolvedValue(user);
      await expect(requirePageRole("SUPER_ADMIN", "SOPORTE")).resolves.toBeNull();
      expect(user.roles).toEqual([{ role: { name: role } }]);
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it("redirige una sesión ausente, expirada o revocada al inicio de sesión", async () => {
    // getSessionUser returns null for each of these invalid-session states.
    mocks.session.mockResolvedValue(null);
    await expect(requirePageRole("SUPER_ADMIN", "SOPORTE")).rejects.toBe(redirectSignal);
    expect(mocks.redirect).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("propaga un error inesperado de datos sin disfrazarlo de falta de permisos", async () => {
    const databaseFailure = new Error("Database unavailable");
    mocks.session.mockRejectedValue(databaseFailure);
    await expect(requirePageRole("SUPER_ADMIN")).rejects.toBe(databaseFailure);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("preserva señales de navegación de Next en lugar de atraparlas", async () => {
    mocks.session.mockRejectedValue(redirectSignal);
    await expect(requirePageRole("SUPER_ADMIN")).rejects.toBe(redirectSignal);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("mantiene el contrato de requireRole para que las APIs puedan responder 403", async () => {
    await expect(requireRole("SUPER_ADMIN", "SOPORTE")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Guardias propias de cada página administrativa", () => {
  it.each(pages)(
    "%s muestra acceso restringido a alumnos sin consultar datos",
    async (_, render) => {
      const html = renderToStaticMarkup(await render());
      expect(html).toContain("Acceso restringido");
      expect(html).toContain('href="/perfil#buzon"');
      expect(html).not.toContain("Contenido administrativo secreto");
      expect(html).not.toContain('href="/admin/feedback"');
      for (const query of queries()) expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(pages)("%s redirige sin consultas cuando la sesión no es válida", async (_, render) => {
    mocks.session.mockResolvedValue(null);
    await expect(render()).rejects.toBe(redirectSignal);
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    for (const query of queries()) expect(query).not.toHaveBeenCalled();
  });

  it.each(pages)("%s no oculta fallos inesperados de autenticación", async (_, render) => {
    const failure = new Error("Session store unavailable");
    mocks.session.mockRejectedValue(failure);
    await expect(render()).rejects.toBe(failure);
    for (const query of queries()) expect(query).not.toHaveBeenCalled();
  });

  it.each(staffRoles)("resumen y layout siguen disponibles para %s", async (role) => {
    mocks.session.mockResolvedValue(account(role));
    const pageHtml = renderToStaticMarkup(await AdminHomePage());
    expect(pageHtml).toContain("Resumen");
    expect(pageHtml).not.toContain("Acceso restringido");
    for (const query of queries().slice(0, 4)) expect(query).toHaveBeenCalledOnce();
    const layoutHtml = renderToStaticMarkup(
      await AdminLayout({ children: <p>Contenido administrativo permitido</p> }),
    );
    expect(layoutHtml).toContain("Contenido administrativo permitido");
    expect(layoutHtml.includes('href="/admin/feedback"')).toBe(
      role === "SUPER_ADMIN" || role === "SOPORTE",
    );
  });

  it.each(["SUPER_ADMIN", "SOPORTE"])("%s conserva acceso a licencias y mensajes", async (role) => {
    mocks.session.mockResolvedValue(account(role));
    expect(renderToStaticMarkup(await AdminLicensesPage())).toContain("Licencias");
    expect(renderToStaticMarkup(await FeedbackPage({ searchParams: {} }))).toContain(
      "Buzón de alumnos",
    );
    expect(mocks.licenses).toHaveBeenCalledOnce();
    expect(mocks.feedback).toHaveBeenCalledOnce();
  });

  it.each(["EDITOR_ACADEMICO", "ANALISTA"])(
    "%s no puede leer licencias ni mensajes aunque sí entre al panel",
    async (role) => {
      mocks.session.mockResolvedValue(account(role));
      expect(renderToStaticMarkup(await AdminLicensesPage())).toContain("Acceso restringido");
      expect(renderToStaticMarkup(await FeedbackPage({ searchParams: {} }))).toContain(
        "Acceso restringido",
      );
      expect(mocks.licenses).not.toHaveBeenCalled();
      expect(mocks.feedback).not.toHaveBeenCalled();
    },
  );

  it("la vista restringida no filtra mensajes, contactos ni información de la sesión", () => {
    const html = renderToStaticMarkup(<AdminAccessDenied />);
    expect(html).toContain("Acceso restringido");
    expect(html).toContain('href="/perfil#buzon"');
    expect(html).not.toContain("cuenta@example.test");
    expect(html).not.toContain("account-test");
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("<form");
  });
});
