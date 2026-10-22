import { describe, expect, it } from "vitest";
import {
  addCalendarMonths, isLicenseAvailableForActivation, licenseActivationDates,
  type ActivationLicense,
} from "@/lib/license-validity";

const now = new Date("2026-08-31T15:04:05.123Z");
const fresh: ActivationLicense = {
  userId: null, status: "CREADA", activatedAt: null,
  startsAt: null, expiresAt: null, validityMonths: 4,
};

describe("Vigencia de licencias desde activación", () => {
  it.each([
    ["2026-08-31T15:04:05.123Z", "2027-02-28T15:04:05.123Z"],
    ["2023-08-31T15:04:05.123Z", "2024-02-29T15:04:05.123Z"],
    ["2024-02-29T00:00:00.000Z", "2024-08-29T00:00:00.000Z"],
    ["2026-09-10T12:00:00.000Z", "2027-03-10T12:00:00.000Z"],
  ])("agrega seis meses naturales: %s", (start, end) => {
    const date = new Date(start);
    expect(addCalendarMonths(date, 6).toISOString()).toBe(end);
    expect(date.toISOString()).toBe(start);
  });
  it("inicia el plazo al reclamar, manteniendo la hora", () => {
    expect(licenseActivationDates(fresh, now)).toEqual({
      activatedAt: now, startsAt: now, expiresAt: new Date("2026-12-31T15:04:05.123Z"),
    });
  });
  it("no cambia fechas ni inventa vencimiento en licencias anteriores", () => {
    for (const expiresAt of [null, new Date("2026-09-30T00:00:00Z")]) {
      expect(licenseActivationDates({ ...fresh, validityMonths: null, expiresAt }, now))
        .toEqual({ activatedAt: now });
    }
  });
  it("conserva un vencimiento ya fijado incluso si hay meses configurados", () => {
    const expiresAt = new Date("2026-09-30T00:00:00Z");
    expect(licenseActivationDates({ ...fresh, expiresAt }, now).expiresAt).toBe(expiresAt);
  });
  it.each([
    { userId: "already-used" },
    { activatedAt: new Date("2026-01-01T00:00:00Z") },
    { status: "ACTIVADA" }, { status: "REVOCADA" }, { status: "SUSPENDIDA" },
    { validityMonths: 6 },
    { expiresAt: now }, { startsAt: new Date(now.getTime() + 1) },
  ])("rechaza licencia no reclamable: %j", (change) => {
    expect(isLicenseAvailableForActivation({ ...fresh, ...change }, now)).toBe(false);
  });
  it("permite folios nuevos y los antiguos sin fecha límite", () => {
    expect(isLicenseAvailableForActivation(fresh, now)).toBe(true);
    expect(isLicenseAvailableForActivation({ ...fresh, validityMonths: null }, now)).toBe(true);
  });
});
