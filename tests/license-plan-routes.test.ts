import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ session: vi.fn(), practice: vi.fn(), simulator: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.session }));
vi.mock("@/server/use-cases/start-practice", () => ({ startPractice: mocks.practice }));
vi.mock("@/server/use-cases/start-simulator", () => ({ startSimulator: mocks.simulator, SimulatorStartError: class extends Error {} }));
vi.mock("@/server/use-cases/select-license-career", () => ({ selectLicenseCareer: mocks.select }));
import { POST as startPractice } from "@/app/api/practice/start/route";
import { POST as startSimulator } from "@/app/api/simulator/start/route";
import { GET as access } from "@/app/api/license-access/route";
import { POST as selectCareer } from "@/app/api/license-access/career/route";
import { CareerAccessError } from "@/lib/license-career-access";

const user = {
  id: "real-user", roles: [{ role: { name: "ALUMNO" } }],
  license: { validityMonths: 2, careerScope: "SINGLE_CAREER", selectedCareerId: "uaq-2026-1-01", startsAt: null, expiresAt: null },
};
const request = (body: unknown) => new NextRequest("https://excoba.test/api/test", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue(user);
  mocks.practice.mockResolvedValue({});
  mocks.simulator.mockResolvedValue({});
});

describe("El plan del servidor no puede sobrescribirse por el cliente", () => {
  it.each([["practice", startPractice, mocks.practice], ["simulator", startSimulator, mocks.simulator]] as const)(
    "%s deriva usuario y acceso de la sesión, no del JSON", async (_name, handler, useCase) => {
      expect((await handler(request({ userId: "forged", careerScope: "ALL_CAREERS", access: { careerScope: "ALL_CAREERS" } }))).status).toBe(200);
      expect(useCase.mock.calls[0]![0].userId).toBe("real-user");
      expect(useCase.mock.calls[0]![1]).toMatchObject({ careerScope: "SINGLE_CAREER", selectedCareerId: "uaq-2026-1-01" });
    },
  );
  it("el endpoint devuelve el contrato plano sin secretos y sin caché", async () => {
    const response = await access();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      validityMonths: 2, careerScope: "SINGLE_CAREER", selectedCareerId: "uaq-2026-1-01",
      startsAt: null, expiresAt: null, careerSelectedAt: null,
    });
  });
  it("conserva el conflicto409 al intentar otra elección", async () => {
    mocks.select.mockRejectedValue(new CareerAccessError("Otra carrera", 409));
    expect((await selectCareer(request({ careerId: "uaq-2026-1-02", userId: "forged" }))).status).toBe(409);
    expect(mocks.select.mock.calls[0]![0]).toBe("real-user");
  });
  it("rechaza sin sesión antes de consultar o escribir acceso", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await access()).status).toBe(401);
    expect((await selectCareer(request({ careerId: "uaq-2026-1-01" }))).status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("traduce las prohibiciones del contenido a403", async () => {
    mocks.practice.mockRejectedValue(new CareerAccessError("Plan restringido"));
    expect((await startPractice(request({}))).status).toBe(403);
  });
  it("no permite fijar la carrera con un POST de otro origen o un formulario", async () => {
    const foreign = request({ careerId: "uaq-2026-1-01" });
    foreign.headers.set("origin", "https://attacker.test");
    expect((await selectCareer(foreign)).status).toBe(403);
    const form = request({ careerId: "uaq-2026-1-01" });
    form.headers.set("content-type", "application/x-www-form-urlencoded");
    expect((await selectCareer(form)).status).toBe(415);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("limita el tamaño del JSON antes de procesar la elección", async () => {
    expect((await selectCareer(request({ careerId: "x".repeat(5000) }))).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
