import { z } from "zod";
import { db } from "@/db/client";
import { hashPassword } from "@/lib/security/password";

export const RegisterInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres."),
  name: z.string().min(2).max(120),
  licenseId: z.string().uuid(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export class RegisterError extends Error {}

/**
 * Crea la cuenta de un alumno y la vincula a una licencia ya validada por
 * `activateLicense` (ver Módulo 5). Este caso de uso NO valida el folio de
 * nuevo: asume que `licenseId` corresponde a una licencia en estado
 * ASIGNADA/reservada temporalmente para este registro.
 */
export async function registerUser(input: RegisterInput) {
  const parsed = RegisterInputSchema.parse(input);
  const data = { ...parsed, email: parsed.email.trim().toLowerCase() };

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    // Mensaje genérico: no confirmamos ni negamos explícitamente si el
    // correo existe, para reducir enumeración de usuarios.
    throw new RegisterError("No fue posible completar el registro con estos datos.");
  }

  const license = await db.license.findUnique({ where: { id: data.licenseId } });
  // Debe aceptar los mismos estados que valida `validateLicenseFolio`
  // (CREADA o ASIGNADA) — antes sólo aceptaba ASIGNADA, lo que rechazaba
  // el registro de cualquier folio recién creado que nunca pasó por una
  // asignación manual previa.
  const licenseIsUsable =
    license &&
    !license.userId &&
    (license.status === "CREADA" || license.status === "ASIGNADA");
  if (!licenseIsUsable) {
    throw new RegisterError("No fue posible completar el registro con estos datos.");
  }

  const passwordHash = await hashPassword(data.password);
  const alumnoRole = await db.role.findUniqueOrThrow({ where: { name: "ALUMNO" } });

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        roles: { create: { roleId: alumnoRole.id } },
      },
    });

    await tx.license.update({
      where: { id: license.id },
      data: {
        userId: created.id,
        status: "ACTIVADA",
        activatedAt: new Date(),
      },
    });

    await tx.licenseEvent.create({
      data: {
        licenseId: license.id,
        type: "ACTIVACION",
        reason: "Registro de alumno completado.",
      },
    });

    return created;
  });

  return user;
}
