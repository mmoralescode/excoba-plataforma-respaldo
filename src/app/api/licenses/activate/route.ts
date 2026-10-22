import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { validateLicenseFolio, InvalidFolioError } from "@/server/use-cases/validate-license-folio";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rate = checkRateLimit(
    `activate-license:${ip}`,
    RATE_LIMITS.activateLicense.limit,
    RATE_LIMITS.activateLicense.windowMs,
  );
  if (!rate.allowed) {
    return NextResponse.json({ error: "Demasiados intentos. Intenta más tarde." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const license = await validateLicenseFolio(body);
    // Sólo se devuelve el identificador interno necesario para continuar
    // al registro; nunca datos sensibles de la licencia.
    return NextResponse.json({ licenseId: license.id });
  } catch (error) {
    if (error instanceof ZodError || error instanceof InvalidFolioError) {
      return NextResponse.json(
        { error: "El folio no es válido, ya fue utilizado o expiró." },
        { status: 400 },
      );
    }
    console.error("Error validando folio:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
