import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  findMany: vi.fn(),
  refresh: vi.fn(),
  states: [] as unknown[],
  cursor: 0,
  refs: [] as Array<{ current: unknown }>,
  refCursor: 0,
}));
vi.mock("@/db/client", () => ({ db: { feedback: { findMany: mocks.findMany } } }));
vi.mock("@/lib/authorization", () => ({
  hasRole: (user: { roles: { role: { name: string } }[] }, role: string) =>
    user.roles.some((item) => item.role.name === role),
}));
vi.mock("@/lib/page-authorization", () => ({
  requireFeedbackReviewerPage: mocks.authorize,
  requireAdminShellPage: mocks.authorize,
}));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    useEffect: vi.fn(),
    useRef: (initial: unknown) => {
      const index = mocks.refCursor++;
      if (!(index in mocks.refs)) mocks.refs[index] = { current: initial };
      return mocks.refs[index];
    },
    useState: (initial: unknown) => {
      const index = mocks.cursor++;
      if (!(index in mocks.states)) mocks.states[index] = initial;
      return [
        mocks.states[index],
        (value: unknown) => {
          mocks.states[index] = value;
        },
      ];
    },
  };
});

import FeedbackPage from "../src/app/(admin)/admin/feedback/page";
import AdminLayout from "../src/app/(admin)/admin/layout";
import { FeedbackReviewButton } from "../src/components/feedback-review-button";

type Node = React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
function elements(tree: React.ReactNode): Node[] {
  const result: Node[] = [];
  React.Children.forEach(tree, (child) => {
    if (React.isValidElement(child)) {
      const element = child as Node;
      result.push(element, ...elements(element.props.children));
    }
  });
  return result;
}
function renderButton(reviewedAt: string | null = null) {
  mocks.cursor = 0;
  mocks.refCursor = 0;
  return FeedbackReviewButton({ id: "b2f6f8a8-e041-4f9f-a07d-b8b2f6b7f450", reviewedAt });
}
function click(tree: React.ReactNode) {
  const button = elements(tree).find((element) => element.type === "button")!;
  return (button.props.onClick as () => Promise<void>)();
}
function reply(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
const fetchMock = vi.fn();
const sample = {
  id: "b2f6f8a8-e041-4f9f-a07d-b8b2f6b7f450",
  category: "ERROR",
  section: "SIMULADOR",
  message: "El botón no responde.\n<script>alert('prueba')</script>",
  createdAt: new Date("2026-09-14T18:30:00Z"),
  reviewedAt: null,
  user: { name: "Alumno de prueba", email: "alumno@example.test" },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.states = [];
  mocks.cursor = 0;
  mocks.refs = [];
  mocks.refCursor = 0;
  mocks.authorize.mockResolvedValue({ roles: [{ role: { name: "SUPER_ADMIN" } }] });
  mocks.findMany.mockResolvedValue([]);
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Bandeja privada del buzón", () => {
  it("autoriza en la página antes de consultar mensajes", async () => {
    mocks.authorize.mockResolvedValueOnce(null);
    const html = renderToStaticMarkup(await FeedbackPage({ searchParams: {} }));
    expect(html).toContain("Acceso restringido");
    expect(html).toContain('href="/perfil#buzon"');
    expect(mocks.authorize).toHaveBeenCalledWith();
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("selecciona únicamente los datos del mensaje y remitente necesarios", async () => {
    mocks.findMany.mockResolvedValueOnce([sample]);
    const tree = await FeedbackPage({ searchParams: {} });
    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
      select: {
        id: true,
        category: true,
        section: true,
        message: true,
        createdAt: true,
        reviewedAt: true,
        user: { select: { name: true, email: true } },
      },
    });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Reporte de error");
    expect(html).toContain("Simulador");
    expect(html).toContain("Nuevo");
    expect(html).toContain("alumno@example.test");
    expect(html).toContain("12:30");
    expect(html).toContain("hora de Ciudad de México");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("mailto:");
    const review = elements(tree).find((element) => element.type === FeedbackReviewButton)!;
    expect(review.props).toEqual({ id: sample.id, reviewedAt: null });
  });

  it("limita a veinte mensajes y usa el último mostrado como cursor", async () => {
    mocks.findMany.mockResolvedValueOnce(
      Array.from({ length: 21 }, (_, index) => ({
        ...sample,
        id: `b2f6f8a8-e041-4f9f-a07d-${String(index).padStart(12, "0")}`,
      })),
    );
    const tree = await FeedbackPage({ searchParams: {} });
    expect(elements(tree).filter((element) => element.type === "article")).toHaveLength(20);
    const link = elements(tree).find((element) => String(element.props.href).includes("?cursor="))!;
    expect(link.props.href).toBe("/admin/feedback?cursor=b2f6f8a8-e041-4f9f-a07d-000000000019");
  });

  it("pagina sin repetir el cursor y permite regresar al inicio", async () => {
    const tree = await FeedbackPage({ searchParams: { cursor: sample.id } });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: sample.id },
        skip: 1,
        take: 21,
      }),
    );
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("No hay más mensajes");
    expect(html).toContain("Mensajes más recientes");
  });

  it.each(["no-es-uuid", "", [sample.id, sample.id]])(
    "rechaza cursor inválido %j sin acceder a DB",
    async (cursor) => {
      const html = renderToStaticMarkup(await FeedbackPage({ searchParams: { cursor } }));
      expect(mocks.findMany).not.toHaveBeenCalled();
      expect(html).toContain("El enlace de esta página no es válido");
      expect(html).toContain('href="/admin/feedback"');
    },
  );

  it("muestra un estado vacío claro", async () => {
    const html = renderToStaticMarkup(await FeedbackPage({ searchParams: {} }));
    expect(html).toContain("Todavía no hay mensajes en el buzón");
    expect(html).not.toContain("Paginación del buzón");
  });

  it.each(["SUPER_ADMIN", "SOPORTE", "EDITOR_ACADEMICO", "ANALISTA"])(
    "mantiene navegación para %s sin exponer el buzón a otros roles",
    async (role) => {
      mocks.authorize.mockResolvedValueOnce({ roles: [{ role: { name: role } }] });
      const html = renderToStaticMarkup(await AdminLayout({ children: <p>Contenido</p> }));
      expect(mocks.authorize).toHaveBeenCalledWith();
      expect(html.includes('href="/admin/feedback"')).toBe(
        ["SUPER_ADMIN", "SOPORTE"].includes(role),
      );
      expect(html).toContain('href="/admin"');
      expect(html).toContain('href="/perfil"');
    },
  );
});

