import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  user: vi.fn(),
  existing: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("../src/db/client", () => ({ db: { $transaction: m.transaction } }));
import {
  submitFeedback,
  reviewFeedback,
  SubmitFeedbackSchema,
  FeedbackConflictError,
  FeedbackNotFoundError,
  FeedbackRateLimitError,
} from "../src/server/use-cases/feedback";
import { ForbiddenError, UnauthorizedError } from "../src/lib/authorization";
const now = new Date("2026-09-14T18:00:00Z");
const id = "11111111-1111-4111-8111-111111111111";
const submissionId = "22222222-2222-4222-8222-222222222222";
const message = "En el simulador no se muestra la siguiente pregunta.";
const input = { category: "ERROR" as const, section: "SIMULADOR" as const, message, submissionId };
const student = () => ({
  id: "student",
  status: "ACTIVO",
  deletedAt: null,
  roles: [{ role: { name: "ALUMNO" } }],
  license: { userId: "student", status: "ACTIVADA", startsAt: null, expiresAt: null },
});
const tx = {
  $queryRaw: m.lock,
  user: { findUnique: m.user },
  feedback: { findUnique: m.existing, count: m.count, create: m.create, update: m.update },
  auditLog: { create: m.audit },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  m.transaction.mockImplementation(async (callback) => callback(tx));
  m.lock.mockResolvedValue([{ id, reviewedAt: null }]);
  m.user.mockResolvedValue(student());
  m.existing.mockResolvedValue(null);
  m.count.mockResolvedValue(0);
  m.create.mockResolvedValue({ id });
  m.update.mockResolvedValue({ id, reviewedAt: now });
});
afterEach(() => vi.useRealTimers());

