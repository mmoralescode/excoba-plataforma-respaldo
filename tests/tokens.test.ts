import { describe, it, expect } from "vitest";
import { generateLicenseFolio, generateRandomToken, hashToken } from "@/lib/security/tokens";

describe("tokens y folios", () => {
  it("genera folios con el formato EXCOBA-XXXX-XXXX", () => {
    const folio = generateLicenseFolio();
    expect(folio).toMatch(/^EXCOBA-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("genera folios distintos en llamadas sucesivas", () => {
    const a = generateLicenseFolio();
    const b = generateLicenseFolio();
    expect(a).not.toBe(b);
  });

  it("el hash de un token es determinístico y no reversible a simple vista", () => {
    const token = generateRandomToken();
    const hash1 = hashToken(token);
    const hash2 = hashToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
  });
});
