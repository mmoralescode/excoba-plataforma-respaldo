import { db } from "@/db/client";
import { questions as bank, curriculum } from "@/content/bank";
import type { AttemptReview } from "@/content/attempt-review-types";
import type { StructuredResponse } from "@/content/interaction-types";
import { hasStructuredMode, responseLabel } from "./structured-responses";
import {
  ALL_CAREER_ACCESS, type LicenseAccess, assertAttemptCareerAccess, assertQuestionAccess, CareerAccessError,
} from "@/lib/license-career-access";

const explanations = new Map(bank.map((q) => [q.id, q]));
const topics = new Map(curriculum.topics.map((t) => [`uaq-2026-2-topic-${t.id}`, t.name]));

/** Never expose keys for an active attempt or another student's work. */
export async function getAttemptReview(
  attemptId: string,
  userId: string,
  access: LicenseAccess = ALL_CAREER_ACCESS,
): Promise<AttemptReview | null> {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, userId, status: "ENTREGADO" },
    include: { answers: { include: { question: { include: { answers: true } } } } },
  });
  if (!attempt) return null;
  try {
    assertAttemptCareerAccess(access, attempt.config);
    assertQuestionAccess(access, attempt.answers.map((answer) => answer.question));
  } catch (error) {
    if (error instanceof CareerAccessError) return null;
    throw error;
  }
  const review = attempt.answers.map((answer) => {
    const q = answer.question;
    const source = explanations.get(q.id);
    return {
      questionId: q.id,
      text: q.text,
      topicId: q.topicId,
      subjectId: q.subjectId,
      topicName: topics.get(q.topicId)?.split(". ")[0] ?? "Repaso del tema",
      selectedText: hasStructuredMode(attempt.config, q.id)
        ? responseLabel(q.id, answer.response as StructuredResponse | null)
        : (q.answers.find((a) => a.id === answer.selectedAnswerId)?.text ?? "Sin respuesta"),
      correctText: q.answers
        .filter((a) => a.isCorrect)
        .map((a) => a.text)
        .join("; "),
      explanation:
        source?.text === q.text
          ? source.explanation
          : "Revisa la respuesta correcta y vuelve a practicar este tema.",
      isCorrect: answer.isCorrect === true,
      credit: answer.credit ?? (answer.isCorrect ? 1 : 0),
    };
  });
  return {
    attemptId,
    score: attempt.score ?? 0,
    correctCount: review.filter((a) => a.isCorrect).length,
    totalCount: review.length,
    review,
  };
}
