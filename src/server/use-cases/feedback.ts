import { z } from "zod";
import { db } from "@/db/client";
import { canAccessPlatform } from "@/lib/license-access";
import { canReviewFeedback } from "@/lib/feedback-permissions";
import { ForbiddenError, UnauthorizedError } from "@/lib/authorization";

export const SubmitFeedbackSchema = z
  .object({
    category: z.enum(["SUGERENCIA", "ERROR"]),
    section: z.enum(["GENERAL", "INSTRUCTIVO", "PRACTICA", "SIMULADOR", "PERFIL", "OTRO"]),
    message: z.string().trim().min(10).max(1000),
    submissionId: z.string().uuid(),
  })
  .strict();
export const ReviewFeedbackSchema = z.object({ reviewed: z.boolean() }).strict();
export const FeedbackIdSchema = z.string().uuid();
export class FeedbackRateLimitError extends Error {}
export class FeedbackConflictError extends Error {}
export class FeedbackNotFoundError extends Error {}
const RECEIVED = "Recibimos tu mensaje. Gracias por ayudarnos a mejorar la plataforma.";

/** Serialize quota and idempotency checks per account, across server instances. */
export async function submitFeedback(userId: string, input: z.input<typeof SubmitFeedbackSchema>) {
  const data = SubmitFeedbackSchema.parse(input);
  return db.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (!locked.length) throw new UnauthorizedError();
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { roles: { include: { role: true } }, license: true },
      });
      const now = new Date();
      if (!user || !canAccessPlatform(user, now)) throw new UnauthorizedError();
      const existing = await tx.feedback.findUnique({
        where: { userId_submissionId: { userId, submissionId: data.submissionId } },
        select: { id: true, category: true, section: true, message: true },
      });
      if (existing) {
        if (
          existing.category !== data.category ||
          existing.section !== data.section ||
          existing.message !== data.message
        )
          throw new FeedbackConflictError();
        return { id: existing.id, message: RECEIVED };
      }
      const recentCount = await tx.feedback.count({
        where: { userId, createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
      });
      if (recentCount >= 5) throw new FeedbackRateLimitError();
      const feedback = await tx.feedback.create({
        data: { ...data, userId, createdAt: now },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "FEEDBACK_SUBMITTED",
          entity: "Feedback",
          entityId: feedback.id,
          metadata: { category: data.category, section: data.section },
        },
      });
      return { id: feedback.id, message: RECEIVED };
    },
    { timeout: 15000 },
  );
}

/** Review acknowledges reading, not that a reported bug has been fixed. */
export async function reviewFeedback(actorId: string, id: string, reviewed: boolean) {
  FeedbackIdSchema.parse(id);
  ReviewFeedbackSchema.parse({ reviewed });
  return db.$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        include: { roles: { include: { role: true } }, license: true },
      });
      if (!actor || !canAccessPlatform(actor)) throw new UnauthorizedError();
      if (!canReviewFeedback(actor)) throw new ForbiddenError();
      const rows = await tx.$queryRaw<
        Array<{ id: string; reviewedAt: Date | null }>
      >`SELECT "id", "reviewedAt" FROM "Feedback" WHERE "id" = ${id} FOR UPDATE`;
      const current = rows[0];
      if (!current) throw new FeedbackNotFoundError();
      // A wait for another review must not reuse permissions revoked meanwhile.
      const freshActor = await tx.user.findUnique({
        where: { id: actorId },
        include: { roles: { include: { role: true } }, license: true },
      });
      if (!freshActor || !canAccessPlatform(freshActor)) throw new UnauthorizedError();
      if (!canReviewFeedback(freshActor)) {
        throw new ForbiddenError();
      }
      if (Boolean(current.reviewedAt) === reviewed)
        return { id: current.id, reviewedAt: current.reviewedAt };
      const result = await tx.feedback.update({
        where: { id },
        data: { reviewedAt: reviewed ? new Date() : null },
        select: { id: true, reviewedAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "FEEDBACK_REVIEW_CHANGED",
          entity: "Feedback",
          entityId: id,
          metadata: { reviewed },
        },
      });
      return result;
    },
    { timeout: 15000 },
  );
}
