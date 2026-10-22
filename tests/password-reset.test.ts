import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  findUser: vi.fn(),
  findToken: vi.fn(),
  createToken: vi.fn(),
  countTokens: vi.fn(),
  updateToken: vi.fn(),
  updateUser: vi.fn(),
  revokeSessions: vi.fn(),
  lockUser: vi.fn(),
  transaction: vi.fn(),
  configured: vi.fn(),
  send: vi.fn(),
  hashPassword: vi.fn(),
}));
vi.mock("../src/db/client", () => ({
  db: {
    user: { findUnique: mock.findUser },
    passwordResetToken: { findUnique: mock.findToken, updateMany: mock.updateToken },
    $transaction: mock.transaction,
  },
}));
vi.mock("../src/lib/security/password", () => ({ hashPassword: mock.hashPassword }));
vi.mock("../src/lib/email/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/email/mailer")>()),
  assertEmailConfigured: mock.configured,
  sendPasswordResetEmail: mock.send,
}));
import {
  PASSWORD_RESET_MESSAGE,
  RESET_TOKEN_TTL_MS,
  requestPasswordReset,
  resetPassword,
  RequestPasswordResetSchema,
  ResetPasswordSchema,
  ResetPasswordError,
} from "../src/server/use-cases/password-reset";
import { EmailConfigurationError, EmailDeliveryError } from "../src/lib/email/mailer";
import { hashToken } from "../src/lib/security/tokens";

const token = "a".repeat(43);
const now = new Date("2026-09-10T12:00:00Z");
const user = { id: "user-1", email: "student@example.com", status: "ACTIVO", deletedAt: null };
const storedToken = () => ({
  id: "reset-1",
  userId: user.id,
  tokenHash: hashToken(token),
  usedAt: null,
  expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
  user: { passwordHash: "old-hash", status: "ACTIVO", deletedAt: null },
});
const tx = {
  $queryRaw: mock.lockUser,
  user: { updateMany: mock.updateUser },
  passwordResetToken: {
    count: mock.countTokens,
    create: mock.createToken,
    updateMany: mock.updateToken,
  },
  session: { updateMany: mock.revokeSessions },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock.transaction.mockImplementation(async (callback) => callback(tx));
  mock.findUser.mockResolvedValue(user);
  mock.findToken.mockResolvedValue(storedToken());
  mock.lockUser.mockResolvedValue([{ id: user.id }]);
  mock.countTokens.mockResolvedValue(0);
  mock.createToken.mockResolvedValue({ id: "reset-1" });
  mock.updateToken.mockResolvedValue({ count: 1 });
  mock.updateUser.mockResolvedValue({ count: 1 });
  mock.hashPassword.mockResolvedValue("new-hash");
  mock.send.mockResolvedValue({ id: "accepted" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("solicitud sin enumeración", () => {
  it("normaliza correo y almacena solo hash con 30 minutos de validez", async () => {
    expect(await requestPasswordReset({ email: " Student@Example.com " })).toEqual({
      message: PASSWORD_RESET_MESSAGE,
    });
    expect(mock.findUser.mock.calls[0]![0].where).toEqual({ email: user.email });
    const plain = mock.send.mock.calls[0]![1];
    const data = mock.createToken.mock.calls[0]![0].data;
    expect(plain).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data).toEqual({
      userId: user.id,
      tokenHash: hashToken(plain),
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
    });
    expect(JSON.stringify(data)).not.toContain(plain);
  });

  it.each([null, { ...user, status: "SUSPENDIDO" }, { ...user, deletedAt: now }])(
    "responde igual para usuario inexistente, suspendido o eliminado",
    async (account) => {
      mock.findUser.mockResolvedValue(account);
      expect(await requestPasswordReset({ email: user.email })).toEqual({
        message: PASSWORD_RESET_MESSAGE,
      });
      expect(mock.createToken).not.toHaveBeenCalled();
      expect(mock.send).not.toHaveBeenCalled();
    },
  );

  it("valida configuración antes de consultar cualquier cuenta", async () => {
    mock.configured.mockImplementation(() => {
      throw new EmailConfigurationError("API_KEY");
    });
    await expect(requestPasswordReset({ email: user.email })).rejects.toBeInstanceOf(
      EmailConfigurationError,
    );
    expect(mock.findUser).not.toHaveBeenCalled();
  });

  it("respeta cuota persistente por cuenta y vuelve a verificar que siga activa bajo lock", async () => {
    mock.countTokens.mockResolvedValue(3);
    expect(await requestPasswordReset({ email: user.email })).toEqual({
      message: PASSWORD_RESET_MESSAGE,
    });
    expect(mock.createToken).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.countTokens.mock.calls[0]![0].where.createdAt.gt).toEqual(
      new Date(now.getTime() - 3600000),
    );
    mock.lockUser.mockResolvedValue([]);
    await requestPasswordReset({ email: user.email });
    expect(mock.createToken).not.toHaveBeenCalled();
  });

  it("rechazo del proveedor revoca el enlace y mantiene mensaje genérico sin logs sensibles", async () => {
    mock.send.mockRejectedValue(new EmailDeliveryError("REJECTED", 403));
    expect(await requestPasswordReset({ email: user.email })).toEqual({
      message: PASSWORD_RESET_MESSAGE,
    });
    expect(mock.updateToken).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String), usedAt: null },
      data: { usedAt: now },
    });
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).toContain("REJECTED");
    expect(logs).not.toContain(user.email);
    expect(logs).not.toContain(mock.send.mock.calls[0]![1]);
  });

  it("un error específico de creación/invalidation no revela existencia", async () => {
    mock.createToken.mockRejectedValue(new Error("private@example.com SECRET"));
    expect(await requestPasswordReset({ email: user.email })).toEqual({
      message: PASSWORD_RESET_MESSAGE,
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("SECRET");
  });
});

