import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({
  session: vi.fn(),
  submit: vi.fn(),
  review: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("../src/db/client", () => ({ db: {} }));
vi.mock("../src/lib/session", () => ({ getSessionUser: mock.session }));
vi.mock("../src/server/use-cases/feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/use-cases/feedback")>()),
  submitFeedback: mock.submit,
  reviewFeedback: mock.review,
}));
vi.mock("../src/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/security/rate-limit")>()),
  checkRateLimit: mock.rate,
}));

import * as feedback from "../src/app/api/feedback/route";
import * as moderation from "../src/app/api/admin/feedback/[id]/route";
import { ForbiddenError, UnauthorizedError } from "../src/lib/authorization";
import { hashToken } from "../src/lib/security/tokens";
import {
  FeedbackConflictError,
  FeedbackNotFoundError,
  FeedbackRateLimitError,
} from "../src/server/use-cases/feedback";

const origin = "https://excoba.example.test";
const userId = "student-private-id";
const reportId = "80cf45c6-3bb5-4d02-8d18-4bc90595513e";
const submissionId = "a6a8a70d-aaba-4eb7-8f51-3315e0e46ea1";
const body = {
  category: "ERROR",
  section: "SIMULADOR",
  message: "La siguiente pregunta no permite seleccionar una respuesta.",
  submissionId,
};
const confirmation = { id: reportId, message: "Recibimos tu mensaje. Gracias por ayudarnos." };
const reviewedAt = "2026-09-14T20:00:00.000Z";
type Endpoint = "submit" | "review";

function sessionWithRole(role: string) {
  return {
    id: userId,
    email: "student-private@example.test",
    name: "Nombre privado",
    roles: [{ role: { name: role } }],
  };
}

function request(
  endpoint: Endpoint,
  input: unknown,
  headers: Record<string, string> = {},
  rawBody?: string,
) {
  return new NextRequest(
    origin + (endpoint === "submit" ? "/api/feedback" : `/api/admin/feedback/${reportId}`),
    {
      method: endpoint === "submit" ? "POST" : "PATCH",
      headers: { "content-type": "application/json", origin, ...headers },
      body: rawBody ?? JSON.stringify(input),
    },
  );
}

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

async function call(
  endpoint: Endpoint,
  input: unknown = endpoint === "submit" ? body : { reviewed: true },
  headers: Record<string, string> = {},
  rawBody?: string,
) {
  const req = request(endpoint, input, headers, rawBody);
  const response =
    endpoint === "submit"
      ? await feedback.POST(req)
      : await moderation.PATCH(req, { params: { id: reportId } });
  // Every successful and rejected response must be private, including validation failures.
  expectPrivate(response);
  return response;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock.session.mockResolvedValue(sessionWithRole("ALUMNO"));
  mock.submit.mockResolvedValue(confirmation);
  mock.review.mockResolvedValue({ id: reportId, reviewedAt });
  mock.rate.mockReturnValue({ allowed: true });
});
afterEach(() => vi.restoreAllMocks());

