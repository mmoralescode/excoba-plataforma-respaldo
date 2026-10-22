import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hashToken } from "@/lib/security/tokens";
import { hashRecoveryCode } from "@/lib/security/recovery-code";
import {
  AuthRequestError,
  authClientIp,
  readAuthJson,
  waitForResetResponse,
} from "@/lib/security/auth-request";
import { checkRecoveryRequest, recoveryJson } from "@/lib/security/recovery-http";
import {
  RecoverWithCodeSchema,
  recoverPasswordWithCode,
  RecoveryCodeError,
} from "@/server/use-cases/recovery-code";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const invalidRequest = checkRecoveryRequest(request);
    if (invalidRequest) return invalidRequest;
    const ip = checkRateLimit(
      "recovery-use:ip:" + hashToken(authClientIp(request)),
      60,
      15 * 60 * 1000,
    );
    if (!ip.allowed) return recoveryJson({ error: "Demasiados intentos. Intenta más tarde." }, 429);
    const body = RecoverWithCodeSchema.parse(await readAuthJson(request));
    // Keys are normalized digests; never put plaintext codes or email into logs/buckets.
    const account = checkRateLimit(
      "recovery-use:email:" + hashToken(body.email),
      10,
      15 * 60 * 1000,
    );
    const code = checkRateLimit(
      "recovery-use:code:" + hashRecoveryCode(body.code),
      5,
      15 * 60 * 1000,
    );
    if (!account.allowed || !code.allowed)
      return recoveryJson({ error: "Demasiados intentos. Intenta más tarde." }, 429);
    return recoveryJson(await recoverPasswordWithCode(body));
  } catch (error) {
    if (error instanceof AuthRequestError || error instanceof ZodError)
      return recoveryJson(
        {
          error:
            "Revisa los datos y confirma que ambas contraseñas coincidan y tengan entre 10 y 128 caracteres.",
        },
        400,
      );
    if (error instanceof RecoveryCodeError) return recoveryJson({ error: error.message }, 400);
    console.error("[recovery-code] reset_failed");
    return recoveryJson({ error: "No se pudo actualizar la contraseña. Intenta más tarde." }, 500);
  } finally {
    await waitForResetResponse(startedAt);
  }
}
