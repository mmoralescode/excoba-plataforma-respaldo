import { NextResponse } from "next/server";
import { z } from "zod";
import { PRIVACY_NOTICE_VERSION } from "@/content/privacy-notice-version";
import { AuthRequestError, readAuthJson } from "@/lib/security/auth-request";
import { requireUser, UnauthorizedError } from "@/lib/authorization";
import {
  acceptPrivacyNotice,
  PrivacyNoticeAcceptanceError,
} from "@/server/use-cases/accept-privacy-notice";

const acceptanceSchema = z.object({
  version: z.literal(PRIVACY_NOTICE_VERSION),
  accepted: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return NextResponse.json({ error: "Se requiere JSON." }, { status: 415 });
    }
    acceptanceSchema.parse(await readAuthJson(request));
    const result = await acceptPrivacyNotice(user.id);
    return NextResponse.json(
      { acceptedAt: result.acceptedAt.toISOString(), alreadyAccepted: result.alreadyAccepted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof AuthRequestError) {
      return NextResponse.json(
        { error: "Confirma la lectura de la versión vigente." },
        { status: 400 },
      );
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    if (error instanceof PrivacyNoticeAcceptanceError) {
      return NextResponse.json({ error: "No fue posible registrar el aviso." }, { status: 400 });
    }
    console.error("[privacy] acceptance_failed");
    return NextResponse.json({ error: "No fue posible registrar el aviso." }, { status: 500 });
  }
}
