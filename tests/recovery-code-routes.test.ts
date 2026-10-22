import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({
  requireUser: vi.fn(),
  status: vi.fn(),
  generate: vi.fn(),
  recover: vi.fn(),
  rate: vi.fn(),
  wait: vi.fn(),
}));
vi.mock("../src/db/client", () => ({ db: {} }));
vi.mock("../src/lib/session", () => ({
  SESSION_COOKIE_NAME: "excoba_session",
  getSessionUser: vi.fn(),
}));
vi.mock("../src/lib/authorization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/authorization")>()),
  requireUser: mock.requireUser,
}));
vi.mock("../src/server/use-cases/recovery-code", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/use-cases/recovery-code")>()),
  getRecoveryCodeStatus: mock.status,
  generateAccountRecoveryCode: mock.generate,
  recoverPasswordWithCode: mock.recover,
}));
vi.mock("../src/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/security/rate-limit")>()),
  checkRateLimit: mock.rate,
}));
vi.mock("../src/lib/security/auth-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/security/auth-request")>()),
  waitForResetResponse: mock.wait,
}));

import * as account from "../src/app/api/account/recovery-code/route";
import * as recovery from "../src/app/api/auth/recover-with-code/route";
import { UnauthorizedError } from "../src/lib/authorization";
import { hashToken } from "../src/lib/security/tokens";
import { hashRecoveryCode } from "../src/lib/security/recovery-code";
import {
  RecoveryCodeError,
  RecoveryCodeGenerationError,
} from "../src/server/use-cases/recovery-code";

const origin = "https://excoba.example.test";
const userId = "student-test-id";
const sessionToken = "test-session-not-a-real-session";
// Public fixture, not a real recovery secret.
const code = "REC-0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ";
const generationBody = { currentPassword: "current-password-test" };
const recoveryBody = {
  email: "student@example.test",
  code,
  newPassword: "new-password-test",
  confirmPassword: "new-password-test",
};
type Endpoint = "account" | "recovery";

function request(
  endpoint: Endpoint,
  body: unknown,
  headers: Record<string, string> = {},
  rawBody?: string,
) {
  const path =
    endpoint === "account" ? "/api/account/recovery-code" : "/api/auth/recover-with-code";
  const requestHeaders: Record<string, string> = {
    "content-type": "application/json",
    origin,
    "x-vercel-forwarded-for": "192.0.2.11",
  };
  if (endpoint === "account") requestHeaders.cookie = `excoba_session=${sessionToken}`;
  Object.assign(requestHeaders, headers);
  return new NextRequest(origin + path, {
    method: "POST",
    body: rawBody ?? JSON.stringify(body),
    headers: requestHeaders,
  });
}

function expectUncached(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}

async function post(
  endpoint: Endpoint,
  body: unknown = endpoint === "account" ? generationBody : recoveryBody,
  headers: Record<string, string> = {},
  rawBody?: string,
) {
  const waitCount = mock.wait.mock.calls.length;
  const response = await (endpoint === "account" ? account.POST : recovery.POST)(
    request(endpoint, body, headers, rawBody),
  );
  // Assert success and every tested failure path cannot cache response secrets.
  expectUncached(response);
  if (endpoint === "recovery") expect(mock.wait).toHaveBeenCalledTimes(waitCount + 1);
  return response;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock.requireUser.mockResolvedValue({ id: userId });
  mock.status.mockResolvedValue({ available: true, createdAt: "2026-09-13T21:00:00.000Z" });
  mock.generate.mockResolvedValue({ code, createdAt: "2026-09-13T21:00:00.000Z" });
  mock.recover.mockResolvedValue({ message: "Contraseña actualizada." });
  mock.rate.mockReturnValue({ allowed: true });
});
afterEach(() => vi.restoreAllMocks());

