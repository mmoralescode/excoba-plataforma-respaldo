/**
 * Envoltorio del servicio de correo transaccional.
 *
 * Proveedor: Resend (https://resend.com) vía su API HTTP directa — sin SDK
 * ni dependencias nativas, sólo `fetch`, para evitar la categoría entera de
 * problemas de empaquetado que ya vivimos con `argon2` en Vercel.
 *
 * Configuración requerida en producción (variables de entorno en Vercel):
 *   EMAIL_PROVIDER=resend
 *   RESEND_API_KEY=<tu API key de resend.com>
 *   EMAIL_FROM=<dirección remitente verificada, o el sandbox de Resend>
 *
 * Si RESEND_API_KEY no está configurada, o si EMAIL_PROVIDER es "console"
 * (o no está definida), el correo sólo se registra en los logs — nunca se
 * envía. Esto es intencional para desarrollo local, pero en producción
 * significa que nadie recibe el correo real; por eso este caso se marca
 * también con `console.error` (no sólo `warn`), para que sea visible en los
 * logs de Vercel como una condición anómala si ocurre en producción.
 */
export async function sendEmail(to: string, subject: string, body: string) {
  const provider = process.env.EMAIL_PROVIDER ?? "console";

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error(
        `[email:resend] RESEND_API_KEY no está configurada — no se pudo enviar correo a ${to}.`,
      );
      return;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
        to,
        subject,
        text: body,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[email:resend] Resend respondió ${response.status} al enviar a ${to}: ${errorText}`,
      );
    }
    return;
  }

  if (provider === "console" || process.env.NODE_ENV !== "production") {
    console.warn(`[email:${provider}] Para: ${to} | Asunto: ${subject}\n${body}`);
    return;
  }

  console.error(`[email] Proveedor de correo "${provider}" no implementado — correo a ${to} perdido.`);
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = `${process.env.APP_URL}/recuperar-password/confirmar?token=${token}`;
  await sendEmail(
    to,
    "Recupera tu contraseña — Plataforma EXCOBA",
    `Para restablecer tu contraseña visita este enlace (válido 30 minutos): ${url}\n\nSi no solicitaste este cambio, ignora este correo.`,
  );
}

export async function sendLicenseAssignedEmail(to: string, folio: string) {
  await sendEmail(
    to,
    "Tu folio de acceso — Plataforma EXCOBA",
    `Tu folio de activación es: ${folio}\n\nActívalo aquí: ${process.env.APP_URL}/activar`,
  );
}
