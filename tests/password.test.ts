import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/security/password";

describe("password hashing", () => {
  it("verifica correctamente una contraseña válida", async () => {
    const hash = await hashPassword("MiContraseñaSegura123!");
    expect(await verifyPassword(hash, "MiContraseñaSegura123!")).toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const hash = await hashPassword("MiContraseñaSegura123!");
    expect(await verifyPassword(hash, "otra-contraseña")).toBe(false);
  });

  it("nunca guarda la contraseña en texto plano dentro del hash", async () => {
    const hash = await hashPassword("MiContraseñaSegura123!");
    expect(hash).not.toContain("MiContraseñaSegura123!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("no lanza excepción ante un hash corrupto (se trata como inválido)", async () => {
    await expect(verifyPassword("hash-corrupto", "cualquier-cosa")).resolves.toBe(false);
  });
});
