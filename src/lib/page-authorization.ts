import type { RoleName } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  ForbiddenError,
  hasRole,
  requireFeedbackReviewer,
  requireRole,
  requireUser,
  UnauthorizedError,
} from "@/lib/authorization";
import { canReviewFeedback } from "@/lib/feedback-permissions";

/** Page-only handling. APIs keep requireRole's explicit 401/403 error contract. */
export async function requirePageRole(...allowed: RoleName[]) {
  return authorizePage(() => requireRole(...allowed));
}

export async function requireFeedbackReviewerPage() {
  return authorizePage(requireFeedbackReviewer);
}

/** Allows rendering navigation only; every admin page must enforce its own permission. */
export async function requireAdminShellPage() {
  return authorizePage(async () => {
    const user = await requireUser();
    if (
      !canReviewFeedback(user) &&
      !hasRole(user, "EDITOR_ACADEMICO") &&
      !hasRole(user, "ANALISTA")
    )
      throw new ForbiddenError();
    return user;
  });
}

async function authorizePage<T>(authorize: () => Promise<T>) {
  try {
    return await authorize();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    if (error instanceof ForbiddenError) return null;
    // Preserve unexpected errors and Next.js redirect/dynamic-render control flow.
    throw error;
  }
}
