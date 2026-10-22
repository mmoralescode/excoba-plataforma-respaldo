import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  resetPassword,
  ResetPasswordError,
  ResetPasswordSchema,
} from "@/server/use-cases/password-reset";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hashToken } from "@/lib/security/tokens";
import { AuthRequestError, authClientIp, readAuthJson } from "@/lib/security/auth-request";

export async function POST(request: NextRequest) {
  try {
    const ipRate = checkRateLimit(
      `reset-confirm:ip:${hashToken(authClientIp(request))}`,
      60,
      15 * 60 * 1000,
    );
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta más tarde.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }
    const body = ResetPasswordSchema.parse(await readAuthJson(request));
    const tokenRate = checkRateLimit(
      `reset-confirm:token:${hashToken(body.token)}`,
      5,
      15 * 60 * 1000,
    );
    if (!tokenRate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta más tarde.", code: "RATE_LIMITED" },
        { status: 429 },
      );
    }
    return NextResponse.json(await resetPassword(body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof AuthRequestError) {
      return NextResponse.json(
        { error: "Datos inválidos.", code: "INVALID_INPUT" },
        { status: 400 },
      );
    }
    if (error instanceof ResetPasswordError) {
      return NextResponse.json(
        { error: error.message, code: "INVALID_RESET_TOKEN" },
        { status: 400 },
      );
    }
    console.error("[password-reset] confirm_failed", { code: "INTERNAL" });
    return NextResponse.json(
      { error: "No se pudo actualizar la contraseña. Intenta más tarde.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
