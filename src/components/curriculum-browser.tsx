"use client";

import { useState } from "react";
import Link from "next/link";
import { CareerSourceNote, useCareer } from "./career-selector";
import { isCareerSubject, isCommonSubject, topicTitle } from "@/content/subject-rules";

type CurriculumSubject = { id: string; name: string };
type CurriculumTopic = { id: string; subjectId: string; name: string };

export function CurriculumBrowser({
  subjects,
  topics,
}: {
  subjects: CurriculumSubject[];
  topics: CurriculumTopic[];
}) {
  const { career, ready, singleCareer } = useCareer();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const visibleSubjects = subjects.filter(
    (subject) => !career || (showAll && !singleCareer) || isCareerSubject(subject.id, career),
  );
  const filtered = topics.filter(
    (topic) =>
      visibleSubjects.some((subject) => subject.id === topic.subjectId) &&
      normalize(topic.id + " " + topic.name).includes(normalize(search)),
  );
  const sections = [
    {
      title: "Tus tres áreas de bachillerato",
      subjects: career ? visibleSubjects.filter((s) => career.subjectIds.includes(s.id)) : [],
    },
    {
      title: "Base común: primaria y secundaria",
      subjects: career ? visibleSubjects.filter((s) => isCommonSubject(s.id)) : [],
    },
    {
      title: career ? "Otras áreas EXCOBA · opcionales para tu plan" : "Todas las asignaturas",
      subjects: visibleSubjects.filter((s) => !career || !isCareerSubject(s.id, career)),
    },
  ];
  if (!ready)
    return (
      <p role="status" className="mt-8 text-sm text-ink/60">
        Cargando tu temario…
      </p>
    );
  if (singleCareer && !career)
    return (
      <p className="mt-8 text-sm leading-6 text-ink/70">
        Tu plan permite una sola carrera.{" "}
        <Link href="/estudio" className="text-pizarron underline">
          Elige y confirma tu carrera
        </Link>{" "}
        para consultar sus temas.
      </p>
    );
  return (
    <section className="mt-8 space-y-6" aria-label="Temas del instructivo oficial EXCOBA">
      {career && (
        <div className="space-y-3 rounded-xl border border-ink/10 bg-white p-4">
          <p className="text-sm font-medium text-pizarron">{career.name}</p>
          <CareerSourceNote careerId={career.id} historicalOnly />
          <p className="text-sm leading-6 text-ink/70">
            Tu plan incluye tres áreas de bachillerato y todas las asignaturas de primaria y
            secundaria.{" "}
            {!singleCareer && "Las otras áreas siguen disponibles si decides ampliar tu estudio."}
          </p>
          <div className="flex flex-wrap items-center gap-4">
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
            <Link href="/estudio" className="text-sm text-pizarron underline">
              Ir a estudiar →
            </Link>
          </div>
        </div>
      )}
      <label className="block text-sm text-ink/70">
        {career && !showAll ? "Buscar en los temas de mi carrera" : "Buscar en todo el instructivo"}
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Por ejemplo: fracciones, herencia o 3.1"
          className="mt-2 w-full rounded-lg border border-ink/20 bg-white p-3"
        />
      </label>
      {search && (
        <p role="status" className="text-sm text-ink/60">
          {filtered.length} temas encontrados{career && !showAll ? " en el plan de tu carrera" : ""}
          .
          {filtered.length === 0 &&
            career &&
            !singleCareer &&
            !showAll &&
            " También puedes activar “Ver todos los temas”."}
        </p>
      )}
      {sections.map((section) => {
        const subjects = section.subjects.filter((subject) =>
          filtered.some((t) => t.subjectId === subject.id),
        );
        return subjects.length ? (
          <section key={section.title} className="space-y-3">
            <h2 className="font-display text-xl text-pizarron">{section.title}</h2>
            {subjects.map((subject) => (
              <details
                key={subject.id}
                open={search ? true : undefined}
                className="rounded-xl border border-ink/10 bg-white p-4"
              >
                <summary className="cursor-pointer font-medium text-pizarron">
                  {subject.name}
                  <span className="ml-2 text-xs font-normal text-ink/50">
                    {filtered.filter((t) => t.subjectId === subject.id).length} temas
                  </span>
                </summary>
                <ul className="mt-4 space-y-2 text-sm leading-6 text-ink/80">
                  {filtered
                    .filter((topic) => topic.subjectId === subject.id)
                    .map((topic) => (
                      <li key={topic.id}>
                        <span className="mr-2 text-xs text-ink/50">{topic.id}</span>
                        {topicTitle(topic.name)}
                      </li>
                    ))}
                </ul>
              </details>
            ))}
          </section>
        ) : null;
      })}
    </section>
  );
}
