import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { login, LoginError, LoginInputSchema } from "@/server/use-cases/login";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { AuthRequestError, authClientIp, readAuthJson } from "@/lib/security/auth-request";
import { hashToken } from "@/lib/security/tokens";

export async function POST(request: NextRequest) {
  const ip = authClientIp(request);
  const rateKey = `login:ip:${hashToken(ip)}`;
  const rate = checkRateLimit(rateKey, RATE_LIMITS.loginIp.limit, RATE_LIMITS.loginIp.windowMs);

  if (!rate.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 });
  }

  try {
    const body = LoginInputSchema.parse(await readAuthJson(request));
    const accountRate = checkRateLimit(
      `login:email:${hashToken(body.email.toLowerCase())}`,
      RATE_LIMITS.login.limit,
      RATE_LIMITS.login.windowMs,
    );
    if (!accountRate.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Intenta más tarde." },
        { status: 429 },
      );
    }
    const { user } = await login(body, request.headers.get("user-agent") ?? undefined);
    return NextResponse.json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    if (
      error instanceof ZodError ||
      error instanceof AuthRequestError ||
      error instanceof LoginError
    ) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
    }
    console.error("[login] authentication_failed");
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
