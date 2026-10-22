"use client";

import Link from "next/link";
import { useState } from "react";
import { CareerSelector, CareerSourceNote, useCareer } from "./career-selector";
import { isCommonSubject } from "@/content/subject-rules";
import type { StudySubject } from "@/content/study-types";

export function StudyDashboard({ subjects }: { subjects: StudySubject[] }) {
  const { career, choose, ready, singleCareer } = useCareer();
  const [showAll, setShowAll] = useState(false);
  const groups = [
    {
      title: "Tus tres áreas de bachillerato",
      visible: true,
      items: subjects.filter(
        (s) => s.scope === "official" && career?.subjectIds.includes(s.officialId ?? ""),
      ),
    },
    {
      title: "Base común: primaria y secundaria",
      visible: true,
      items: subjects.filter((s) => s.scope === "official" && isCommonSubject(s.officialId ?? "")),
    },
    {
      title: "Otras áreas EXCOBA · opcionales para tu plan",
      visible: showAll && !singleCareer,
      items: subjects.filter(
        (s) =>
          s.scope === "official" &&
          !isCommonSubject(s.officialId ?? "") &&
          !career?.subjectIds.includes(s.officialId ?? ""),
      ),
    },
    {
      title: "Contenido complementario · opcional",
      visible: showAll && !singleCareer,
      items: subjects.filter((s) => s.scope === "extra"),
    },
  ];
  if (!ready)
    return (
      <p className="mt-8 text-ink/60" role="status">
        Cargando tu ruta…
      </p>
    );
  return (
    <div className="mt-6 space-y-8">
      {!career ? (
        <CareerSelector value="" onChange={choose} />
      ) : singleCareer ? (
        <CareerSelector value={career.id} onChange={choose} />
      ) : (
        <details className="rounded-xl border border-ink/10 bg-white p-4 text-sm text-ink/70">
          <summary className="cursor-pointer">{career.name} · Cambiar carrera</summary>
          <div className="mt-4">
            <CareerSelector
              value={career.id}
              onChange={async (id) => {
                await choose(id);
                setShowAll(false);
              }}
            />
          </div>
        </details>
      )}
      {career && (
        <>
          <CareerSourceNote careerId={career.id} historicalOnly />
          <div className="space-y-4">
            <p className="text-sm leading-6 text-ink/75">
              Empieza por tus tres áreas de bachillerato y continúa con primaria y secundaria, que
              se evalúan en todas las carreras. Abre una asignatura para estudiar sus temas y
              lecciones; usa ▶ cuando quieras practicar.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-4">
              {!singleCareer && (
                <button
                  type="button"
                  aria-pressed={showAll}
                  onClick={() => setShowAll(!showAll)}
                  className="min-h-11 rounded-lg border border-ink/20 px-4 py-2 text-sm text-pizarron"
                >
                  {showAll ? "Ver solo los temas de mi carrera" : "Ver todos los temas"}
                </button>
              )}
              <Link
                href={`/practica?scope=${showAll && !singleCareer ? "all" : "career"}`}
                aria-label={
                  showAll ? "Practicar todos los temas" : "Practicar los temas de mi carrera"
                }
                title={showAll ? "Practicar todos los temas" : "Practicar los temas de mi carrera"}
                className="grid h-11 w-11 place-items-center rounded-full bg-pizarron text-white"
              >
                <span aria-hidden="true">▶</span>
              </Link>
            </div>
          </div>
          <p className="text-sm leading-6 text-ink/65">
            Tu avance indica en cuántos temas has respondido al menos una pregunta y entregado la
            práctica. No mide dominio: puedes repasar tantas veces como quieras.
          </p>
          {groups
            .filter((group) => group.visible && group.items.length > 0)
            .map((group) => (
              <section key={group.title} className="space-y-3">
                <h2 className="font-display text-xl text-pizarron">{group.title}</h2>
                {group.items.map((subject) => (
                  <article
                    key={subject.key}
                    className="rounded-xl border border-ink/10 bg-white p-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium text-pizarron">{subject.name}</h3>
                        <progress
                          aria-label={`Avance en ${subject.name}`}
                          value={subject.percent}
                          max={100}
                          className="mt-2 block h-2 w-full"
                        />
                        <p className="mt-2 text-xs text-ink/60">
                          {subject.answered} de {subject.topics.length} temas · {subject.percent}%
                        </p>
                      </div>
                      {subject.questionCount > 0 ? (
                        <Link
                          href={`/practica?subject=${encodeURIComponent(subject.id)}&scope=${subject.scope}`}
                          aria-label={`Practicar ${subject.name}`}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pizarron text-white"
                        >
                          <span aria-hidden="true">▶</span>
                        </Link>
                      ) : (
                        <span className="max-w-24 text-right text-xs text-ink/50">
                          Práctica pendiente
                        </span>
                      )}
                    </div>
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-ink/65">Temas y lecciones</summary>
                      <ul className="mt-3 space-y-3">
                        {subject.topics.map((topic) => (
                          <li key={topic.id} className="border-t border-ink/5 pt-2">
                            <p>
                              {topic.answered && (
                                <span aria-label="Respondido" className="mr-2 text-pizarron">
                                  ✓
                                </span>
                              )}
                              {topic.name}
                            </p>
                            {topic.lessons.map((lesson) => (
                              <details key={lesson.id} className="mt-2 text-ink/70">
                                <summary className="cursor-pointer">{lesson.title}</summary>
                                <p className="mt-2 whitespace-pre-wrap leading-6">
                                  {lesson.content}
                                </p>
                              </details>
                            ))}
                            {topic.lessons.length === 0 && (
                              <p className="mt-1 text-xs text-ink/50">
                                Tema incluido en tu plan; la lección aún no está publicada.
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </article>
                ))}
              </section>
            ))}
        </>
      )}
    </div>
  );
}
