import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  transaction: vi.fn(),
  lockUser: vi.fn(),
  findUser: vi.fn(),
  revoke: vi.fn(),
  create: vi.fn(),
  findSession: vi.fn(),
  cookieSet: vi.fn(),
  cookieGet: vi.fn(),
}));
vi.mock("../src/db/client", () => ({
  db: {
    $transaction: mock.transaction,
    session: { findUnique: mock.findSession },
  },
}));
vi.mock("next/headers", () => ({ cookies: () => ({ set: mock.cookieSet, get: mock.cookieGet }) }));
import {
  createSession,
  getSessionUser,
  SESSION_COOKIE_NAME,
  SessionAuthenticationError,
} from "../src/lib/session";
import { hashToken } from "../src/lib/security/tokens";

const now = new Date("2026-09-10T12:00:00Z");
const activeUser = () => ({
  id: "user-1",
  status: "ACTIVO",
  deletedAt: null,
  roles: [{ role: { name: "ALUMNO" } }],
  license: {
    userId: "user-1",
    status: "ACTIVADA",
    startsAt: new Date("2026-08-01"),
    expiresAt: new Date("2027-01-01"),
  },
});
const tx = {
  $queryRaw: mock.lockUser,
  user: { findUnique: mock.findUser },
  session: { updateMany: mock.revoke, create: mock.create },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("NODE_ENV", "production");
  mock.transaction.mockImplementation(async (callback) => callback(tx));
  mock.lockUser.mockResolvedValue([{ id: "user-1" }]);
  mock.findUser.mockResolvedValue(activeUser());
  mock.create.mockImplementation(async ({ data }) => ({
    id: "session-1",
    ...data,
    revokedAt: null,
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("sesión serializada con recuperación de contraseña", () => {
  it("bloquea al usuario con el hash verificado y vuelve a leer roles/licencia dentro de la transacción", async () => {
    const result = await createSession("user-1", "verified-password-hash", "a".repeat(300));
    const [sql, id, expectedHash] = mock.lockUser.mock.calls[0]!;
    expect(sql.join("?")).toContain('"passwordHash" = ?');
    expect(sql.join("?")).toContain("\"status\" = 'ACTIVO'");
    expect(sql.join("?")).toContain('"deletedAt" IS NULL');
    expect(sql.join("?")).toContain("FOR UPDATE");
    expect([id, expectedHash]).toEqual(["user-1", "verified-password-hash"]);
    expect(mock.findUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      include: { roles: { include: { role: true } }, license: true },
    });
    expect(mock.revoke).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: now },
    });
    expect(mock.lockUser.mock.invocationCallOrder[0]).toBeLessThan(
      mock.findUser.mock.invocationCallOrder[0]!,
    );
    expect(mock.revoke.mock.invocationCallOrder[0]).toBeLessThan(
      mock.create.mock.invocationCallOrder[0]!,
    );
    expect(result.userAgent).toHaveLength(255);
    expect(result.expiresAt).toEqual(new Date(now.getTime() + 7 * 86400000));
    const [name, plainToken, options] = mock.cookieSet.mock.calls[0]!;
    expect(name).toBe(SESSION_COOKIE_NAME);
    expect(result.sessionTokenHash).toBe(hashToken(plainToken));
    expect(result.sessionTokenHash).not.toBe(plainToken);
    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });
  });

  it("rechaza un login cuyo hash quedó obsoleto sin revocar sesiones ni crear cookies", async () => {
    mock.lockUser.mockResolvedValue([]);
    await expect(createSession("user-1", "old-password-hash")).rejects.toBeInstanceOf(
      SessionAuthenticationError,
    );
    expect(mock.findUser).not.toHaveBeenCalled();
    expect(mock.revoke).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
    expect(mock.cookieSet).not.toHaveBeenCalled();
  });

  it("no permite omitir el hash verificado", async () => {
    await expect(createSession("user-1", "")).rejects.toBeInstanceOf(SessionAuthenticationError);
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...activeUser(), status: "SUSPENDIDO" },
    { ...activeUser(), deletedAt: now },
    { ...activeUser(), license: null },
    { ...activeUser(), license: { ...activeUser().license, expiresAt: now } },
    { ...activeUser(), license: { ...activeUser().license, status: "REVOCADA" } },
    { ...activeUser(), license: { ...activeUser().license, validityMonths: 6 } },
    { ...activeUser(), roles: [] },
  ])(
    "rechaza acceso que dejó de estar habilitado después de verificar la contraseña",
    async (user) => {
      mock.findUser.mockResolvedValue(user);
      await expect(createSession("user-1", "verified-password-hash")).rejects.toBeInstanceOf(
        SessionAuthenticationError,
      );
      expect(mock.revoke).not.toHaveBeenCalled();
      expect(mock.create).not.toHaveBeenCalled();
      expect(mock.cookieSet).not.toHaveBeenCalled();
    },
  );

  it("conserva la exención de licencia de personal autorizado", async () => {
    mock.findUser.mockResolvedValue({
      ...activeUser(),
      roles: [{ role: { name: "SUPER_ADMIN" } }],
      license: null,
    });
    await expect(createSession("user-1", "verified-password-hash")).resolves.toHaveProperty("id");
  });

  it("solo fija la cookie después de confirmar la transacción", async () => {
    mock.transaction.mockImplementation(async (callback) => {
      await callback(tx);
      expect(mock.cookieSet).not.toHaveBeenCalled();
      throw new Error("commit failed");
    });
    await expect(createSession("user-1", "verified-password-hash")).rejects.toThrow(
      "commit failed",
    );
    expect(mock.cookieSet).not.toHaveBeenCalled();
  });

  it("dos logins concurrentes serializados dejan una sola sesión activa", async () => {
    const sessions: { id: string; revokedAt: Date | null }[] = [];
    let queue = Promise.resolve();
    mock.transaction.mockImplementation((callback) => {
      const run = queue.then(() => callback(tx));
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    });
    mock.revoke.mockImplementation(async () => {
      sessions.forEach((session) => {
        session.revokedAt ??= now;
      });
    });
    mock.create.mockImplementation(async ({ data }) => {
      const session = { id: `session-${sessions.length + 1}`, revokedAt: null, ...data };
      sessions.push(session);
      return session;
    });
    await Promise.all([
      createSession("user-1", "verified-password-hash"),
      createSession("user-1", "verified-password-hash"),
    ]);
    expect(mock.lockUser).toHaveBeenCalledTimes(2);
    expect(sessions.filter((session) => !session.revokedAt)).toHaveLength(1);
    expect(sessions[0]!.revokedAt).toEqual(now);
    expect(sessions[1]!.revokedAt).toBeNull();
  });

  it("getSessionUser conserva el rechazo de licencia/sesión al vencimiento exacto", async () => {
    mock.cookieGet.mockReturnValue({ value: "token" });
    mock.findSession.mockResolvedValue({ revokedAt: null, expiresAt: now, user: activeUser() });
    expect(await getSessionUser()).toBeNull();
    mock.findSession.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date("2027-01-01"),
      user: { ...activeUser(), license: { ...activeUser().license, expiresAt: now } },
    });
    expect(await getSessionUser()).toBeNull();
  });
});
