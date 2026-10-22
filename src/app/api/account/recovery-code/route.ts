import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/authorization";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { hashToken } from "@/lib/security/tokens";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { AuthRequestError, readAuthJson } from "@/lib/security/auth-request";
import { checkRecoveryRequest, recoveryJson } from "@/lib/security/recovery-http";
import {
  GenerateRecoveryCodeSchema,
  generateAccountRecoveryCode,
  getRecoveryCodeStatus,
  RecoveryCodeGenerationError,
} from "@/server/use-cases/recovery-code";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return recoveryJson(await getRecoveryCodeStatus(user.id));
  } catch (error) {
    return handleError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const invalidRequest = checkRecoveryRequest(request);
    if (invalidRequest) return invalidRequest;
    const rate = checkRateLimit("recovery-generate:user:" + hashToken(user.id), 5, 15 * 60 * 1000);
    if (!rate.allowed)
      return recoveryJson({ error: "Demasiados intentos. Intenta más tarde." }, 429);
    const body = GenerateRecoveryCodeSchema.parse(await readAuthJson(request));
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) throw new UnauthorizedError();
    return recoveryJson(await generateAccountRecoveryCode(user.id, hashToken(token), body));
  } catch (error) {
    return handleError(error);
  }
}
function handleError(error: unknown) {
  if (error instanceof UnauthorizedError)
    return recoveryJson({ error: "Inicia sesión para generar tu código." }, 401);
  if (error instanceof AuthRequestError || error instanceof ZodError)
    return recoveryJson({ error: "Datos inválidos." }, 400);
  if (error instanceof RecoveryCodeGenerationError)
    return recoveryJson({ error: error.message }, 400);
  // Do not log caught provider/database errors: they may contain request data.
  console.error("[recovery-code] generation_or_status_failed");
  return recoveryJson({ error: "No se pudo completar la operación. Intenta más tarde." }, 500);
}
