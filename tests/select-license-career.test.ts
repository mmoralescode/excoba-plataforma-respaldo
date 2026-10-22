import { beforeEach, describe, expect, it, vi } from "vitest";
import { careers } from "@/content/career-catalog";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), audit: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { $transaction: mocks.transaction } }));
import { selectLicenseCareer } from "@/server/use-cases/select-license-career";

function fakeDatabase(options: { careerScope?: string; validityMonths?: number; status?: string; synchronizeReads?: boolean } = {}) {
  const license = {
    id: "license", userId: "student", validityMonths: options.validityMonths ?? 2,
    careerScope: options.careerScope ?? "SINGLE_CAREER", selectedCareerId: null as string | null,
    careerSelectedAt: null as Date | null, startsAt: null, expiresAt: null, status: options.status ?? "ACTIVADA",
  };
  let reads = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  const update = vi.fn(async ({ where, data }) => {
    expect(where).toMatchObject({ id: "license", userId: "student", status: "ACTIVADA", selectedCareerId: null });
    if (license.selectedCareerId !== null) return { count: 0 };
    Object.assign(license, data);
    return { count: 1 };
  });
  mocks.transaction.mockImplementation(async (callback) => callback({
    user: { findUnique: async () => {
      const snapshot = { ...license };
      if (options.synchronizeReads) {
        if (++reads === 2) release();
        await ready;
      }
      return { id: "student", status: "ACTIVO", deletedAt: null, roles: [{ role: { name: "ALUMNO" } }], license: snapshot };
    } },
    license: { updateMany: update, findUnique: async () => ({ ...license }) },
    auditLog: { create: mocks.audit },
  }));
  return { license, update };
}

beforeEach(() => vi.resetAllMocks());
describe("Primera carrera confirmada, inmutable y auditable", () => {
  it("confirma una sola vez y reintentar la misma carrera es idempotente", async () => {
    const store = fakeDatabase();
    const careerId = careers[0]!.id;
    const result = await selectLicenseCareer("student", { careerId, userId: "forged", careerScope: "ALL_CAREERS" });
    expect(result.selectedCareerId).toBe(careerId);
    expect(result.careerSelectedAt).toBeTruthy();
    expect(result.careerScope).toBe("SINGLE_CAREER");
    expect(await selectLicenseCareer("student", { careerId })).toEqual(result);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(store.license.selectedCareerId).toBe(careerId);
  });
  it("dos pestañas con carreras diferentes producen un ganador y un conflicto 409", async () => {
    const store = fakeDatabase({ synchronizeReads: true });
    const results = await Promise.allSettled(careers.slice(0, 2).map(({ id }) => selectLicenseCareer("student", { careerId: id })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason.status).toBe(409);
    expect(store.license.selectedCareerId).toBe(careers[0]!.id);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it("el plan de cuatro meses conserva todas las carreras sin bloquear ninguna", async () => {
    const store = fakeDatabase({ careerScope: "ALL_CAREERS", validityMonths: 4 });
    const result = await selectLicenseCareer("student", { careerId: careers[0]!.id });
    expect(result.careerScope).toBe("ALL_CAREERS");
    expect(result.selectedCareerId).toBeNull();
    expect(store.update).not.toHaveBeenCalled();
  });
  it("rechaza IDs inventados antes de escribir", async () => {
    await expect(selectLicenseCareer("student", { careerId: "inventada" })).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each(["REVOCADA", "EXPIRADA", "SUSPENDIDA"])("no cambia una licencia %s", async (status) => {
    const store = fakeDatabase({ status });
    await expect(selectLicenseCareer("student", { careerId: careers[0]!.id })).rejects.toMatchObject({ status: 401 });
    expect(store.update).not.toHaveBeenCalled();
  });
});
