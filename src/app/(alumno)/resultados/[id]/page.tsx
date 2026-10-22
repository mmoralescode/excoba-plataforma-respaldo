import { notFound } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import { getAttemptReview } from "@/server/use-cases/attempt-review";
import { AttemptFeedback } from "@/components/attempt-feedback";
import { getLicenseAccess } from "@/lib/license-career-access";

export default async function ResultsPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const result = await getAttemptReview(params.id, user.id, getLicenseAccess(user));
  if (!result) notFound();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-pizarron">
        Resultado: {Math.round(result.score)}%
      </h1>
      <p className="mt-2 text-sm">
        {result.correctCount} de {result.totalCount} preguntas completamente correctas.
      </p>
      <AttemptFeedback review={result.review} />
    </main>
  );
}
