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

// Keep the authorization implementation real so UI mocks cannot grant privileges.
import { canReviewFeedback } from "../src/lib/feedback-permissions";
import {
  ForbiddenError,
  UnauthorizedError,
  requireFeedbackReviewer,
  requireRole,
} from "../src/lib/authorization";
import {
  requireAdminShellPage,
  requireFeedbackReviewerPage,
  requirePageRole,
} from "../src/lib/page-authorization";
import { canAccessPlatform } from "../src/lib/license-access";
import AdminLayout from "../src/app/(admin)/admin/layout";
import AdminHomePage from "../src/app/(admin)/admin/page";
import AdminLicensesPage from "../src/app/(admin)/admin/licenses/page";
import FeedbackPage from "../src/app/(admin)/admin/feedback/page";

const staffRoles = ["SUPER_ADMIN", "SOPORTE", "EDITOR_ACADEMICO", "ANALISTA"] as const;
const account = (canReview?: boolean, ...roles: string[]) => ({
  id: "limited-reviewer-test",
  email: "reviewer@example.test",
  name: "Persona revisora",
  canReviewFeedback: canReview,
  roles: (roles.length ? roles : ["ALUMNO"]).map((name) => ({ role: { name } })),
});
const redirectSignal = Object.assign(new Error("NEXT_REDIRECT"), {
  digest: "NEXT_REDIRECT;replace;/login;307;",
});
const queries = () => [
  mocks.userCount,
  mocks.licenseCount,
  mocks.questionCount,
  mocks.attemptCount,
  mocks.licenses,
  mocks.feedback,
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  mocks.session.mockResolvedValue(account(true));
  mocks.redirect.mockImplementation(() => {
    throw redirectSignal;
  });
  mocks.feedback.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe("Permiso limitado de revisión del buzón", () => {
  it.each([undefined, false])("no concede acceso por defecto (%s)", (flag) => {
    expect(canReviewFeedback(account(flag))).toBe(false);
  });

  it("una cuenta anterior sin el campo tampoco obtiene acceso", () => {
    expect(canReviewFeedback({ roles: [{ role: { name: "ALUMNO" } }] })).toBe(false);
  });

  it.each(["ALUMNO", "EDITOR_ACADEMICO", "ANALISTA"])(
    "%s necesita el permiso explícito para revisar",
    (role) => {
      expect(canReviewFeedback(account(false, role))).toBe(false);
      expect(canReviewFeedback(account(true, role))).toBe(true);
    },
  );

  it.each(["SUPER_ADMIN", "SOPORTE"])("preserva el acceso existente de %s", (role) => {
    expect(canReviewFeedback(account(false, role))).toBe(true);
    expect(canReviewFeedback(account(undefined, role))).toBe(true);
  });

  it("requiere true booleano, no valores que solo sean truthy", () => {
    for (const flag of [1, "true", "false", {}, []]) {
      const user = { ...account(), canReviewFeedback: flag } as unknown as Parameters<
        typeof canReviewFeedback
      >[0];
      expect(canReviewFeedback(user)).toBe(false);
    }
  });

  it("no concede acceso por coincidencia de correo ni por nombre de rol inventado", () => {
    for (const email of ["reviewer@example.test", "other-reviewer@example.test"]) {
      const user = { ...account(false), email };
      expect(canReviewFeedback(user)).toBe(false);
    }
    expect(canReviewFeedback(account(false, "canReviewFeedback"))).toBe(false);
  });

  it("no muta ni añade roles a la cuenta autorizada", () => {
    const user = account(true);
    const before = structuredClone(user);
    expect(canReviewFeedback(user)).toBe(true);
    expect(user).toEqual(before);
    expect(user.roles).toEqual([{ role: { name: "ALUMNO" } }]);
  });
});

describe("Guardias de servidor con sesión real y permiso específico", () => {
  it("devuelve la cuenta autorizada sin elevarla a soporte o administrador", async () => {
    const user = account(true);
    mocks.session.mockResolvedValue(user);
    await expect(requireFeedbackReviewer()).resolves.toBe(user);
    await expect(requireRole(...staffRoles)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireRole("SUPER_ADMIN", "SOPORTE")).rejects.toBeInstanceOf(ForbiddenError);
    expect(user.roles).toEqual([{ role: { name: "ALUMNO" } }]);
  });

  it.each([false, undefined])(
    "el guard de API deniega el permiso ausente %s con 403",
    async (flag) => {
      mocks.session.mockResolvedValue(account(flag));
      await expect(requireFeedbackReviewer()).rejects.toBeInstanceOf(ForbiddenError);
    },
  );

  it("el guard de API exige sesión validada, no basta conocer un correo autorizado", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(requireFeedbackReviewer()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("refresca el permiso al revocarlo entre solicitudes", async () => {
    mocks.session.mockResolvedValueOnce(account(true)).mockResolvedValueOnce(account(false));
    await expect(requireFeedbackReviewer()).resolves.toMatchObject({ canReviewFeedback: true });
    await expect(requireFeedbackReviewer()).rejects.toBeInstanceOf(ForbiddenError);
    expect(mocks.session).toHaveBeenCalledTimes(2);
  });

  it("solo abre shell y buzón; la guardia general de páginas no cambia", async () => {
    const user = account(true);
    mocks.session.mockResolvedValue(user);
    await expect(requireAdminShellPage()).resolves.toBe(user);
    await expect(requireFeedbackReviewerPage()).resolves.toBe(user);
    await expect(requirePageRole(...staffRoles)).resolves.toBeNull();
    await expect(requirePageRole("SUPER_ADMIN", "SOPORTE")).resolves.toBeNull();
  });

  it.each([
    ["buzón", requireFeedbackReviewerPage],
    ["shell", requireAdminShellPage],
  ] as const)(
    "%s deniega el permiso revocado sin lanzar una excepción de servidor",
    async (_, guard) => {
      mocks.session.mockResolvedValue(account(false));
      await expect(guard()).resolves.toBeNull();
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["buzón", requireFeedbackReviewerPage],
    ["shell", requireAdminShellPage],
  ] as const)("%s redirige a login si la sesión terminó", async (_, guard) => {
    mocks.session.mockResolvedValue(null);
    await expect(guard()).rejects.toBe(redirectSignal);
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it.each([
    ["API", requireFeedbackReviewer],
    ["buzón", requireFeedbackReviewerPage],
    ["shell", requireAdminShellPage],
  ] as const)("%s no oculta fallos inesperados de sesión", async (_, guard) => {
    const failure = new Error("Session store unavailable");
    mocks.session.mockRejectedValue(failure);
    await expect(guard()).rejects.toBe(failure);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(staffRoles)("el shell conserva acceso por rol para %s", async (role) => {
    const user = account(false, role);
    mocks.session.mockResolvedValue(user);
    await expect(requireAdminShellPage()).resolves.toBe(user);
  });

  it("no convierte el permiso de buzón en una excepción a la vigencia del alumno", () => {
    const now = new Date("2026-09-14T18:00:00Z");
    const user = {
      ...account(true),
      status: "ACTIVO",
      deletedAt: null,
      license: {
        userId: "limited-reviewer-test",
        status: "ACTIVADA",
        startsAt: new Date("2026-03-14T18:00:00Z"),
        expiresAt: now,
      },
    };
    expect(canAccessPlatform(user, now)).toBe(false);
    expect(canAccessPlatform({ ...user, license: null }, now)).toBe(false);
    expect(canAccessPlatform({ ...user, status: "BLOQUEADO" }, now)).toBe(false);
  });
});

describe("Aislamiento real de páginas para una cuenta con permiso de buzón", () => {
  it("lee el buzón pero no consulta métricas ni licencias", async () => {
    const html = renderToStaticMarkup(await FeedbackPage({ searchParams: {} }));
    expect(html).toContain("Buzón de alumnos");
    expect(html).not.toContain("Acceso restringido");
    expect(mocks.feedback).toHaveBeenCalledOnce();
    for (const query of queries().slice(0, 5)) expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["resumen", AdminHomePage],
    ["licencias", AdminLicensesPage],
  ] as const)("la URL directa de %s sigue restringida sin consultar datos", async (_, page) => {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain("Acceso restringido");
    for (const query of queries()) expect(query).not.toHaveBeenCalled();
  });

  it("el shell no muestra vínculos a otras áreas administrativas", async () => {
    const html = renderToStaticMarkup(
      await AdminLayout({ children: React.createElement("p", null, "Bandeja autorizada") }),
    );
    expect(html).toContain("Bandeja autorizada");
    expect(html).toContain('href="/admin/feedback"');
    expect(html).toContain('href="/perfil"');
    expect(html).not.toContain('href="/admin"');
    expect(html).not.toContain('href="/admin/licenses"');
    for (const query of queries()) expect(query).not.toHaveBeenCalled();
  });

  it("una revocación bloquea la lectura de mensajes en la siguiente visita", async () => {
    mocks.session.mockResolvedValue(account(false));
    const html = renderToStaticMarkup(await FeedbackPage({ searchParams: {} }));
    expect(html).toContain("Acceso restringido");
    expect(mocks.feedback).not.toHaveBeenCalled();
  });
});
