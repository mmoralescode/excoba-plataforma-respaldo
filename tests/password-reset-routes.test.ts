import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ request: vi.fn(), reset: vi.fn(), rate: vi.fn(), wait: vi.fn() }));
vi.mock("../src/db/client", () => ({ db: {} }));
vi.mock("../src/server/use-cases/password-reset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/use-cases/password-reset")>()),
  requestPasswordReset: mock.request,
  resetPassword: mock.reset,
}));
vi.mock("../src/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/security/rate-limit")>()),
  checkRateLimit: mock.rate,
}));
vi.mock("../src/lib/security/auth-request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/security/auth-request")>()),
  waitForResetResponse: mock.wait,
}));
import * as forgot from "../src/app/api/auth/forgot-password/route";
import * as confirm from "../src/app/api/auth/reset-password/route";
import { PASSWORD_RESET_MESSAGE, ResetPasswordError } from "../src/server/use-cases/password-reset";
import { EmailConfigurationError } from "../src/lib/email/mailer";
import { readAuthJson, authClientIp } from "../src/lib/security/auth-request";
import { hashToken } from "../src/lib/security/tokens";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://excoba.example.com/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1", ...headers },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock.rate.mockReturnValue({ allowed: true });
  mock.request.mockResolvedValue({ message: PASSWORD_RESET_MESSAGE });
  mock.reset.mockResolvedValue({ message: "Contraseña actualizada correctamente." });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("API de recuperación", () => {
  it("mantiene status/cuerpo genéricos para cuentas existentes o ausentes", async () => {
    const a = await forgot.POST(request({ email: "exists@example.com" }));
    const b = await forgot.POST(request({ email: "absent@example.com" }));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
    expect(mock.wait).toHaveBeenCalledTimes(2);
  });

  it("devuelve el mismo 503 ante configuración global ausente, nunca afirma enviado", async () => {
    mock.request.mockRejectedValue(new EmailConfigurationError("API_KEY"));
    const a = await forgot.POST(request({ email: "exists@example.com" }));
    const b = await forgot.POST(request({ email: "absent@example.com" }));
    expect(a.status).toBe(503);
    expect(b.status).toBe(503);
    expect(await a.json()).toEqual(await b.json());
  });

  it("normaliza correo antes de usarlo en cuota y no almacena PII en su clave", async () => {
    await forgot.POST(request({ email: " Student@Example.com " }));
    expect(mock.request).toHaveBeenCalledWith({ email: "student@example.com" });
    expect(mock.rate.mock.calls[1]![0]).toBe(
      `password-reset:email:${hashToken("student@example.com")}`,
    );
    expect(JSON.stringify(mock.rate.mock.calls)).not.toContain("student@example.com");
  });

  it("aplica límites IP y correo antes del caso de uso", async () => {
    mock.rate.mockReturnValueOnce({ allowed: false });
    expect((await forgot.POST(request({ email: "student@example.com" }))).status).toBe(429);
    expect(mock.request).not.toHaveBeenCalled();
    mock.rate.mockReturnValueOnce({ allowed: true }).mockReturnValueOnce({ allowed: false });
    expect((await forgot.POST(request({ email: "student@example.com" }))).status).toBe(429);
    expect(mock.request).not.toHaveBeenCalled();
  });

  it("rechaza payload excesivo o JSON inválido sin emitir correo", async () => {
    expect((await forgot.POST(request({ email: "x".repeat(5000) }))).status).toBe(400);
    const malformed = new NextRequest("https://example.com", { method: "POST", body: "{" });
    expect((await forgot.POST(malformed)).status).toBe(400);
    expect(mock.request).not.toHaveBeenCalled();
  });

  it("confirmación limita IP/token y distingue enlace inválido de error interno sin filtrar detalles", async () => {
    const body = { token: "a".repeat(43), newPassword: "new-password-123" };
    mock.reset.mockRejectedValueOnce(new ResetPasswordError());
    const invalid = await confirm.POST(request(body));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(mock.rate.mock.calls[1]![0]).toBe(`reset-confirm:token:${hashToken(body.token)}`);
    mock.reset.mockRejectedValueOnce(new Error("secret-token user@example.com"));
    const failure = await confirm.POST(request(body));
    expect(failure.status).toBe(500);
    expect(JSON.stringify(await failure.json())).not.toContain("secret-token");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("user@example.com");
    mock.rate.mockReturnValueOnce({ allowed: false });
    expect((await confirm.POST(request(body))).status).toBe(429);
  });

  it("confirmación exige token exacto y contraseña acotada; GET no consume tokens", async () => {
    expect(
      (await confirm.POST(request({ token: "short", newPassword: "new-password-123" }))).status,
    ).toBe(400);
    expect(
      (await confirm.POST(request({ token: "a".repeat(43), newPassword: "p".repeat(129) }))).status,
    ).toBe(400);
    expect(mock.reset).not.toHaveBeenCalled();
    expect(confirm).not.toHaveProperty("GET");
    expect(forgot).not.toHaveProperty("GET");
  });
});

describe("límites de entrada HTTP", () => {
  it("acota el stream aunque Content-Length mienta y acepta exactamente JSON pequeño", async () => {
    await expect(
      readAuthJson(request({ x: "a".repeat(5000) }, { "content-length": "1" })),
    ).rejects.toThrow();
    await expect(readAuthJson(request({ email: "ok@example.com" }))).resolves.toEqual({
      email: "ok@example.com",
    });
  });
  it("rechaza una IP arbitraria y conserva solo la primera dirección válida", () => {
    expect(authClientIp(request({}, { "x-forwarded-for": "192.0.2.2, 198.51.100.1" }))).toBe(
      "192.0.2.2",
    );
    expect(authClientIp(request({}, { "x-forwarded-for": "arbitrary-attacker-key" }))).toBe(
      "unknown",
    );
  });
});
