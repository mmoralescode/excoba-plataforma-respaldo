import type { RoleName } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { canReviewFeedback } from "@/lib/feedback-permissions";

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

/** Exige una sesión válida. Lanza UnauthorizedError si no existe. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError("Sesión no válida o expirada.");
  return user;
}

/**
 * Exige que el usuario autenticado tenga al menos uno de los roles
 * indicados. La autorización se evalúa siempre en el servidor, nunca sólo
 * en la interfaz (ver Módulo 1, sección 10).
 */
export async function requireRole(...allowed: RoleName[]): Promise<SessionUser> {
  const user = await requireUser();
  const userRoles = user.roles.map((ur) => ur.role.name);
  const hasRole = allowed.some((role) => userRoles.includes(role));
  if (!hasRole) {
    throw new ForbiddenError("No tienes permisos para esta acción.");
  }
  return user;
}

export function hasRole(user: SessionUser, role: RoleName): boolean {
  return user.roles.some((ur) => ur.role.name === role);
}

/** Requires a current session and the narrowly scoped inbox permission. */
export async function requireFeedbackReviewer(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canReviewFeedback(user)) {
    throw new ForbiddenError("No tienes permisos para consultar el buzón.");
  }
  return user;
}