describe("Control de revisión de mensajes", () => {
  it("confirma el cambio en servidor antes de actualizar la interfaz", async () => {
    let release!: (value: ReturnType<typeof reply>) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const tree = renderButton();
    const pending = click(tree);
    await click(tree);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.states[0]).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/feedback/${sample.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ reviewed: true }),
    });
    release(reply({ id: sample.id, reviewedAt: "2026-09-14T19:00:00.000Z" }));
    await pending;
    expect(mocks.states[0]).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.states[3]).toBe("Mensaje marcado como revisado.");
    expect(
      elements(renderButton()).find((element) => element.type === "button")!.props.children,
    ).toBe("Marcar como nuevo");
  });

  it("permite volver a marcar como nuevo", async () => {
    fetchMock.mockResolvedValueOnce(reply({ id: sample.id, reviewedAt: null }));
    await click(renderButton("2026-09-14T19:00:00.000Z"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ reviewed: false }),
      }),
    );
    expect(mocks.states[0]).toBe(false);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 404, 429, 500])("no afirma éxito tras error HTTP %s", async (status) => {
    fetchMock.mockResolvedValueOnce(reply({ error: "Información interna no mostrable" }, status));
    await click(renderButton());
    expect(mocks.states[0]).toBe(false);
    expect(mocks.states[1]).toBe(false);
    expect(mocks.states[2]).toBeTruthy();
    expect(mocks.states[2]).not.toContain("Información interna");
    expect(mocks.states[3]).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { id: "otro", reviewedAt: "2026-09-14T19:00:00.000Z" },
    { id: sample.id, reviewedAt: "fecha inválida" },
    { id: sample.id, reviewedAt: null },
  ])("rechaza respuestas de éxito incompletas o contradictorias %j", async (data) => {
    fetchMock.mockResolvedValueOnce(reply(data));
    await click(renderButton());
    expect(mocks.states[0]).toBe(false);
    expect(mocks.states[2]).toContain("No se pudo confirmar el cambio");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("preserva el estado ante una falla de red", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network failure"));
    await click(renderButton());
    expect(mocks.states[0]).toBe(false);
    expect(mocks.states[1]).toBe(false);
    expect(mocks.states[2]).toContain("Revisa tu conexión");
    expect(mocks.states[3]).toBeNull();
  });
});