describe("confirmación atómica y de un solo uso", () => {
  it("actualiza password, consume token, invalida otros enlaces y revoca todas las sesiones dentro de la transacción", async () => {
    await resetPassword({ token, newPassword: "new-password-123" });
    expect(mock.updateUser).toHaveBeenCalledWith({
      where: { id: user.id, status: "ACTIVO", deletedAt: null, passwordHash: "old-hash" },
      data: { passwordHash: "new-hash", recoveryCodeUsedAt: now },
    });
    expect(mock.updateToken).toHaveBeenNthCalledWith(1, {
      where: { id: "reset-1", tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    expect(mock.updateToken).toHaveBeenNthCalledWith(2, {
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });
    expect(mock.revokeSessions).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
    expect(mock.transaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    null,
    { ...storedToken(), usedAt: now },
    { ...storedToken(), expiresAt: now },
    { ...storedToken(), user: { ...storedToken().user, status: "SUSPENDIDO" } },
    { ...storedToken(), user: { ...storedToken().user, deletedAt: now } },
  ])(
    "rechaza ausente/usado/expiración exacta o cuenta deshabilitada antes de hashear",
    async (record) => {
      mock.findToken.mockResolvedValue(record);
      await expect(
        resetPassword({ token, newPassword: "new-password-123" }),
      ).rejects.toBeInstanceOf(ResetPasswordError);
      expect(mock.hashPassword).not.toHaveBeenCalled();
      expect(mock.transaction).not.toHaveBeenCalled();
    },
  );

  it("un CAS de token perdido aborta la transacción y no revoca parcialmente", async () => {
    mock.updateToken.mockResolvedValueOnce({ count: 0 });
    await expect(resetPassword({ token, newPassword: "new-password-123" })).rejects.toBeInstanceOf(
      ResetPasswordError,
    );
    expect(mock.revokeSessions).not.toHaveBeenCalled();
    expect(mock.updateToken).toHaveBeenCalledTimes(1);
  });

  it("dos solicitudes concurrentes basadas en el mismo password previo solo tienen un ganador", async () => {
    let password = "old-hash";
    mock.updateUser.mockImplementation(async ({ where, data }) => {
      if (where.passwordHash !== password) return { count: 0 };
      password = data.passwordHash;
      return { count: 1 };
    });
    const result = await Promise.allSettled([
      resetPassword({ token, newPassword: "new-password-123" }),
      resetPassword({ token: "b".repeat(43), newPassword: "other-password-123" }),
    ]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(mock.revokeSessions).toHaveBeenCalledTimes(1);
  });

  it("limita email, token y password antes de consumir recursos de hashing", () => {
    expect(
      RequestPasswordResetSchema.safeParse({ email: `${"a".repeat(255)}@example.com` }).success,
    ).toBe(false);
    for (const newPassword of ["short", "p".repeat(129)]) {
      expect(ResetPasswordSchema.safeParse({ token, newPassword }).success).toBe(false);
    }
    expect(
      ResetPasswordSchema.safeParse({ token: token + "a", newPassword: "new-password-123" })
        .success,
    ).toBe(false);
  });
});
