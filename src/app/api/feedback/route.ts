import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/authorization";
import { AuthRequestError, readAuthJson } from "@/lib/security/auth-request";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hashToken } from "@/lib/security/tokens";
import { checkRecoveryRequest, recoveryJson } from "@/lib/security/recovery-http";
import {
  SubmitFeedbackSchema,
  submitFeedback,
  FeedbackConflictError,
  FeedbackRateLimitError,
} from "@/server/use-cases/feedback";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const invalid = checkRecoveryRequest(request);
    if (invalid) return invalid;
    if (!checkRateLimit("feedback:user:" + hashToken(user.id), 10, 15 * 60 * 1000).allowed)
      return recoveryJson(
        { error: "Demasiados intentos. Espera unos minutos antes de intentar de nuevo." },
        429,
      );
    const body = SubmitFeedbackSchema.parse(await readAuthJson(request));
    return recoveryJson(await submitFeedback(user.id, body), 201);
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return recoveryJson({ error: "Inicia sesión para enviar tu mensaje." }, 401);
    if (error instanceof ZodError || error instanceof AuthRequestError)
      return recoveryJson(
        { error: "Selecciona un tipo y una sección; escribe entre 10 y 1000 caracteres." },
        400,
      );
    if (error instanceof FeedbackRateLimitError)
      return recoveryJson(
        { error: "Puedes enviar hasta 5 mensajes por hora. Intenta más tarde." },
        429,
      );
    if (error instanceof FeedbackConflictError)
      return recoveryJson(
        {
          error:
            "Ese envío ya fue registrado con otro contenido. Edita tu mensaje antes de enviarlo de nuevo.",
        },
        409,
      );
    console.error("[feedback] submission_failed");
    return recoveryJson(
      { error: "No pudimos confirmar el envío. Tu texto se conserva para que puedas reintentar." },
      500,
    );
  }
}
