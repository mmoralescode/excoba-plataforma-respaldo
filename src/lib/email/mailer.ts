import { z } from "zod";

/** No error contains recipient addresses, provider bodies, tokens or credentials. */
export class EmailConfigurationError extends Error {
  constructor(public readonly code: "PROVIDER" | "API_KEY" | "SENDER" | "APP_URL") {
    super("El servicio de correo no está configurado.");
    this.name = "EmailConfigurationError";
  }
}

export class EmailDeliveryError extends Error {
  constructor(
    public readonly code: "NETWORK" | "REJECTED" | "INVALID_RESPONSE",
    public readonly status?: number,
  ) {
    super("El proveedor no confirmó la aceptación del correo.");
    this.name = "EmailDeliveryError";
  }
}

export const EMAIL_TIMEOUT_MS = 2500;

function emailConfiguration() {
  if (process.env.EMAIL_PROVIDER !== "resend") throw new EmailConfigurationError("PROVIDER");
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || /\s/.test(apiKey)) throw new EmailConfigurationError("API_KEY");
  const from = process.env.EMAIL_FROM?.trim() ?? "";
  const address = from.includes("<") ? from.match(/^[^<>\r\n]+<([^<>]+)>$/)?.[1] : from;
  if (!address || /[\r\n]/.test(from) || !z.string().email().safeParse(address).success) {
    throw new EmailConfigurationError("SENDER");
  }
  // Resend itself enforces that the sender's domain is verified for this API key.
  const domain = address.split("@")[1]!.toLowerCase();
  if (domain === "resend.dev" || domain.endsWith(".resend.dev")) {
    throw new EmailConfigurationError("SENDER");
  }
  return { apiKey, from };
}

function applicationOrigin() {
  try {
    const url = new URL(process.env.APP_URL ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const protocolAllowed =
      url.protocol === "https:" ||
      (process.env.NODE_ENV !== "production" && local && url.protocol === "http:");
    if (
      !protocolAllowed ||
      (process.env.NODE_ENV === "production" && local) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new EmailConfigurationError("APP_URL");
  }
}

/** Preflight before account lookup: missing configuration must never enumerate users. */
export function assertEmailConfigured() {
  emailConfiguration();
  applicationOrigin();
}

/** Resolved means accepted by Resend, not delivered to the inbox. No console fallback. */
export async function sendEmail(to: string, subject: string, body: string) {
  const { apiKey, from } = emailConfiguration();
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "EXCOBA-Platform/1.0",
      },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new EmailDeliveryError("NETWORK");
  }
  if (!response.ok) throw new EmailDeliveryError("REJECTED", response.status);
  const payload: unknown = await response.json().catch(() => null);
  const accepted = z.object({ id: z.string().min(1).max(128) }).safeParse(payload);
  if (!accepted.success) throw new EmailDeliveryError("INVALID_RESPONSE");
  return { id: accepted.data.id };
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = new URL("/recuperar-password/confirmar", applicationOrigin());
  // Fragments are not sent to the server or included in HTTP access logs.
  url.hash = new URLSearchParams({ token }).toString();
  return sendEmail(
    to,
    "Recupera tu contraseña — Plataforma EXCOBA",
    `Para restablecer tu contraseña visita este enlace (válido 30 minutos): ${url.toString()}\n\nSi no solicitaste este cambio, ignora este correo.`,
  );
}

export async function sendLicenseAssignedEmail(to: string, folio: string) {
  return sendEmail(
    to,
    "Tu folio de acceso — Plataforma EXCOBA",
    `Tu folio de activación es: ${folio}\n\nActívalo aquí: ${applicationOrigin()}/activar`,
  );
}
