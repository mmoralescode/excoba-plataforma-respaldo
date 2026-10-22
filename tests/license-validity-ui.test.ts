import { describe, expect, it } from "vitest";
import { formatLicenseDate, licenseExpiryLabel } from "../src/components/license-validity";

describe("Vigencia visible de las licencias", () => {
  it("no presenta como ilimitado un folio semestral pendiente", () => {
    expect(
      licenseExpiryLabel({ validityMonths: 6, startsAt: null, activatedAt: null, expiresAt: null }),
    ).toBe("Pendiente de activación");
  });
  it("muestra la fecha exacta guardada, sin calcular 180 días en la interfaz", () => {
    const expiresAt = new Date("2027-02-28T20:00:00.000Z");
    expect(licenseExpiryLabel({ validityMonths: 6, expiresAt })).toBe(formatLicenseDate(expiresAt));
    expect(licenseExpiryLabel({ validityMonths: null, expiresAt })).toBe(
      formatLicenseDate(expiresAt),
    );
  });
  it("distingue las licencias anteriores sin fecha de vencimiento", () => {
    expect(licenseExpiryLabel({ validityMonths: null, expiresAt: null })).toBe(
      "Sin vencimiento configurado (licencia anterior)",
    );
  });
  it("no promete acceso indefinido si falta el vencimiento de una licencia activada", () => {
    expect(
      licenseExpiryLabel({ validityMonths: 6, activatedAt: new Date(), expiresAt: null }),
    ).toBe("Fecha de vencimiento por confirmar");
  });
});
