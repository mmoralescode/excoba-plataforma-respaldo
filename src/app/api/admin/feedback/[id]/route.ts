import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { requireFeedbackReviewer, UnauthorizedError, ForbiddenError } from "@/lib/authorization";
import { AuthRequestError, readAuthJson } from "@/lib/security/auth-request";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hashToken } from "@/lib/security/tokens";
import { checkRecoveryRequest, recoveryJson } from "@/lib/security/recovery-http";
import {
  ReviewFeedbackSchema,
  FeedbackIdSchema,
  reviewFeedback,
  FeedbackNotFoundError,
} from "@/server/use-cases/feedback";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireFeedbackReviewer();
    const invalid = checkRecoveryRequest(request);
    if (invalid) return invalid;
    if (!checkRateLimit("feedback-review:user:" + hashToken(user.id), 120, 15 * 60 * 1000).allowed)
      return recoveryJson({ error: "Demasiados intentos. Intenta más tarde." }, 429);
    const id = FeedbackIdSchema.parse(params.id);
    const body = ReviewFeedbackSchema.parse(await readAuthJson(request));
    return recoveryJson(await reviewFeedback(user.id, id, body.reviewed));
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return recoveryJson({ error: "Inicia sesión para continuar." }, 401);
    if (error instanceof ForbiddenError)
      return recoveryJson({ error: "No tienes permisos para consultar el buzón." }, 403);
    if (error instanceof ZodError || error instanceof AuthRequestError)
      return recoveryJson({ error: "Datos inválidos." }, 400);
    if (error instanceof FeedbackNotFoundError)
      return recoveryJson({ error: "No se encontró el mensaje." }, 404);
    console.error("[feedback] review_failed");
    return recoveryJson({ error: "No se pudo actualizar el mensaje. Intenta más tarde." }, 500);
  }
}
