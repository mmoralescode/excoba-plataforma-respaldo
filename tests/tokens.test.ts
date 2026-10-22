import { describe, it, expect } from "vitest";
import { generateLicenseFolio, generateRandomToken, hashToken } from "@/lib/security/tokens";

describe("tokens y folios", () => {
  it("genera folios de cuatro grupos sin caracteres ambiguos", () => {
    const folio = generateLicenseFolio();
    expect(folio).toMatch(/^EXCOBA(?:-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}){4}$/);
    expect(folio.length).toBe(26);
  });

  it("genera folios distintos en llamadas sucesivas", () => {
    const folios = new Set(Array.from({ length: 1000 }, () => generateLicenseFolio()));
    expect(folios.size).toBe(1000);
  });

  it("el hash de un token es determinístico y no reversible a simple vista", () => {
    const token = generateRandomToken();
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
  });
});
