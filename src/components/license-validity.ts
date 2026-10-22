type LicenseValidity = {
  validityMonths: number | null;
  startsAt?: Date | null;
  activatedAt?: Date | null;
  expiresAt: Date | null;
};

export function formatLicenseDate(date: Date) {
  return date.toLocaleDateString("es-MX", {
    dateStyle: "medium",
    timeZone: "America/Mexico_City",
  });
}

export function licenseExpiryLabel(license: LicenseValidity) {
  if (license.expiresAt) return formatLicenseDate(license.expiresAt);
  if (license.validityMonths) {
    return license.activatedAt || license.startsAt
      ? "Fecha de vencimiento por confirmar"
      : "Pendiente de activación";
  }
  return "Sin vencimiento configurado (licencia anterior)";
}
