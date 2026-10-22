import { describe, expect, it } from "vitest";
import { canAccessPlatform } from "../src/lib/license-access";

const now = new Date("2026-09-10T18:00:00Z");
const student = () => ({
  id: "student",
  status: "ACTIVO",
  deletedAt: null as Date | null,
  roles: [{ role: { name: "ALUMNO" } }],
  license: {
    userId: "student",
    status: "ACTIVADA",
    startsAt: new Date("2026-03-10T18:00:00Z"),
    expiresAt: new Date("2026-09-10T18:00:01Z"),
  },
});

describe("Vigencia en cada acceso del alumno", () => {
  it("acepta licencia vigente y rechaza al llegar al instante de vencimiento", () => {
    expect(canAccessPlatform(student(), now)).toBe(true);
    expect(canAccessPlatform(student(), new Date("2026-09-10T18:00:01Z"))).toBe(false);
  });
  it.each(["CREADA", "ASIGNADA", "SUSPENDIDA", "EXPIRADA", "CANCELADA", "REVOCADA"])(
    "rechaza licencia %s",
    (status) => {
      const user = student();
      user.license.status = status;
      expect(canAccessPlatform(user, now)).toBe(false);
    },
  );
  it("no acepta una licencia de otro usuario ni una vigencia futura", () => {
    const user = student();
    user.license.userId = "other";
    expect(canAccessPlatform(user, now)).toBe(false);
    user.license.userId = user.id;
    user.license.startsAt = new Date("2026-09-11T00:00:00Z");
    expect(canAccessPlatform(user, now)).toBe(false);
  });
  it("conserva acceso de personal sin licencia, pero no usuarios suspendidos o borrados", () => {
    const admin = { ...student(), roles: [{ role: { name: "SUPER_ADMIN" } }], license: null };
    expect(canAccessPlatform(admin, now)).toBe(true);
    expect(canAccessPlatform({ ...admin, status: "SUSPENDIDO" }, now)).toBe(false);
    expect(canAccessPlatform({ ...admin, deletedAt: now }, now)).toBe(false);
    expect(canAccessPlatform({ ...admin, roles: [{ role: { name: "ALUMNO" } }] }, now)).toBe(false);
  });
  it("mantiene las licencias antiguas activadas sin vencimiento", () => {
    expect(
      canAccessPlatform(
        { ...student(), license: { ...student().license, startsAt: null, expiresAt: null } },
        now,
      ),
    ).toBe(true);
  });
});
