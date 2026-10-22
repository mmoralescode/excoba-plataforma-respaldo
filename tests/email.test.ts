import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertEmailConfigured,
  EmailConfigurationError,
  EmailDeliveryError,
  sendEmail,
  sendLicenseAssignedEmail,
  sendPasswordResetEmail,
} from "../src/lib/email/mailer";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "re_fake_test_key");
  vi.stubEnv("EMAIL_FROM", "EXCOBA <acceso@correo.example.com>");
  vi.stubEnv("APP_URL", "https://excoba.example.com");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: "accepted-id" })));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("correo transaccional sin fallback inseguro", () => {
  it.each([
    ["EMAIL_PROVIDER", "", "PROVIDER"],
    ["EMAIL_PROVIDER", "console", "PROVIDER"],
    ["RESEND_API_KEY", "", "API_KEY"],
    ["EMAIL_FROM", "", "SENDER"],
    ["EMAIL_FROM", "onboarding@resend.dev", "SENDER"],
    ["EMAIL_FROM", "EXCOBA <onboarding@resend.dev>", "SENDER"],
    ["EMAIL_FROM", "a@example.com\r\nBcc: victim@example.com", "SENDER"],
  ])("rechaza configuración %s inválida antes de enviar", (key, value, code) => {
    vi.stubEnv(key, value);
    expect(assertEmailConfigured).toThrow(EmailConfigurationError);
    try {
      assertEmailConfigured();
    } catch (error) {
      expect(error).toMatchObject({ code });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "not-a-url",
    "http://excoba.example.com",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?host=evil",
    "https://example.com#token",
    "https://localhost",
    "javascript:alert(1)",
  ])("rechaza APP_URL %s en producción", (url) => {
    vi.stubEnv("APP_URL", url);
    expect(assertEmailConfigured).toThrow(EmailConfigurationError);
  });

  it("admite HTTP solo para desarrollo local explícito", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(assertEmailConfigured).not.toThrow();
    vi.stubEnv("APP_URL", "http://untrusted.example.com");
    expect(assertEmailConfigured).toThrow();
  });

  it("envía por Resend y coloca el token en fragmento del origen configurado", async () => {
    const token = "a".repeat(43);
    expect(await sendPasswordResetEmail("student@example.com", token)).toEqual({
      id: "accepted-id",
    });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const payload = JSON.parse(options.body);
    expect(payload.to).toEqual(["student@example.com"]);
    expect(payload.from).toBe("EXCOBA <acceso@correo.example.com>");
    expect(payload.text).toContain(
      `https://excoba.example.com/recuperar-password/confirmar#token=${token}`,
    );
    expect(payload.text).not.toContain("?token=");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("no acepta silencio, respuesta inválida, fallo de red ni rechazo del proveedor", async () => {
    fetchMock.mockResolvedValueOnce(new Response("sensitive recipient token", { status: 403 }));
    await expect(sendEmail("private@example.com", "subject", "secret")).rejects.toMatchObject({
      code: "REJECTED",
      status: 403,
    });
    fetchMock.mockResolvedValueOnce(new Response("{}"));
    await expect(sendEmail("private@example.com", "subject", "secret")).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    fetchMock.mockRejectedValueOnce(new Error("private@example.com secret"));
    await expect(sendEmail("private@example.com", "subject", "secret")).rejects.toBeInstanceOf(
      EmailDeliveryError,
    );
  });

  it("nunca imprime destinatarios, tokens, folios o cuerpos de error", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("folio-SECRET user@example.com"));
    await expect(sendLicenseAssignedEmail("user@example.com", "folio-SECRET")).rejects.toThrow();
    vi.stubEnv("EMAIL_PROVIDER", "console");
    await expect(sendPasswordResetEmail("user@example.com", "token-SECRET")).rejects.toThrow();
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
  });
});
