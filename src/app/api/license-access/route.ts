import { NextResponse } from "next/server";
import { requireUser, UnauthorizedError } from "@/lib/authorization";
import { getLicenseAccess } from "@/lib/license-career-access";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(getLicenseAccess(user), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    console.error("Error consultando acceso:", error);
    return NextResponse.json({ error: "No se pudo consultar tu acceso." }, { status: 500 });
  }
}
