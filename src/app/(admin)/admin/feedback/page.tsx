import Link from "next/link";
import { z } from "zod";
import { db } from "@/db/client";
import { requireFeedbackReviewerPage } from "@/lib/page-authorization";
import { AdminAccessDenied } from "@/components/admin-access-denied";
import { FeedbackReviewButton } from "@/components/feedback-review-button";

export const dynamic = "force-dynamic";

const categories = { SUGERENCIA: "Sugerencia", ERROR: "Reporte de error" };
const sections = {
  GENERAL: "General",
  INSTRUCTIVO: "Instructivo",
  PRACTICA: "Práctica",
  SIMULADOR: "Simulador",
  PERFIL: "Perfil",
  OTRO: "Otro apartado",
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: { cursor?: string | string[] };
}) {
  // This check must stay in the page: layouts do not serialize child rendering.
  const user = await requireFeedbackReviewerPage();
  if (!user) return <AdminAccessDenied />;
  const cursor = searchParams.cursor;
  if (cursor !== undefined && !z.string().uuid().safeParse(cursor).success) {
    return (
      <section aria-labelledby="feedback-title">
        <h1 id="feedback-title" className="font-display text-2xl text-pizarron">
          Buzón de alumnos
        </h1>
        <p className="mt-4 text-sm text-ink/70">El enlace de esta página no es válido.</p>
        <Link
          href="/admin/feedback"
          className="mt-3 inline-flex min-h-11 items-center text-pizarron underline"
        >
          Volver a los mensajes más recientes
        </Link>
      </section>
    );
  }

  const messages = await db.feedback.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 21,
    ...(typeof cursor === "string" ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      category: true,
      section: true,
      message: true,
      createdAt: true,
      reviewedAt: true,
      user: { select: { name: true, email: true } },
    },
  });
  const visible = messages.slice(0, 20);
  const nextCursor = messages.length > 20 ? visible[visible.length - 1]?.id : undefined;

  return (
    <section aria-labelledby="feedback-title">
      <h1 id="feedback-title" className="font-display text-2xl text-pizarron">
        Buzón de alumnos
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink/70">
        Sugerencias y errores enviados desde Perfil. Esta bandeja es privada y no envía respuestas
        automáticas al alumno.
      </p>
      {visible.length === 0 ? (
        <p className="mt-6 rounded-md border border-ink/10 bg-white p-4 text-sm text-ink/70">
          {cursor ? "No hay más mensajes en esta página." : "Todavía no hay mensajes en el buzón."}
        </p>
      ) : (
        <ul className="mt-6 space-y-4" aria-label="Mensajes del buzón">
          {visible.map((feedback) => (
            <li
              key={feedback.id}
              className="min-w-0 rounded-md border border-ink/10 bg-white p-4 sm:p-5"
            >
              <article>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg text-pizarron">
                    {categories[feedback.category]} · {sections[feedback.section]}
                  </h2>
                  <span className="rounded-full bg-paper px-3 py-1 text-xs text-ink/70">
                    {feedback.reviewedAt ? "Revisado" : "Nuevo"}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm text-ink/70">
                  {feedback.user.name} · {feedback.user.email}
                </p>
                <time
                  dateTime={feedback.createdAt.toISOString()}
                  className="mt-1 block text-xs text-ink/60"
                >
                  {feedback.createdAt.toLocaleString("es-MX", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "America/Mexico_City",
                  })}
                  {" · hora de Ciudad de México"}
                </time>
                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                  {feedback.message}
                </p>
                <div className="mt-4 border-t border-ink/10 pt-3">
                  <FeedbackReviewButton
                    id={feedback.id}
                    reviewedAt={feedback.reviewedAt?.toISOString() ?? null}
                  />
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {(cursor || nextCursor) && (
        <nav
          aria-label="Paginación del buzón"
          className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm"
        >
          {cursor && (
            <Link
              href="/admin/feedback"
              className="inline-flex min-h-11 items-center text-pizarron underline"
            >
              Mensajes más recientes
            </Link>
          )}
          {nextCursor && (
            <Link
              href={`/admin/feedback?cursor=${encodeURIComponent(nextCursor)}`}
              className="inline-flex min-h-11 items-center text-pizarron underline"
            >
              Mensajes anteriores
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