describe("Buzón vinculado a cuenta con cuota persistente", () => {
  it("guarda el mensaje validado dentro de transacción, con identidad del servidor", async () => {
    const result = await submitFeedback("student", { ...input, message: "  " + message + "  " });
    expect(m.transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000 });
    expect(m.lock.mock.calls[0]![0].join(" ")).toContain('FROM "User"');
    expect(m.lock.mock.calls[0]![0].join(" ")).toContain("FOR UPDATE");
    expect(m.lock.mock.calls[0]).toContain("student");
    expect(m.lock.mock.invocationCallOrder[0]).toBeLessThan(m.count.mock.invocationCallOrder[0]!);
    expect(m.count).toHaveBeenCalledWith({
      where: { userId: "student", createdAt: { gte: new Date(now.getTime() - 3600000) } },
    });
    expect(m.create).toHaveBeenCalledWith({
      data: { ...input, userId: "student", createdAt: now },
      select: { id: true },
    });
    expect(result).toEqual({ id, message: expect.stringContaining("Recibimos") });
    expect(result.message).not.toContain(message);
    expect(m.audit).toHaveBeenCalledWith({
      data: {
        actorId: "student",
        action: "FEEDBACK_SUBMITTED",
        entity: "Feedback",
        entityId: id,
        metadata: { category: "ERROR", section: "SIMULADOR" },
      },
    });
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain(message);
  });
  it("un reintento idéntico devuelve la recepción sin duplicar ni gastar cuota", async () => {
    m.existing.mockResolvedValue({ id, ...input });
    m.count.mockResolvedValue(5);
    expect(await submitFeedback("student", input)).toMatchObject({ id });
    expect(m.existing).toHaveBeenCalledWith({
      where: { userId_submissionId: { userId: "student", submissionId } },
      select: { id: true, category: true, section: true, message: true },
    });
    expect(m.count).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it.each([
    { message: "Otro mensaje completamente diferente." },
    { category: "SUGERENCIA" },
    { section: "GENERAL" },
  ])("rechaza reutilizar el mismo envío para otro contenido", async (change) => {
    m.existing.mockResolvedValue({ id, ...input, ...change });
    await expect(submitFeedback("student", input)).rejects.toBeInstanceOf(FeedbackConflictError);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("aísla la idempotencia de dos alumnos que usen el mismo UUID", async () => {
    m.user.mockResolvedValue({
      ...student(),
      id: "other",
      license: { ...student().license, userId: "other" },
    });
    await submitFeedback("other", input);
    expect(m.existing.mock.calls[0]![0].where.userId_submissionId).toEqual({
      userId: "other",
      submissionId,
    });
    expect(m.create.mock.calls[0]![0].data.userId).toBe("other");
  });
  it("permite el quinto mensaje y rechaza el sexto sin escrituras", async () => {
    m.count.mockResolvedValueOnce(4).mockResolvedValueOnce(5);
    await expect(submitFeedback("student", input)).resolves.toHaveProperty("id");
    await expect(
      submitFeedback("student", { ...input, submissionId: "33333333-3333-4333-8333-333333333333" }),
    ).rejects.toBeInstanceOf(FeedbackRateLimitError);
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.audit).toHaveBeenCalledOnce();
  });
  it.each([
    null,
    { ...student(), status: "SUSPENDIDO" },
    { ...student(), deletedAt: now },
    { ...student(), license: null },
    { ...student(), license: { ...student().license, expiresAt: now } },
  ])("revalida cuenta y vigencia antes de persistir", async (user) => {
    m.user.mockResolvedValue(user);
    await expect(submitFeedback("student", input)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.existing).not.toHaveBeenCalled();
  });
  it("rechaza un usuario inexistente antes de leer datos", async () => {
    m.lock.mockResolvedValue([]);
    await expect(submitFeedback("student", input)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(m.user).not.toHaveBeenCalled();
  });
  it("valida antes de iniciar la transacción y no admite campos de identidad", async () => {
    await expect(submitFeedback("student", { ...input, message: "   " })).rejects.toThrow();
    expect(SubmitFeedbackSchema.safeParse({ ...input, userId: "other" }).success).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("falla toda la transacción si no puede registrar la auditoría", async () => {
    m.audit.mockRejectedValue(new Error("write failed"));
    await expect(submitFeedback("student", input)).rejects.toThrow("write failed");
    expect(m.transaction).toHaveBeenCalledOnce();
  });
});

describe("Acuse administrativo de revisión", () => {
  it("autoriza a una cuenta con permiso limitado sin modificar sus roles", async () => {
    m.user.mockResolvedValue({ ...student(), canReviewFeedback: true });
    await expect(reviewFeedback("student", id, true)).resolves.toEqual({ id, reviewedAt: now });
    expect(m.audit.mock.calls[0]![0].data.actorId).toBe("student");
    expect(m.update.mock.calls[0]![0].data).toEqual({ reviewedAt: now });
  });
  it("rechaza el permiso limitado revocado mientras esperaba el bloqueo", async () => {
    m.user
      .mockResolvedValueOnce({ ...student(), canReviewFeedback: true })
      .mockResolvedValueOnce({ ...student(), canReviewFeedback: false });
    await expect(reviewFeedback("student", id, true)).rejects.toBeInstanceOf(ForbiddenError);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  beforeEach(() =>
    m.user.mockResolvedValue({ ...student(), roles: [{ role: { name: "SOPORTE" } }] }),
  );
  it("marca revisado y registra actor sin copiar el texto del buzón", async () => {
    expect(await reviewFeedback("staff", id, true)).toEqual({ id, reviewedAt: now });
    expect(m.lock.mock.calls[0]![0].join(" ")).toContain('FROM "Feedback"');
    expect(m.update).toHaveBeenCalledWith({
      where: { id },
      data: { reviewedAt: now },
      select: { id: true, reviewedAt: true },
    });
    expect(m.audit).toHaveBeenCalledWith({
      data: {
        actorId: "staff",
        action: "FEEDBACK_REVIEW_CHANGED",
        entity: "Feedback",
        entityId: id,
        metadata: { reviewed: true },
      },
    });
  });
  it("permite devolver un mensaje a pendiente", async () => {
    m.lock.mockResolvedValue([{ id, reviewedAt: now }]);
    m.update.mockResolvedValue({ id, reviewedAt: null });
    expect(await reviewFeedback("staff", id, false)).toEqual({ id, reviewedAt: null });
    expect(m.update.mock.calls[0]![0].data).toEqual({ reviewedAt: null });
  });
  it("repetir el mismo estado no reescribe la fecha ni duplica auditoría", async () => {
    const before = new Date(now.getTime() - 3600000);
    m.lock.mockResolvedValue([{ id, reviewedAt: before }]);
    expect(await reviewFeedback("staff", id, true)).toEqual({ id, reviewedAt: before });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });
  it.each(["ALUMNO", "ANALISTA", "EDITOR_ACADEMICO"])(
    "niega revisión a %s aunque tenga acceso a la plataforma",
    async (role) => {
      m.user.mockResolvedValue({ ...student(), roles: [{ role: { name: role } }] });
      await expect(reviewFeedback("student", id, true)).rejects.toBeInstanceOf(ForbiddenError);
      expect(m.lock).not.toHaveBeenCalled();
      expect(m.update).not.toHaveBeenCalled();
    },
  );
  it("rechaza sesión deshabilitada y mensaje inexistente", async () => {
    m.user.mockResolvedValueOnce(null);
    await expect(reviewFeedback("staff", id, true)).rejects.toBeInstanceOf(UnauthorizedError);
    m.lock.mockResolvedValue([]);
    await expect(reviewFeedback("staff", id, true)).rejects.toBeInstanceOf(FeedbackNotFoundError);
    expect(m.update).not.toHaveBeenCalled();
  });
  it("vuelve a comprobar permisos después de esperar el bloqueo del mensaje", async () => {
    m.user
      .mockResolvedValueOnce({ ...student(), roles: [{ role: { name: "SOPORTE" } }] })
      .mockResolvedValueOnce(student());
    await expect(reviewFeedback("student", id, true)).rejects.toBeInstanceOf(ForbiddenError);
    expect(m.lock).toHaveBeenCalledOnce();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("valida UUID y estado antes de consultar la base", async () => {
    await expect(reviewFeedback("staff", "not-an-id", true)).rejects.toThrow();
    await expect(reviewFeedback("staff", id, "true" as unknown as boolean)).rejects.toThrow();
    expect(m.transaction).not.toHaveBeenCalled();
  });
});
