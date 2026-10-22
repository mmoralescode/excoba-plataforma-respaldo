import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  requestPasswordReset,
  RequestPasswordResetSchema,
} from "@/server/use-cases/password-reset";
import { EmailConfigurationError } from "@/lib/email/mailer";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { hashToken } from "@/lib/security/tokens";
import {
  AuthRequestError,
  authClientIp,
  readAuthJson,
  waitForResetResponse,
} from "@/lib/security/auth-request";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const ipRate = checkRateLimit(
      `password-reset:ip:${hashToken(authClientIp(request))}`,
      RATE_LIMITS.passwordResetIp.limit,
      RATE_LIMITS.passwordResetIp.windowMs,
    );
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta más tarde.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }
    const body = RequestPasswordResetSchema.parse(await readAuthJson(request));
    const emailRate = checkRateLimit(
      `password-reset:email:${hashToken(body.email)}`,
      RATE_LIMITS.passwordReset.limit,
      RATE_LIMITS.passwordReset.windowMs,
    );
    if (!emailRate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta más tarde.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }
    const result = await requestPasswordReset(body);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof AuthRequestError) {
      return NextResponse.json(
        { error: "Datos inválidos.", code: "INVALID_INPUT" },
        { status: 400 },
      );
    }
    console.error("[password-reset] request_unavailable", {
      code: error instanceof EmailConfigurationError ? error.code : "INTERNAL",
    });
    // Configuration is checked before user lookup: existing and absent accounts match.
    return NextResponse.json(
      {
        error: "La recuperación por correo no está disponible en este momento. Intenta más tarde.",
        code: "SERVICE_UNAVAILABLE",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    await waitForResetResponse(startedAt);
  }
}
