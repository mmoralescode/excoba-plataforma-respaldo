export const DEFAULT_LICENSE_VALIDITY_MONTHS = 4;

export type ActivationLicense = {
  userId: string | null;
  status: string;
  activatedAt: Date | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  validityMonths: number | null;
};

/** Calendar months in UTC, preserving the time and clamping short months. */
export function addCalendarMonths(date: Date, months: number): Date {
  if (!Number.isInteger(months) || months < 1 || !Number.isFinite(date.getTime())) {
    throw new RangeError("La vigencia debe ser un número positivo de meses.");
  }
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(result.getTime());
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  result.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  if (!Number.isFinite(result.getTime())) throw new RangeError("Vigencia fuera de rango.");
  return result;
}

export function isLicenseAvailableForActivation(
  license: ActivationLicense | null | undefined,
  now = new Date(),
): license is ActivationLicense {
  return Boolean(
    license &&
      license.userId === null &&
      license.activatedAt === null &&
      (license.status === "CREADA" || license.status === "ASIGNADA") &&
      (!license.startsAt || license.startsAt <= now) &&
      (!license.expiresAt || license.expiresAt > now) &&
      license.validityMonths !== 6 &&
      (license.validityMonths === null ||
        (Number.isInteger(license.validityMonths) && license.validityMonths > 0)),
  );
}

export function licenseActivationDates(license: ActivationLicense, now: Date) {
  // Legacy records retain their start/end dates, including an open-ended term.
  if (license.validityMonths === null) return { activatedAt: now };
  return {
    activatedAt: now,
    startsAt: now,
    // Never extend a previously specified expiration while claiming a license.
    expiresAt: license.expiresAt ?? addCalendarMonths(now, license.validityMonths),
  };
}
