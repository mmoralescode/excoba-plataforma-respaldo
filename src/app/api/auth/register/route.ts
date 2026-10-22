import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { registerUser, RegisterError, RegisterInputSchema } from "@/server/use-cases/register-user";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { AuthRequestError, authClientIp, readAuthJson } from "@/lib/security/auth-request";

export async function POST(request: NextRequest) {
  const ip = authClientIp(request);
  const rate = checkRateLimit(
    `register:${ip}`,
    RATE_LIMITS.register.limit,
    RATE_LIMITS.register.windowMs,
  );
  if (!rate.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 });
  }

  try {
    const body = RegisterInputSchema.parse(await readAuthJson(request));
    const user = await registerUser(body);
    return NextResponse.json(
      { id: user.id, email: user.email, recoveryCode: user.recoveryCode },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store",
          Pragma: "no-cache",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof AuthRequestError) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }
    if (error instanceof RegisterError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[register] registration_failed");
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
