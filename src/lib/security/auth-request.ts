import { isIP } from "node:net";
import type { NextRequest } from "next/server";

const MAX_AUTH_BODY_BYTES = 4096;
const RESET_RESPONSE_FLOOR_MS = 3000;

export class AuthRequestError extends Error {}

/** Bound the stream, not just Content-Length (which a caller can omit or forge). */
export async function readAuthJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AUTH_BODY_BYTES) {
    throw new AuthRequestError("Datos inválidos.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthRequestError("Datos inválidos.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUTH_BODY_BYTES) {
        await reader.cancel();
        throw new AuthRequestError("Datos inválidos.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AuthRequestError("Datos inválidos.");
  } finally {
    reader.releaseLock();
  }
}

/** Deploy behind a proxy that overwrites forwarding headers (Vercel does). */
export function authClientIp(request: NextRequest) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "";
  const candidate = forwarded.split(",", 1)[0]?.trim() ?? "";
  return isIP(candidate) ? candidate : "unknown";
}

/** Best-effort timing equalization; provider calls time out before this floor. */
export async function waitForResetResponse(startedAt: number) {
  const remaining = RESET_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
}
