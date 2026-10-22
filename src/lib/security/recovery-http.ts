import { NextResponse } from "next/server";

export function recoveryJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
    },
  });
}
/** No CORS access; prevent cross-origin form posts and ambient-cookie CSRF. */
export function checkRecoveryRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return recoveryJson({ error: "Origen no permitido." }, 403);
  }
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return recoveryJson({ error: "Se requiere JSON." }, 415);
  }
  return null;
}
