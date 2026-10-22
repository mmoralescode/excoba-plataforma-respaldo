import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  validateLicenseFolio,
  InvalidFolioError,
  ValidateFolioInputSchema,
} from "@/server/use-cases/validate-license-folio";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { AuthRequestError, authClientIp, readAuthJson } from "@/lib/security/auth-request";

export async function POST(request: NextRequest) {
  const ip = authClientIp(request);
  const rate = checkRateLimit(
    `activate-license:${ip}`,
    RATE_LIMITS.activateLicense.limit,
    RATE_LIMITS.activateLicense.windowMs,
  );
  if (!rate.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 });
  }

  try {
    const body = ValidateFolioInputSchema.parse(await readAuthJson(request));
    const license = await validateLicenseFolio(body);
    // Sólo se devuelve el identificador interno necesario para continuar
    // al registro; nunca datos sensibles de la licencia.
    return NextResponse.json(
      {
        licenseId: license.id,
        validityMonths: license.validityMonths,
        careerScope: license.careerScope,
        startsAt: license.startsAt,
        expiresAt: license.expiresAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof ZodError ||
      error instanceof AuthRequestError ||
      error instanceof InvalidFolioError
    ) {
      return NextResponse.json(
        { error: "El folio no es válido, ya fue utilizado o expiró." },
        { status: 400 },
      );
    }
    console.error("[licenses] validation_failed");
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
