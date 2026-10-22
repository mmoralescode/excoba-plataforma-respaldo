import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { license: { findUnique: mocks.find } } }));
import { validateLicenseFolio } from "@/server/use-cases/validate-license-folio";
import { hashToken } from "@/lib/security/tokens";

const fresh = {
  id: "license", userId: null, activatedAt: null, status: "CREADA",
  validityMonths: 4, startsAt: null, expiresAt: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  mocks.find.mockResolvedValue(fresh);
});
afterEach(() => vi.useRealTimers());

describe("Validación preliminar del folio", () => {
  it("normaliza espacios y mayúsculas antes de validar longitud y consultar solo su hash", async () => {
    await validateLicenseFolio({ folio: "   excoba-aaaa-bbbb-cccc-dddd   " });
    expect(mocks.find).toHaveBeenCalledWith({
      where: { codeHash: hashToken("EXCOBA-AAAA-BBBB-CCCC-DDDD") },
    });
  });
  it("acepta el formato histórico sin inventar una duración nueva", async () => {
    mocks.find.mockResolvedValue({ ...fresh, validityMonths: null });
    expect((await validateLicenseFolio({ folio: "EXCOBA-AAAA-BBBB" })).validityMonths).toBeNull();
  });
  it.each([
    null, { ...fresh, userId: "taken" }, { ...fresh, activatedAt: new Date() },
    { ...fresh, status: "CANCELADA" },
    { ...fresh, validityMonths: 6 },
    { ...fresh, expiresAt: new Date("2026-09-10T12:00:00Z") },
    { ...fresh, startsAt: new Date("2026-09-11T12:00:00Z") },
  ])("rechaza inexistentes, utilizados, expirados y todavía no vigentes", async (license) => {
    mocks.find.mockResolvedValue(license);
    await expect(validateLicenseFolio({ folio: "EXCOBA-AAAA-BBBB" }))
      .rejects.toThrow("El folio no es válido, ya fue utilizado o expiró.");
  });
});
