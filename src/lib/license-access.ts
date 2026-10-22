type AccessUser = {
  id: string;
  status: string;
  deletedAt: Date | null;
  roles: { role: { name: string } }[];
  license: {
    userId: string | null;
    status: string;
    startsAt: Date | null;
    expiresAt: Date | null;
    validityMonths?: number | null;
  } | null;
};

const STAFF_ROLES = new Set(["SUPER_ADMIN", "EDITOR_ACADEMICO", "SOPORTE", "ANALISTA"]);

/** Staff keep their existing role-based access. A student's access ends at the
 * exact expiry instant, even if their seven-day session cookie remains valid. */
export function canAccessPlatform(user: AccessUser, now = new Date()) {
  if (user.status !== "ACTIVO" || user.deletedAt) return false;
  if (user.roles.some(({ role }) => STAFF_ROLES.has(role.name))) return true;
  if (!user.roles.some(({ role }) => role.name === "ALUMNO")) return false;
  const license = user.license;
  return Boolean(
    license &&
    license.userId === user.id &&
    license.status === "ACTIVADA" &&
    license.validityMonths !== 6 &&
    (!license.startsAt || license.startsAt <= now) &&
    (!license.expiresAt || license.expiresAt > now),
  );
}
