import Link from "next/link";
import type { ReviewItem } from "@/content/attempt-review-types";

export function AttemptFeedback({ review = [] }: { review?: ReviewItem[] }) {
  if (!review.length) return null;
  const errors = review.filter((item) => !item.isCorrect);
  return (
    <section className="mt-6 space-y-3">
      <h2 className="font-display text-xl text-pizarron">Aprende de este intento</h2>
      <p className="text-sm text-ink/65">
        Primero aparecen los errores y las omisiones. Abre cada pregunta para revisar el
        razonamiento.
      </p>
      {[...errors, ...review.filter((item) => item.isCorrect)].map((item) => (
        <details key={item.questionId} className="rounded-md border border-ink/10 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {item.isCorrect ? "✓ Correcta" : item.credit > 0 ? "Parcial" : "Por repasar"} ·{" "}
            {item.topicName}
          </summary>
          <div className="mt-3 space-y-2 text-sm leading-6">
            <p>{item.text}</p>
            <p>Tu respuesta: {item.selectedText}</p>
            <p className="text-aprobado">Respuesta: {item.correctText}</p>
            <p>{item.explanation}</p>
            <Link
              className="inline-flex min-h-11 items-center text-pizarron underline"
              href={`/practica?subject=${encodeURIComponent(item.subjectId)}&topic=${encodeURIComponent(item.topicId)}&scope=official`}
            >
              ▶ Repasar este tema
            </Link>
          </div>
        </details>
      ))}
      <Link
        className="inline-flex min-h-11 items-center text-sm text-pizarron underline"
        href="/perfil"
      >
        Ver mi historial y qué estudiar hoy
      </Link>
    </section>
  );
}
