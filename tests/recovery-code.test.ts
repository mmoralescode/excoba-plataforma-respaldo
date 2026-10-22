import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  user: vi.fn(),
  fresh: vi.fn(),
  lock: vi.fn(),
  update: vi.fn(),
  tokens: vi.fn(),
  sessions: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  verify: vi.fn(),
  hash: vi.fn(),
}));
vi.mock("../src/db/client", () => ({
  db: { user: { findUnique: m.user }, $transaction: m.transaction },
}));
vi.mock("../src/lib/security/password", () => ({ verifyPassword: m.verify, hashPassword: m.hash }));
import {
  generateRecoveryCode,
  isRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "../src/lib/security/recovery-code";
import { hashToken } from "../src/lib/security/tokens";
import {
  generateAccountRecoveryCode,
  getRecoveryCodeStatus,
  recoverPasswordWithCode,
  RecoveryCodeError,
  RecoveryCodeGenerationError,
  RecoverWithCodeSchema,
} from "../src/server/use-cases/recovery-code";
const now = new Date("2026-09-13T21:00:00Z");
// Public test fixture only, never used as a real account secret.
const code = "REC-0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ";
const account = () => ({
  id: "student",
  email: "student@example.test",
  passwordHash: "old-password-hash",
  status: "ACTIVO",
  deletedAt: null,
  recoveryCodeHash: hashRecoveryCode(code),
  recoveryCodeCreatedAt: now,
  recoveryCodeUsedAt: null as Date | null,
  roles: [{ role: { name: "ALUMNO" } }],
  license: { userId: "student", status: "ACTIVADA", startsAt: null, expiresAt: null },
});
const input = () => ({
  email: "student@example.test",
  code,
  newPassword: "new-password-123",
  confirmPassword: "new-password-123",
});
const tx = {
  $queryRaw: m.lock,
  user: { findUnique: m.fresh, updateMany: m.update },
  passwordResetToken: { updateMany: m.tokens },
  session: { updateMany: m.sessions },
  auditLog: { create: m.audit },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  m.user.mockResolvedValue(account());
  m.fresh.mockResolvedValue(account());
  m.lock.mockResolvedValue([{ id: "student", expiresAt: new Date(now.getTime() + 60000) }]);
  m.update.mockResolvedValue({ count: 1 });
  m.verify.mockResolvedValue(true);
  m.hash.mockResolvedValue("new-password-hash");
  m.transaction.mockImplementation(async (callback) => callback(tx));
});
afterEach(() => vi.useRealTimers());