describe("API privada de emisión y consulta", () => {
  it("GET exige sesión y solo consulta disponibilidad sin emitir ni consumir códigos", async () => {
    const response = await account.GET();
    expectUncached(response);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      available: true,
      createdAt: "2026-09-13T21:00:00.000Z",
    });
    expect(mock.requireUser).toHaveBeenCalledOnce();
    expect(mock.status).toHaveBeenCalledWith(userId);
    expect(mock.generate).not.toHaveBeenCalled();
    expect(mock.recover).not.toHaveBeenCalled();
    expect(mock.rate).not.toHaveBeenCalled();
  });

  it("GET y POST rechazan una sesión ausente, revocada o no autorizada con 401", async () => {
    mock.requireUser.mockRejectedValue(new UnauthorizedError());
    const read = await account.GET();
    expectUncached(read);
    expect(read.status).toBe(401);
    expect((await post("account")).status).toBe(401);
    expect(mock.status).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it("POST exige la cookie concreta además del usuario autenticado", async () => {
    expect((await post("account", generationBody, { cookie: "" })).status).toBe(401);
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it("envía al caso de uso solo usuario, digest de sesión y contraseña actual validada", async () => {
    const response = await post("account");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code, createdAt: "2026-09-13T21:00:00.000Z" });
    expect(mock.generate).toHaveBeenCalledWith(userId, hashToken(sessionToken), generationBody);
    expect(mock.rate).toHaveBeenCalledWith(
      `recovery-generate:user:${hashToken(userId)}`,
      5,
      900000,
    );
    expect(JSON.stringify(mock.rate.mock.calls)).not.toContain(userId);
    expect(JSON.stringify(mock.rate.mock.calls)).not.toContain(sessionToken);
  });

  it("limita rotaciones antes de ejecutar hashing o emitir un código", async () => {
    mock.rate.mockReturnValue({ allowed: false });
    expect((await post("account")).status).toBe(429);
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas vacías, largas y campos de identidad inyectados", async () => {
    for (const body of [
      { currentPassword: "" },
      { currentPassword: "p".repeat(129) },
      { ...generationBody, userId: "another-student" },
    ]) {
      expect((await post("account", body)).status).toBe(400);
    }
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it("error de contraseña o sesión no revela valores privados", async () => {
    mock.generate.mockRejectedValue(new RecoveryCodeGenerationError());
    const response = await post("account");
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain(generationBody.currentPassword);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("errores internos GET y POST se redactan, incluyendo logs", async () => {
    const secretError = new Error(`${code} ${sessionToken} ${generationBody.currentPassword}`);
    mock.generate.mockRejectedValue(secretError);
    mock.status.mockRejectedValue(secretError);
    const read = await account.GET();
    expectUncached(read);
    const write = await post("account");
    expect(read.status).toBe(500);
    expect(write.status).toBe(500);
    const output = JSON.stringify([
      await read.json(),
      await write.json(),
      vi.mocked(console.error).mock.calls,
    ]);
    for (const secret of [code, sessionToken, generationBody.currentPassword])
      expect(output).not.toContain(secret);
  });
});

describe("API pública de recuperación", () => {
  it("funciona sin sesión y nunca expone un handler GET que consuma el código", async () => {
    const response = await post("recovery");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Contraseña actualizada." });
    expect(mock.recover).toHaveBeenCalledWith(recoveryBody);
    expect(mock.requireUser).not.toHaveBeenCalled();
    expect(recovery).not.toHaveProperty("GET");
    expect(mock.generate).not.toHaveBeenCalled();
  });

  it("normaliza correo y código para cuotas; IP, email y código solo figuran como digest", async () => {
    const submitted = {
      ...recoveryBody,
      email: " Student@Example.Test ",
      code: code.toLowerCase().replaceAll("-", " "),
    };
    await post("recovery", submitted, { "x-forwarded-for": "203.0.113.200" });
    expect(mock.recover).toHaveBeenCalledWith({ ...submitted, email: recoveryBody.email });
    expect(mock.rate.mock.calls).toEqual([
      [`recovery-use:ip:${hashToken("192.0.2.11")}`, 60, 900000],
      [`recovery-use:email:${hashToken(recoveryBody.email)}`, 10, 900000],
      [`recovery-use:code:${hashRecoveryCode(code)}`, 5, 900000],
    ]);
    const rateKeys = JSON.stringify(mock.rate.mock.calls);
    for (const secret of [
      "192.0.2.11",
      "203.0.113.200",
      recoveryBody.email,
      code,
      submitted.code,
    ]) {
      expect(rateKeys).not.toContain(secret);
    }
  });

  it.each(["ip", "email", "code"] as const)(
    "rechaza cuota %s agotada sin recuperar",
    async (limited) => {
      mock.rate.mockImplementation((key: string) => ({
        allowed: !key.startsWith(`recovery-use:${limited}:`),
      }));
      expect((await post("recovery")).status).toBe(429);
      expect(mock.recover).not.toHaveBeenCalled();
      if (limited === "ip") expect(mock.rate).toHaveBeenCalledOnce();
    },
  );

  it("responde igual a códigos ajenos, consumidos o correos inexistentes", async () => {
    mock.recover.mockRejectedValue(new RecoveryCodeError());
    const a = await post("recovery");
    const b = await post("recovery", { ...recoveryBody, email: "absent@example.test" });
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(await a.json()).toEqual(await b.json());
    expect(console.error).not.toHaveBeenCalled();
  });

  it("valida correo, confirmación, contraseña, tamaño de código y campos extra", async () => {
    for (const body of [
      { ...recoveryBody, email: "not-an-email" },
      { ...recoveryBody, confirmPassword: "different-password" },
      { ...recoveryBody, newPassword: "short", confirmPassword: "short" },
      { ...recoveryBody, newPassword: "p".repeat(129), confirmPassword: "p".repeat(129) },
      { ...recoveryBody, code: "x".repeat(101) },
      { ...recoveryBody, userId: "another-student" },
    ]) {
      expect((await post("recovery", body)).status).toBe(400);
    }
    expect(mock.recover).not.toHaveBeenCalled();
  });

  it("no filtra contenido de errores internos ni datos enviados en respuesta o logs", async () => {
    mock.recover.mockRejectedValue(new Error(JSON.stringify(recoveryBody)));
    const response = await post("recovery");
    expect(response.status).toBe(500);
    const output = JSON.stringify([await response.json(), vi.mocked(console.error).mock.calls]);
    for (const secret of [code, recoveryBody.email, recoveryBody.newPassword])
      expect(output).not.toContain(secret);
  });
});

describe.each(["account", "recovery"] as const)("límites y origen de %s", (endpoint) => {
  const body = endpoint === "account" ? generationBody : recoveryBody;

  it.each<Record<string, string>>([
    { origin: "https://attacker.example.test" },
    { "sec-fetch-site": "cross-site" },
  ])("rechaza origen externo antes de consultar cuotas o ejecutar operaciones", async (headers) => {
    expect((await post(endpoint, body, headers)).status).toBe(403);
    expect(mock.rate).not.toHaveBeenCalled();
    expect(mock.generate).not.toHaveBeenCalled();
    expect(mock.recover).not.toHaveBeenCalled();
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "application/json-evil"])(
    "rechaza Content-Type %s para bloquear envíos de formulario",
    async (contentType) => {
      expect((await post(endpoint, body, { "content-type": contentType })).status).toBe(415);
      expect(mock.rate).not.toHaveBeenCalled();
      expect(mock.generate).not.toHaveBeenCalled();
      expect(mock.recover).not.toHaveBeenCalled();
    },
  );

  it("acepta JSON con charset desde el mismo origen", async () => {
    expect(
      (await post(endpoint, body, { "content-type": "application/json; charset=utf-8" })).status,
    ).toBe(200);
  });

  it("acota streams incluso sin Content-Length o con longitud falsa", async () => {
    const oversized = { ...body, padding: "x".repeat(5000) };
    expect((await post(endpoint, oversized)).status).toBe(400);
    expect((await post(endpoint, oversized, { "content-length": "1" })).status).toBe(400);
    expect((await post(endpoint, body, { "content-length": "5000" })).status).toBe(400);
    expect(mock.generate).not.toHaveBeenCalled();
    expect(mock.recover).not.toHaveBeenCalled();
  });

  it("rechaza JSON truncado o nulo sin ejecutar el caso de uso", async () => {
    expect((await post(endpoint, body, {}, "{")).status).toBe(400);
    expect((await post(endpoint, null)).status).toBe(400);
    expect(mock.generate).not.toHaveBeenCalled();
    expect(mock.recover).not.toHaveBeenCalled();
  });
});
