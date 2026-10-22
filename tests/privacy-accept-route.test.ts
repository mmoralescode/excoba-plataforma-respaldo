import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), accept: vi.fn() }));
vi.mock("../src/lib/authorization", () => ({
  requireUser: mocks.requireUser,
  UnauthorizedError: class extends Error {},
}));
vi.mock("../src/server/use-cases/accept-privacy-notice", () => ({
  acceptPrivacyNotice: mocks.accept,
  PrivacyNoticeAcceptanceError: class extends Error {},
}));
import { POST } from "../src/app/api/privacy/accept/route";
import { UnauthorizedError } from "../src/lib/authorization";
import { PRIVACY_NOTICE_VERSION } from "../src/content/privacy-notice-version";

function request(
  body: unknown = { accepted: true, version: PRIVACY_NOTICE_VERSION },
  origin = "https://excoba.example",
) {
  return new Request("https://excoba.example/api/privacy/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "session-user" });
  mocks.accept.mockResolvedValue({
    acceptedAt: new Date("2026-09-13T12:00:00Z"),
    alreadyAccepted: false,
  });
});
describe("registro explícito del mensaje de privacidad", () => {
  it("solo registra la cuenta de la sesión, nunca una indicada por el cliente", async () => {
    const response = await POST(
      request({ accepted: true, version: PRIVACY_NOTICE_VERSION, userId: "another-user" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.accept).toHaveBeenCalledWith("session-user");
  });
  it("rechaza usuarios sin sesión", async () => {
    mocks.requireUser.mockRejectedValue(new UnauthorizedError());
    expect((await POST(request())).status).toBe(401);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { accepted: false, version: PRIVACY_NOTICE_VERSION },
    { accepted: true, version: "anterior" },
  ])("rechaza aceptación ausente, negativa o versión obsoleta: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("rechaza solicitudes desde otro sitio", async () => {
    expect((await POST(request(undefined, "https://otro.example"))).status).toBe(403);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
  it("rechaza formularios que no envían JSON", async () => {
    const invalid = new Request("https://excoba.example/api/privacy/accept", {
      method: "POST",
      body: "accepted=true",
    });
    expect((await POST(invalid)).status).toBe(415);
    expect(mocks.accept).not.toHaveBeenCalled();
  });
});