describe("Código secreto independiente del folio", () => {
  it("genera 32 símbolos uniformes, formato agrupado y muestras distintas", () => {
    const generated = Array.from({ length: 200 }, generateRecoveryCode);
    expect(new Set(generated).size).toBe(200);
    for (const value of generated) {
      expect(value).toMatch(
        /^REC-(?:[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-){7}[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/,
      );
      expect(isRecoveryCode(value)).toBe(true);
      expect(normalizeRecoveryCode(value)).toHaveLength(35);
    }
  });
  it("acepta separadores/caso, pero no folios, caracteres extra ni truncamientos", () => {
    expect(hashRecoveryCode("  " + code.toLowerCase().replaceAll("-", " ") + "  ")).toBe(
      hashRecoveryCode(code),
    );
    expect(hashRecoveryCode(code)).not.toBe(hashToken(normalizeRecoveryCode(code)));
    for (const invalid of [
      code.slice(0, -1),
      code + "A",
      code + "!",
      "EXCOBA-AAAA-BBBB-CCCC-DDDD",
      code.replace("WXYZ", "OOOO"),
    ])
      expect(isRecoveryCode(invalid)).toBe(false);
  });
  it("no devuelve secretos al consultar disponibilidad", async () => {
    expect(await getRecoveryCodeStatus("student")).toEqual({ available: true, createdAt: now });
    m.user.mockResolvedValue({ ...account(), recoveryCodeUsedAt: now });
    expect((await getRecoveryCodeStatus("student")).available).toBe(false);
    m.user.mockResolvedValue({ ...account(), recoveryCodeHash: null });
    expect((await getRecoveryCodeStatus("student")).available).toBe(false);
  });
});

describe("Emisión y rotación con contraseña actual", () => {
  it("bloquea User y Session, guarda solo hash y no altera password/licencia", async () => {
    const result = await generateAccountRecoveryCode("student", "session-digest", {
      currentPassword: "current-password",
    });
    expect(isRecoveryCode(result.code)).toBe(true);
    expect(m.verify).toHaveBeenCalledWith("old-password-hash", "current-password");
    expect(m.lock.mock.calls[0]![0].join(" ")).toContain('FROM "User"');
    expect(m.lock.mock.calls[1]![0].join(" ")).toContain('FROM "Session"');
    expect(m.lock.mock.calls[1]![0].join(" ")).toContain('"revokedAt" IS NULL');
    expect(m.lock.mock.calls[1]![0].join(" ")).toContain('"expiresAt" >');
    expect(m.lock.mock.calls[1]).toContain("session-digest");
    const change = m.update.mock.calls[0]![0];
    expect(change.where.recoveryCodeHash).toBe(hashRecoveryCode(code));
    expect(change.data).toEqual({
      recoveryCodeHash: hashRecoveryCode(result.code),
      recoveryCodeCreatedAt: now,
      recoveryCodeUsedAt: null,
    });
    expect(JSON.stringify(m.update.mock.calls)).not.toContain(result.code);
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain(result.code);
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain(hashRecoveryCode(result.code));
    expect(m.tokens).not.toHaveBeenCalled();
    expect(m.sessions).not.toHaveBeenCalled();
  });
  it("exige contraseña correcta antes de una transacción", async () => {
    m.verify.mockResolvedValue(false);
    await expect(
      generateAccountRecoveryCode("student", "session", { currentPassword: "wrong" }),
    ).rejects.toBeInstanceOf(RecoveryCodeGenerationError);
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("rechaza una contraseña reemplazada, una sesión revocada o una licencia ya vencida", async () => {
    m.lock.mockResolvedValueOnce([]);
    await expect(
      generateAccountRecoveryCode("student", "session", { currentPassword: "correct" }),
    ).rejects.toBeInstanceOf(RecoveryCodeGenerationError);
    m.lock.mockResolvedValueOnce([{ id: "student" }]).mockResolvedValueOnce([]);
    await expect(
      generateAccountRecoveryCode("student", "session", { currentPassword: "correct" }),
    ).rejects.toBeInstanceOf(RecoveryCodeGenerationError);
    m.fresh.mockResolvedValue({ ...account(), license: { ...account().license, expiresAt: now } });
    await expect(
      generateAccountRecoveryCode("student", "session", { currentPassword: "correct" }),
    ).rejects.toBeInstanceOf(RecoveryCodeGenerationError);
    expect(m.update).not.toHaveBeenCalled();
  });
  it.each(["session", "license"])(
    "rechaza %s vencida mientras esperaba el bloqueo",
    async (kind) => {
      const expiresAt = new Date(now.getTime() + 1000);
      if (kind === "license")
        m.fresh.mockResolvedValue({ ...account(), license: { ...account().license, expiresAt } });
      m.lock.mockResolvedValueOnce([{ id: "student" }]).mockImplementationOnce(async () => {
        vi.setSystemTime(new Date(now.getTime() + 2000));
        return [
          {
            id: "session",
            expiresAt: kind === "session" ? expiresAt : new Date(now.getTime() + 60000),
          },
        ];
      });
      await expect(
        generateAccountRecoveryCode("student", "session", { currentPassword: "correct" }),
      ).rejects.toBeInstanceOf(RecoveryCodeGenerationError);
      expect(m.update).not.toHaveBeenCalled();
    },
  );
  it("una rotación concurrente no sobrescribe silenciosamente el primer código", async () => {
    let digest = hashRecoveryCode(code);
    m.update.mockImplementation(async ({ where, data }) => {
      if (where.recoveryCodeHash !== digest) return { count: 0 };
      digest = data.recoveryCodeHash;
      return { count: 1 };
    });
    const outcomes = await Promise.allSettled(
      [1, 2].map(() =>
        generateAccountRecoveryCode("student", "session", { currentPassword: "correct" }),
      ),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(m.audit).toHaveBeenCalledOnce();
  });
});

describe("Recuperación atómica de un solo uso", () => {
  it("normaliza correo, consume código y revoca sesiones/tokens sin escribir licencia ni roles", async () => {
    await recoverPasswordWithCode({ ...input(), email: " Student@Example.Test " });
    expect(m.user).toHaveBeenCalledWith({ where: { email: "student@example.test" } });
    expect(m.update).toHaveBeenCalledWith({
      where: {
        id: "student",
        email: "student@example.test",
        status: "ACTIVO",
        deletedAt: null,
        passwordHash: "old-password-hash",
        recoveryCodeHash: hashRecoveryCode(code),
        recoveryCodeUsedAt: null,
      },
      data: { passwordHash: "new-password-hash", recoveryCodeUsedAt: now },
    });
    expect(m.tokens).toHaveBeenCalledWith({
      where: { userId: "student", usedAt: null },
      data: { usedAt: now },
    });
    expect(m.sessions).toHaveBeenCalledWith({
      where: { userId: "student", revokedAt: null },
      data: { revokedAt: now },
    });
    expect(JSON.stringify(m.audit.mock.calls)).not.toContain(code);
  });
  it.each([
    null,
    { ...account(), recoveryCodeHash: null },
    { ...account(), recoveryCodeUsedAt: now },
    { ...account(), status: "SUSPENDIDO" },
    { ...account(), deletedAt: now },
    { ...account(), recoveryCodeHash: hashRecoveryCode(generateRecoveryCode()) },
  ])("mismo error para cuenta ausente, ajena, usada o deshabilitada", async (user) => {
    m.user.mockResolvedValue(user);
    await expect(recoverPasswordWithCode(input())).rejects.toThrow(new RecoveryCodeError().message);
    expect(m.hash).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("no acepta un folio de activación como código", async () => {
    await expect(
      recoverPasswordWithCode({ ...input(), code: "EXCOBA-AAAA-BBBB-CCCC-DDDD" }),
    ).rejects.toBeInstanceOf(RecoveryCodeError);
    expect(m.user).not.toHaveBeenCalled();
  });
  it("exige confirmación y longitud de contraseña antes de consultar la cuenta", async () => {
    for (const bad of [
      { ...input(), confirmPassword: "other-password" },
      { ...input(), newPassword: "short" },
      { ...input(), newPassword: "a".repeat(129) },
      { ...input(), userId: "other" },
    ]) {
      expect(RecoverWithCodeSchema.safeParse(bad).success).toBe(false);
    }
    expect(m.user).not.toHaveBeenCalled();
  });
  it("dos entregas concurrentes no pueden consumir dos veces el mismo código", async () => {
    let used = false;
    m.update.mockImplementation(async ({ where }) => {
      expect(where.recoveryCodeUsedAt).toBeNull();
      if (used) return { count: 0 };
      used = true;
      return { count: 1 };
    });
    const outcomes = await Promise.allSettled([
      recoverPasswordWithCode(input()),
      recoverPasswordWithCode(input()),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(m.sessions).toHaveBeenCalledOnce();
    expect(m.audit).toHaveBeenCalledOnce();
  });
  it("el CAS rechaza un código leído antes de rotación o cambio de contraseña", async () => {
    m.update.mockResolvedValue({ count: 0 });
    await expect(recoverPasswordWithCode(input())).rejects.toBeInstanceOf(RecoveryCodeError);
    expect(m.tokens).not.toHaveBeenCalled();
    expect(m.sessions).not.toHaveBeenCalled();
  });
  it("la licencia expirada no impide cambiar contraseña, ni se reactiva", async () => {
    m.user.mockResolvedValue({
      ...account(),
      license: { ...account().license, status: "EXPIRADA", expiresAt: now },
    });
    await expect(recoverPasswordWithCode(input())).resolves.toHaveProperty("message");
    expect(Object.keys(m.update.mock.calls[0]![0].data)).toEqual([
      "passwordHash",
      "recoveryCodeUsedAt",
    ]);
  });
  it("la transacción revierte consumo y contraseña si falla revocación o auditoría", async () => {
    for (const failing of [m.sessions, m.audit]) {
      const state = { password: "old-password-hash", used: false, revoked: false };
      m.transaction.mockImplementation(async (callback) => {
        const snapshot = { ...state };
        try {
          return await callback(tx);
        } catch (error) {
          Object.assign(state, snapshot);
          throw error;
        }
      });
      m.update.mockImplementation(async () => {
        state.password = "new-password-hash";
        state.used = true;
        return { count: 1 };
      });
      m.sessions.mockImplementation(async () => {
        state.revoked = true;
        return { count: 1 };
      });
      m.audit.mockResolvedValue({});
      failing.mockRejectedValueOnce(new Error("write failed"));
      await expect(recoverPasswordWithCode(input())).rejects.toThrow("write failed");
      expect(state).toEqual({ password: "old-password-hash", used: false, revoked: false });
    }
  });
});
