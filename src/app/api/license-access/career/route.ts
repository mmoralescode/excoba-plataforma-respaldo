import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireUser, UnauthorizedError } from "@/lib/authorization";
import { CareerAccessError } from "@/lib/license-career-access";
import { selectLicenseCareer } from "@/server/use-cases/select-license-career";
import { AuthRequestError, readAuthJson } from "@/lib/security/auth-request";
import { checkRecoveryRequest } from "@/lib/security/recovery-http";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    // Reuse the existing same-origin JSON guard: this choice is irreversible.
    const invalidRequest = checkRecoveryRequest(request);
    if (invalidRequest) return invalidRequest;
    const result = await selectLicenseCareer(user.id, await readAuthJson(request));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    if (error instanceof CareerAccessError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof AuthRequestError)
      return NextResponse.json({ error: "Selecciona una carrera válida del catálogo." }, { status: 400 });
    console.error("Error confirmando carrera:", error);
    return NextResponse.json({ error: "No se pudo confirmar la carrera. Intenta de nuevo." }, { status: 500 });
  }
}
