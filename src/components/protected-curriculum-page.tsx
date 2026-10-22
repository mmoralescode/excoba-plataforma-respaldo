import Link from "next/link";
import { redirect } from "next/navigation";
import { CurriculumBrowser } from "@/components/curriculum-browser";
import { getSessionUser } from "@/lib/session";
import { officialSubjects, officialTopics, subjectDbId } from "@/content/study-plan";
import { getLicenseAccess, allowedCareerSubjectIds } from "@/lib/license-career-access";

export async function ProtectedCurriculumPage({
  returnPath,
}: {
  returnPath: "/instructivo" | "/temario";
}) {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  const access = getLicenseAccess(user);
  const allowed = allowedCareerSubjectIds(access);
  const subjects = officialSubjects.filter(
    (subject) => !allowed || allowed.includes(subjectDbId(subject.id)),
  );
  const topics = officialTopics.filter((topic) =>
    subjects.some((subject) => subject.id === topic.subjectId),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <Link href="/estudio" className="text-sm text-pizarron underline">
        ← Volver a mi estudio
      </Link>
      <p className="mt-8 font-display text-sm uppercase tracking-widest text-acento">
        EXCOBA · UAQ · Guía de estudio
      </p>
      <h1 className="mt-2 font-display text-3xl text-pizarron">Tu instructivo, por temas</h1>
      <p className="mt-3 leading-7 text-ink/75">
        Incluye los 209 apartados de las 14 asignaturas del instructivo oficial EXCOBA UAQ 2026-2,
        organizados en primaria, secundaria y bachillerato.{" "}
        {access.careerScope === "SINGLE_CAREER"
          ? "Tu plan muestra únicamente las áreas de tu carrera y la base común. Si aún no la has confirmado, elígela en Estudio."
          : "Al elegir tu carrera verás primero el plan que te corresponde; puedes consultar el temario completo cuando quieras."}
      </p>
      <details className="mt-6 rounded-xl border border-ink/10 bg-white p-4">
        <summary className="cursor-pointer font-medium text-pizarron">
          Cómo es el examen y cómo practicar aquí
        </summary>
        <div className="mt-4 space-y-3 text-sm leading-6 text-ink/75">
          <p>
            El examen reúne 180 preguntas: 40 de primaria, 80 de secundaria y 60 de las tres
            asignaturas de bachillerato que corresponden a tu carrera.
          </p>
          <p>
            Las respuestas oficiales son semiconstruidas: arrastrar elementos, seleccionar elementos
            en textos o imágenes y escribir expresiones numéricas o algebraicas. Una pregunta puede
            requerir una o varias respuestas y admitir puntuación parcial.
          </p>
          <p>
            Organiza tu tiempo: la guía recomienda alrededor de un minuto por pregunta y volver al
            final a las que requieran más trabajo. El demo oficial contiene 45 preguntas para
            conocer la interfaz; no es el temario completo.
          </p>
          <p>
            Aquí practicas con ejercicios propios de opción múltiple y calificación de la
            plataforma. El catálogo cubre todos los temas; el banco de ejercicios todavía no cubre
            cada uno ni reproduce todos los formatos oficiales.
          </p>
        </div>
      </details>
      <CurriculumBrowser
        subjects={subjects.map(({ id, name }) => ({ id, name }))}
        topics={topics.map(({ id, subjectId, name }) => ({ id, subjectId, name }))}
      />
      <p className="mt-8 text-xs leading-5 text-ink/50">
        Temario: instructivo EXCOBA-UAQ Licenciatura 2026-2, páginas 4–16. La selección de carreras
        reúne el Anexo I de 2026-2 y referencias de 2026-1 y 2025-2 identificadas en el selector. La
        oferta y los periodos de ingreso dependen de cada facultad: pertenecer al catálogo no
        significa que haya una convocatoria abierta.
      </p>
      <Link href="/estudio" className="mt-6 inline-block text-sm text-pizarron underline">
        Elegir carrera y continuar →
      </Link>
    </main>
  );
}
