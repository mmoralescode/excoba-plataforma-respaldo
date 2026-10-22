import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), create: vi.fn(), event: vi.fn(), product: vi.fn(), audit: vi.fn(),
  folio: vi.fn(), configured: vi.fn(), email: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/security/tokens", async (original) => ({
  ...await original<typeof import("@/lib/security/tokens")>(),
  generateLicenseFolio: mocks.folio,
}));
vi.mock("@/lib/email/mailer", () => ({
  assertEmailConfigured: mocks.configured, sendLicenseAssignedEmail: mocks.email,
}));
import { createLicense, CreateLicenseInputSchema } from "@/server/use-cases/create-license";
import { hashToken } from "@/lib/security/tokens";

const input = { productId: "product", createdByAdminId: "00000000-0000-4000-8000-000000000001" };
const first = "EXCOBA-AAAA-BBBB-CCCC-DDDD";
const second = "EXCOBA-EEEE-FFFF-GGGG-HHHH";
const duplicate = (target = "codeHash") => new Prisma.PrismaClientKnownRequestError(
  "Unique constraint failed", { code: "P2002", clientVersion: "test", meta: { target: [target] } },
);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.folio.mockReturnValue(first);
  mocks.product.mockResolvedValue({ id: "product", isActive: true });
  mocks.create.mockImplementation(async ({ data }) => ({ id: "license", ...data }));
  mocks.transaction.mockImplementation(async (callback) => callback({
    license: { create: mocks.create }, licenseEvent: { create: mocks.event },
    product: { findUnique: mocks.product }, auditLog: { create: mocks.audit },
  }));
});

describe("Emisión de folios de un solo usuario", () => {
  it("guarda hash/últimos cuatro, cuatro meses y ninguna fecha de inicio anticipada", async () => {
    const result = await createLicense(input);
    const stored = mocks.create.mock.calls[0]![0].data;
    expect(stored).toMatchObject({
      validityMonths: 4, careerScope: "ALL_CAREERS", maxActivations: 1, codeHash: hashToken(first),
      codeLastFour: "DDDD", startsAt: null, activatedAt: null, expiresAt: null,
    });
    expect(JSON.stringify(stored)).not.toContain(first);
    expect(result.folio).toBe(first);
    expect(result.emailSent).toBeNull();
    expect(mocks.event).toHaveBeenCalledWith({
      data: { licenseId: "license", type: "CREACION", adminId: input.createdByAdminId },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledWith({
      data: { actorId: input.createdByAdminId, action: "LICENSE_CREATED", entity: "License", entityId: "license" },
    });
  });
  it.each([null, { id: "product", isActive: false }])("no emite folios para productos inexistentes o inactivos", async (product) => {
    mocks.product.mockResolvedValue(product);
    await expect(createLicense(input)).rejects.toThrow("producto no está disponible");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("un fallo de auditoría aborta la transacción antes de enviar correo", async () => {
    mocks.audit.mockRejectedValue(new Error("Audit unavailable"));
    await expect(createLicense({ ...input, assignToEmail: "student@example.test" })).rejects.toThrow("Audit unavailable");
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("rechaza múltiples usuarios y fechas absolutas incompatibles", () => {
    expect(CreateLicenseInputSchema.safeParse({ ...input, maxActivations: 2 }).success).toBe(false);
    expect(CreateLicenseInputSchema.safeParse({ ...input, expiresAt: "2027-01-01" }).success).toBe(false);
  });
  it.each([1, 3, 6, 12, 120])("no permite emitir vigencias retiradas o no ofrecidas: %s", (validityMonths) => {
    expect(CreateLicenseInputSchema.safeParse({ ...input, validityMonths }).success).toBe(false);
  });
  it("el plan de dos meses se emite para una sola carrera sin elección anticipada", async () => {
    await createLicense({ ...input, validityMonths: 2 });
    expect(mocks.create.mock.calls[0]![0].data).toMatchObject({ validityMonths: 2, careerScope: "SINGLE_CAREER" });
  });
  it("reintenta una colisión de hash con otro folio, sin crear un evento huérfano", async () => {
    mocks.folio.mockReturnValueOnce(first).mockReturnValueOnce(second);
    mocks.create.mockRejectedValueOnce(duplicate());
    const result = await createLicense(input);
    expect(result.folio).toBe(second);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.event).toHaveBeenCalledTimes(1);
  });
  it("limita a cinco los reintentos por colisión", async () => {
    mocks.create.mockRejectedValue(duplicate());
    await expect(createLicense(input)).rejects.toThrow("folio único");
    expect(mocks.create).toHaveBeenCalledTimes(5);
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it("no reintenta errores de otras restricciones", async () => {
    mocks.create.mockRejectedValue(duplicate("id"));
    await expect(createLicense(input)).rejects.toThrow();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("valida configuración de correo antes de escribir la licencia", async () => {
    mocks.configured.mockImplementation(() => { throw new Error("Configuration missing"); });
    await expect(createLicense({ ...input, assignToEmail: "student@example.test" })).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("conserva el folio retornado si falla correo después del commit", async () => {
    mocks.email.mockRejectedValue(new Error("Delivery failed"));
    const result = await createLicense({ ...input, assignToEmail: "student@example.test" });
    expect(result).toMatchObject({ folio: first, emailSent: false });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
  it("confirma emailSent solo cuando el proveedor acepta el correo", async () => {
    mocks.email.mockResolvedValue({ id: "email" });
    expect((await createLicense({ ...input, assignToEmail: "student@example.test" })).emailSent)
      .toBe(true);
  });
});
