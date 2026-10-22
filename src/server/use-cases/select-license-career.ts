import { z } from "zod";
import { db } from "@/db/client";
import { getCareer } from "@/content/career-catalog";
import { canAccessPlatform } from "@/lib/license-access";
import { CareerAccessError, getLicenseAccess } from "@/lib/license-career-access";

export const SelectLicenseCareerSchema = z.object({
  careerId: z.string().refine((id) => !!getCareer(id), "Selecciona una carrera válida del catálogo."),
});

/** Compare-and-set on the license row makes the first explicit confirmation final,
 * even if two tabs choose different careers at the same time. */
export async function selectLicenseCareer(userId: string, input: unknown) {
  const { careerId } = SelectLicenseCareerSchema.parse(input);
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } }, license: true },
    });
    const now = new Date();
    if (!user || !canAccessPlatform(user, now))
      throw new CareerAccessError("Tu acceso no está disponible.", 401);
    const access = getLicenseAccess(user);
    if (access.careerScope !== "SINGLE_CAREER") return access;
    const license = user.license!;
    const selected = await tx.license.updateMany({
      where: {
        id: license.id, userId, careerScope: "SINGLE_CAREER", status: "ACTIVADA",
        selectedCareerId: null,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
      },
      data: { selectedCareerId: careerId, careerSelectedAt: now },
    });
    const fresh = await tx.license.findUnique({ where: { id: license.id } });
    if (!fresh || fresh.status !== "ACTIVADA" || (fresh.expiresAt && fresh.expiresAt <= now))
      throw new CareerAccessError("Tu acceso no está disponible.", 401);
    if (fresh.selectedCareerId !== careerId)
      throw new CareerAccessError("Tu plan ya está ligado a otra carrera y no permite cambiarla.", 409);
    if (selected.count === 1) await tx.auditLog.create({
      data: {
        actorId: userId, action: "LICENSE_CAREER_SELECTED", entity: "License", entityId: license.id,
        metadata: { careerId, careerScope: "SINGLE_CAREER" },
      },
    });
    return getLicenseAccess({ ...user, license: fresh });
  });
}