describe("buzón privado: envío", () => {
  it("exige una sesión válida antes de validar o guardar contenido", async () => {
    mock.session.mockResolvedValue(null);
    expect((await call("submit")).status).toBe(401);
    expect(mock.submit).not.toHaveBeenCalled();
    expect(mock.rate).not.toHaveBeenCalled();
  });

  it("una cookie inventada no sustituye la comprobación de sesión en el servidor", async () => {
    mock.session.mockResolvedValue(null);
    expect((await call("submit", body, { cookie: "excoba_session=forged" })).status).toBe(401);
    expect(mock.submit).not.toHaveBeenCalled();
  });

  it("deniega el envío si la cuenta pierde acceso durante la operación", async () => {
    mock.submit.mockRejectedValue(new UnauthorizedError());
    expect((await call("submit")).status).toBe(401);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("obtiene la identidad de la sesión y devuelve solo la confirmación", async () => {
    const response = await call("submit", { ...body, message: `  ${body.message}  ` });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(confirmation);
    expect(mock.submit).toHaveBeenCalledWith(userId, body);
    expect(mock.review).not.toHaveBeenCalled();
    expect(mock.rate).toHaveBeenCalledWith(`feedback:user:${hashToken(userId)}`, 10, 900000);
    expect(JSON.stringify(mock.rate.mock.calls)).not.toContain(userId);
    expect(JSON.stringify(mock.rate.mock.calls)).not.toContain(body.message);
  });

  it.each(["SUGERENCIA", "ERROR"])("admite la categoría %s", async (category) => {
    expect((await call("submit", { ...body, category })).status).toBe(201);
  });

  it.each(["GENERAL", "INSTRUCTIVO", "PRACTICA", "SIMULADOR", "PERFIL", "OTRO"])(
    "admite la sección %s",
    async (section) => expect((await call("submit", { ...body, section })).status).toBe(201),
  );

  it("rechaza identidad, estado y campos administrativos inyectados", async () => {
    for (const field of [
      "userId",
      "actorId",
      "reviewedAt",
      "reviewedById",
      "status",
      "role",
      "canReviewFeedback",
    ]) {
      expect((await call("submit", { ...body, [field]: "attacker-value" })).status).toBe(400);
    }
    expect(mock.submit).not.toHaveBeenCalled();
  });

  it("valida enumeraciones, UUID y longitud después de quitar espacios", async () => {
    for (const input of [
      { ...body, category: "URGENTE" },
      { ...body, section: "ADMIN" },
      { ...body, submissionId: "not-a-uuid" },
      { ...body, submissionId: undefined },
      { ...body, message: "  corto  " },
      { ...body, message: " ".repeat(30) },
      { ...body, message: "x".repeat(1001) },
      { ...body, message: null },
      { ...body, message: ["contenido inválido"] },
    ]) {
      expect((await call("submit", input)).status).toBe(400);
    }
    expect(mock.submit).not.toHaveBeenCalled();
  });

  it("acepta los límites exactos de 10 y 1000 caracteres", async () => {
    for (const length of [10, 1000]) {
      expect((await call("submit", { ...body, message: "x".repeat(length) })).status).toBe(201);
    }
  });

  it("rechaza la cuota rápida antes de guardar", async () => {
    mock.rate.mockReturnValue({ allowed: false });
    expect((await call("submit")).status).toBe(429);
    expect(mock.submit).not.toHaveBeenCalled();
  });

  it("presenta el límite persistente como 429 sin filtrar el mensaje", async () => {
    mock.submit.mockRejectedValue(new FeedbackRateLimitError());
    const response = await call("submit");
    expect(response.status).toBe(429);
    expect(JSON.stringify(await response.json())).not.toContain(body.message);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("devuelve conflicto al reutilizar un identificador para contenido diferente", async () => {
    mock.submit.mockRejectedValue(new FeedbackConflictError());
    const response = await call("submit");
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain(body.message);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("no expone un endpoint de lectura o borrado de mensajes", () => {
    for (const method of ["GET", "DELETE", "PATCH", "PUT"]) {
      expect(feedback).not.toHaveProperty(method);
    }
  });
});

describe("buzón privado: revisión administrativa", () => {
  it("el permiso limitado autoriza revisión y su revocación bloquea la siguiente solicitud", async () => {
    mock.session.mockResolvedValueOnce({ ...sessionWithRole("ALUMNO"), canReviewFeedback: true });
    expect((await call("review")).status).toBe(200);
    expect(mock.review).toHaveBeenCalledWith(userId, reportId, true);
    mock.session.mockResolvedValueOnce({ ...sessionWithRole("ALUMNO"), canReviewFeedback: false });
    expect((await call("review")).status).toBe(403);
    expect(mock.review).toHaveBeenCalledOnce();
  });

  it("un permiso inyectado en el cuerpo no autoriza a un alumno", async () => {
    expect((await call("review", { reviewed: true, canReviewFeedback: true })).status).toBe(403);
    expect(mock.review).not.toHaveBeenCalled();
  });
  it("rechaza solicitudes sin sesión", async () => {
    mock.session.mockResolvedValue(null);
    expect((await call("review")).status).toBe(401);
    expect(mock.review).not.toHaveBeenCalled();
  });

  it.each(["ALUMNO", "ANALISTA", "EDITOR_ACADEMICO"])(
    "%s no puede revisar un mensaje aunque conozca su UUID",
    async (role) => {
      mock.session.mockResolvedValue(sessionWithRole(role));
      expect((await call("review")).status).toBe(403);
      expect(mock.review).not.toHaveBeenCalled();
      expect(mock.submit).not.toHaveBeenCalled();
    },
  );

  it.each(["SUPER_ADMIN", "SOPORTE"])("%s puede marcarlo como revisado", async (role) => {
    mock.session.mockResolvedValue(sessionWithRole(role));
    const response = await call("review");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: reportId, reviewedAt });
    expect(mock.review).toHaveBeenCalledWith(userId, reportId, true);
    expect(mock.rate).toHaveBeenCalledWith(
      `feedback-review:user:${hashToken(userId)}`,
      120,
      900000,
    );
  });

  it("deniega la revisión si el servidor detecta una cuenta o un rol revocados", async () => {
    mock.session.mockResolvedValue(sessionWithRole("SOPORTE"));
    mock.review.mockRejectedValueOnce(new UnauthorizedError());
    expect((await call("review")).status).toBe(401);
    mock.review.mockRejectedValueOnce(new ForbiddenError());
    expect((await call("review")).status).toBe(403);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("acota las revisiones repetidas sin modificar mensajes", async () => {
    mock.session.mockResolvedValue(sessionWithRole("SOPORTE"));
    mock.rate.mockReturnValue({ allowed: false });
    expect((await call("review")).status).toBe(429);
    expect(mock.review).not.toHaveBeenCalled();
  });

  it("un mensaje inexistente retorna 404 genérico", async () => {
    mock.session.mockResolvedValue(sessionWithRole("SOPORTE"));
    mock.review.mockRejectedValue(new FeedbackNotFoundError());
    const response = await call("review");
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain(reportId);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("valida el UUID de ruta antes de consultar el mensaje", async () => {
    mock.session.mockResolvedValue(sessionWithRole("SOPORTE"));
    const response = await moderation.PATCH(request("review", { reviewed: true }), {
      params: { id: "not-an-id' OR 1=1" },
    });
    expectPrivate(response);
    expect(response.status).toBe(400);
    expect(mock.review).not.toHaveBeenCalled();
  });

  it("permite volver a pendiente sin borrar el mensaje", async () => {
    mock.session.mockResolvedValue(sessionWithRole("SOPORTE"));
    mock.review.mockResolvedValue({ id: reportId, reviewedAt: null });
    const response = await call("review", { reviewed: false });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: reportId, reviewedAt: null });
    expect(mock.review).toHaveBeenCalledWith(userId, reportId, false);
  });

  it("valida booleano estricto y rechaza edición de autor o contenido", async () => {
    mock.session.mockResolvedValue(sessionWithRole("SOPORTE"));
    for (const input of [
      {},
      { reviewed: "true" },
      { reviewed: 1 },
      { reviewed: true, userId: "other-student" },
      { reviewed: true, actorId: "other-admin" },
      { reviewed: true, message: "mensaje modificado" },
      { reviewed: true, canReviewFeedback: true },
    ]) {
      expect((await call("review", input)).status).toBe(400);
    }
    expect(mock.review).not.toHaveBeenCalled();
  });

  it("no permite revisar mediante GET ni borrar mediante DELETE", () => {
    for (const method of ["GET", "POST", "DELETE", "PUT"]) {
      expect(moderation).not.toHaveProperty(method);
    }
  });
});

describe.each(["submit", "review"] as const)("origen, tamaño y privacidad de %s", (endpoint) => {
  beforeEach(() => {
    if (endpoint === "review") mock.session.mockResolvedValue(sessionWithRole("SOPORTE"));
  });
  const input = endpoint === "submit" ? body : { reviewed: true };

  it.each<Record<string, string>>([
    { origin: "https://attacker.example.test" },
    { "sec-fetch-site": "cross-site" },
  ])("rechaza CSRF antes de cuotas u operaciones", async (headers) => {
    expect((await call(endpoint, input, headers)).status).toBe(403);
    expect(mock.rate).not.toHaveBeenCalled();
    expect(mock.submit).not.toHaveBeenCalled();
    expect(mock.review).not.toHaveBeenCalled();
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "application/json-evil"])(
    "rechaza Content-Type %s",
    async (contentType) => {
      expect((await call(endpoint, input, { "content-type": contentType })).status).toBe(415);
      expect(mock.submit).not.toHaveBeenCalled();
      expect(mock.review).not.toHaveBeenCalled();
    },
  );

  it("acepta JSON con charset desde el mismo origen", async () => {
    const response = await call(endpoint, input, {
      "content-type": "application/json; charset=utf-8",
    });
    expect(response.status).toBe(endpoint === "submit" ? 201 : 200);
  });

  it("limita el stream real aunque Content-Length falte o sea falso", async () => {
    const oversized = { ...input, padding: "x".repeat(5000) };
    expect((await call(endpoint, oversized)).status).toBe(400);
    expect((await call(endpoint, oversized, { "content-length": "1" })).status).toBe(400);
    expect((await call(endpoint, input, { "content-length": "5000" })).status).toBe(400);
    expect(mock.submit).not.toHaveBeenCalled();
    expect(mock.review).not.toHaveBeenCalled();
  });

  it("rechaza JSON truncado y nulo", async () => {
    expect((await call(endpoint, input, {}, "{")).status).toBe(400);
    expect((await call(endpoint, null)).status).toBe(400);
    expect(mock.submit).not.toHaveBeenCalled();
    expect(mock.review).not.toHaveBeenCalled();
  });

  it("redacta datos personales, contenido y errores internos también en logs", async () => {
    const email = "student-private@example.test";
    const secret = "test-secret-never-log";
    const failure = new Error(`${body.message} ${email} ${userId} ${secret}`);
    mock.submit.mockRejectedValue(failure);
    mock.review.mockRejectedValue(failure);
    const response = await call(endpoint);
    expect(response.status).toBe(500);
    const output = JSON.stringify([await response.json(), vi.mocked(console.error).mock.calls]);
    for (const privateValue of [body.message, email, userId, secret]) {
      expect(output).not.toContain(privateValue);
    }
  });
});
