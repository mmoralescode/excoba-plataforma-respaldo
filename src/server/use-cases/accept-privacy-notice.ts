import { db } from "@/db/client";
import { PRIVACY_NOTICE_VERSION } from "@/content/privacy-notice-version";

export async function acceptPrivacyNotice(userId: string) {
  const existing = await db.user.findUnique({
    where: { id: userId },
    select: { privacyNoticeAcceptedAt: true, privacyNoticeVersion: true },
  });
  if (!existing) throw new PrivacyNoticeAcceptanceError();

  if (
    existing.privacyNoticeAcceptedAt &&
    existing.privacyNoticeVersion === PRIVACY_NOTICE_VERSION
  ) {
    return { acceptedAt: existing.privacyNoticeAcceptedAt, alreadyAccepted: true };
  }

  const acceptedAt = new Date();
  return db.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        OR: [
          { privacyNoticeAcceptedAt: null },
          { privacyNoticeVersion: null },
          { privacyNoticeVersion: { not: PRIVACY_NOTICE_VERSION } },
        ],
      },
      data: { privacyNoticeAcceptedAt: acceptedAt, privacyNoticeVersion: PRIVACY_NOTICE_VERSION },
    });
    if (updated.count === 0) {
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { privacyNoticeAcceptedAt: true, privacyNoticeVersion: true },
      });
      if (
        !current?.privacyNoticeAcceptedAt ||
        current.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION
      ) {
        throw new PrivacyNoticeAcceptanceError();
      }
      return { acceptedAt: current.privacyNoticeAcceptedAt, alreadyAccepted: true };
    }
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "PRIVACY_NOTICE_ACCEPTED",
        entity: "User",
        entityId: userId,
        metadata: { version: PRIVACY_NOTICE_VERSION },
      },
    });
    return { acceptedAt, alreadyAccepted: false };
  });
}

export class PrivacyNoticeAcceptanceError extends Error {}
