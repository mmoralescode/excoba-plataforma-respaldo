import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ findUser: vi.fn(), verify: vi.fn(), session: vi.fn() }));
vi.mock("../src/db/client", () => ({ db: { user: { findUnique: mock.findUser } } }));
vi.mock("../src/lib/security/password", () => ({ verifyPassword: mock.verify }));
vi.mock("../src/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/session")>()),
  createSession: mock.session,
}));
import { login, LoginError } from "../src/server/use-cases/login";
import { SessionAuthenticationError } from "../src/lib/session";

const user = () => ({
  id: "user-1",
  email: "student@example.com",
  passwordHash: "verified-password-hash",
  status: "ACTIVO",
  deletedAt: null,
  roles: [{ role: { name: "ALUMNO" } }],
  license: { userId: "user-1", status: "ACTIVADA", startsAt: null, expiresAt: null },
});
beforeEach(() => {
  vi.resetAllMocks();
  mock.findUser.mockResolvedValue(user());
  mock.verify.mockResolvedValue(true);
  mock.session.mockResolvedValue({ id: "session-1" });
});

describe("login y revalidación transaccional", () => {
  it("entrega a createSession exactamente el hash cuya contraseña verificó", async () => {
    expect(
      await login({ email: " Student@Example.com ", password: "password-123" }, "browser"),
    ).toEqual({ user: user(), session: { id: "session-1" } });
    expect(mock.findUser.mock.calls[0]![0].where).toEqual({ email: "student@example.com" });
    expect(mock.verify).toHaveBeenCalledWith("verified-password-hash", "password-123");
    expect(mock.session).toHaveBeenCalledWith("user-1", "verified-password-hash", "browser");
  });

  it("traduce el rechazo de sesión por reset concurrente a LoginError genérico", async () => {
    mock.session.mockRejectedValue(new SessionAuthenticationError());
    await expect(
      login({ email: "student@example.com", password: "password-123" }),
    ).rejects.toMatchObject({ message: "Correo o contraseña incorrectos." });
    await expect(
      login({ email: "student@example.com", password: "password-123" }),
    ).rejects.toBeInstanceOf(LoginError);
  });

  it("no convierte un fallo de infraestructura en una autenticación exitosa", async () => {
    const error = new Error("transaction failed");
    mock.session.mockRejectedValue(error);
    await expect(login({ email: "student@example.com", password: "password-123" })).rejects.toBe(
      error,
    );
  });

  it("no crea sesiones para contraseña incorrecta, inexistencia o cuenta deshabilitada", async () => {
    mock.verify.mockResolvedValue(false);
    await expect(login({ email: "student@example.com", password: "wrong" })).rejects.toBeInstanceOf(
      LoginError,
    );
    mock.findUser.mockResolvedValue(null);
    await expect(login({ email: "absent@example.com", password: "wrong" })).rejects.toBeInstanceOf(
      LoginError,
    );
    expect(mock.verify).toHaveBeenCalledTimes(2);
    mock.verify.mockResolvedValue(true);
    mock.findUser.mockResolvedValue({ ...user(), status: "SUSPENDIDO" });
    await expect(
      login({ email: "student@example.com", password: "password-123" }),
    ).rejects.toBeInstanceOf(LoginError);
    expect(mock.session).not.toHaveBeenCalled();
  });

  it("rechaza contraseñas excesivas antes de consultar o hashear", async () => {
    await expect(
      login({ email: "student@example.com", password: "p".repeat(129) }),
    ).rejects.toThrow();
    expect(mock.findUser).not.toHaveBeenCalled();
    expect(mock.verify).not.toHaveBeenCalled();
    expect(mock.session).not.toHaveBeenCalled();
  });
});
