"use client";

import Link from "next/link";
import { AttemptFeedback } from "@/components/attempt-feedback";
import type { AttemptReview } from "@/content/attempt-review-types";
import { useEffect, useRef, useState } from "react";
import { CareerSelector, CareerSourceNote, useCareer } from "@/components/career-selector";
import { isCareerSubject, isCommonSubject } from "@/content/subject-rules";
import type { StudySubject } from "@/content/study-types";

type Subject = Omit<StudySubject, "topics">;
type Question = { id: string; text: string; answers: { id: string; text: string }[] };
type Result = AttemptReview;

export default function PracticaPage() {
  const { career, choose, ready, singleCareer } = useCareer();
  const selectedCareerId = career?.id ?? "";
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadedCareerId, setLoadedCareerId] = useState<string | null>(null);
  const [mode, setMode] = useState<"career" | "all">("career");
  const initializedSelection = useRef(false);
  const [subjectKey, setSubjectKey] = useState("");
  const [topicId, setTopicId] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!ready) return;
    if (singleCareer && !selectedCareerId) {
      setLoadingSubjects(false);
      return;
    }
    setLoadingSubjects(true);
    setLoadedCareerId(null);
    const controller = new AbortController();
    fetch("/api/subjects", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "No se pudieron cargar las áreas. Recarga la página o inicia sesión de nuevo.",
          );
        return response.json();
      })
      .then((data: { subjects: Subject[] }) => {
        if (!controller.signal.aborted) {
          setSubjects(data.subjects);
          setLoadedCareerId(selectedCareerId);
        }
      })
      .catch((err: Error) => {
        if (!controller.signal.aborted && err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSubjects(false);
      });
    return () => controller.abort();
  }, [ready, singleCareer, selectedCareerId]);

  useEffect(() => {
    if (
      !ready ||
      !career ||
      loadedCareerId !== career.id ||
      loadingSubjects ||
      initializedSelection.current
    )
      return;
    initializedSelection.current = true;
    const params = new URLSearchParams(window.location.search);
    const subject = subjects.find(
      (s) => s.id === params.get("subject") && s.scope === (params.get("scope") ?? "official"),
    );
    if (subject) {
      setTopicId(params.get("topic") ?? "");
      setSubjectKey(subject.key);
      setMode(
        subject.scope === "extra" || !isCareerSubject(subject.officialId ?? "", career)
          ? "all"
          : "career",
      );
    } else if (!singleCareer && params.get("scope") === "all") {
      setMode("all");
    }
  }, [ready, career, loadedCareerId, loadingSubjects, subjects, singleCareer]);

  async function start() {
    if (!career || (singleCareer && mode === "all")) return;
    const subject = subjects.find((s) => s.key === subjectKey);
    if (subjectKey && (!subject || !subject.questionCount)) return;
    if (
      subject &&
      mode === "career" &&
      (subject.scope !== "official" || !isCareerSubject(subject.officialId ?? "", career))
    )
      return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/practice/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careerId: career.id,
          questionCount: 10,
          subjectId: subject?.id,
          topicId: topicId || undefined,
          scope: subject ? subject.scope : mode,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo iniciar la práctica.");
      if (!data.questions.length)
        throw new Error("Todavía no hay preguntas publicadas para esta selección.");
      setAttemptId(data.attemptId);
      setQuestions(data.questions);
      setSelected({});
      setIndex(0);
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!attemptId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/practice/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          answers: questions.map((q) => ({
            questionId: q.id,
            selectedAnswerId: selected[q.id] ?? null,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo entregar la práctica.");
      setResult(data);
      setAttemptId(null);
      setQuestions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }
  const q = questions[index];
  const sections = [
    {
      name: "Tus tres áreas de bachillerato",
      items: subjects.filter(
        (s) => s.scope === "official" && career?.subjectIds.includes(s.officialId ?? ""),
      ),
    },
    {
      name: "Base común: primaria y secundaria",
      items: subjects.filter((s) => s.scope === "official" && isCommonSubject(s.officialId ?? "")),
    },
    {
      name: "Otras áreas EXCOBA",
      items:
        mode === "all" && !singleCareer
          ? subjects.filter(
              (s) =>
                s.scope === "official" &&
                !isCommonSubject(s.officialId ?? "") &&
                !career?.subjectIds.includes(s.officialId ?? ""),
            )
          : [],
    },
    {
      name: "Contenido complementario",
      items: mode === "all" && !singleCareer ? subjects.filter((s) => s.scope === "extra") : [],
    },
  ];
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl text-pizarron">Práctica</h1>
      {!ready && (
        <p role="status" className="mt-6 text-ink/60">
          Cargando tu selección…
        </p>
      )}
      {ready && !attemptId && !result && (
        <div className="mt-6 space-y-6">
          {!career ? (
            <CareerSelector value="" onChange={choose} />
          ) : (
            <>
              {singleCareer ? (
                <CareerSelector value={career.id} onChange={choose} />
              ) : (
                <details className="text-sm text-ink/70">
                  <summary className="cursor-pointer">{career.name} · Cambiar carrera</summary>
                  <div className="mt-4">
                    <CareerSelector
                      value={career.id}
                      onChange={async (id) => {
                        await choose(id);
                        setTopicId("");
                        setMode("career");
                        setSubjectKey("");
                      }}
                    />
                  </div>
                </details>
              )}
              <CareerSourceNote careerId={career.id} historicalOnly />
              <h2 className="font-display text-xl text-pizarron">¿Qué quieres practicar?</h2>
              <div
                className="grid gap-3 sm:grid-cols-2"
                role="group"
                aria-label="Modalidad de práctica"
              >
                <button
                  type="button"
                  aria-pressed={mode === "career"}
                  onClick={() => {
                    setMode("career");
                    setTopicId("");
                    setSubjectKey("");
                  }}
                  className={`rounded-xl border p-4 text-left ${mode === "career" ? "border-pizarron bg-pizarron text-white" : "border-ink/15 bg-white text-pizarron"}`}
                >
                  <span className="block font-medium">Temas de mi carrera</span>
                  <span className="mt-1 block text-xs leading-5 opacity-80">
                    Tus tres áreas de bachillerato + primaria y secundaria.
                  </span>
                </button>
                {!singleCareer && (
                  <button
                    type="button"
                    aria-pressed={mode === "all"}
                    onClick={() => {
                      setMode("all");
                      setTopicId("");
                      setSubjectKey("");
                    }}
                    className={`rounded-xl border p-4 text-left ${mode === "all" ? "border-pizarron bg-pizarron text-white" : "border-ink/15 bg-white text-pizarron"}`}
                  >
                    <span className="block font-medium">Todos los temas</span>
                    <span className="mt-1 block text-xs leading-5 opacity-80">
                      El temario completo y el contenido complementario.
                    </span>
                  </button>
                )}
              </div>
              <label className="block text-sm text-ink/70">
                ¿Qué área quieres comenzar? <span className="text-ink/50">Opcional</span>
                <select
                  value={subjectKey}
                  onChange={(event) => {
                    setSubjectKey(event.target.value);
                    setTopicId("");
                  }}
                  disabled={loadingSubjects}
                  className="mt-2 w-full rounded-lg border border-ink/20 bg-white p-3"
                >
                  <option value="">
                    {loadingSubjects
                      ? "Cargando áreas…"
                      : mode === "career"
                        ? "Todas las áreas de mi plan"
                        : "Todos los temas disponibles"}
                  </option>
                  {sections
                    .filter((s) => s.items.length > 0)
                    .map((section) => (
                      <optgroup key={section.name} label={section.name}>
                        {section.items.map((subject) => (
                          <option
                            key={subject.key}
                            value={subject.key}
                            disabled={!subject.questionCount}
                          >
                            {subject.name}
                            {!subject.questionCount ? " · Práctica pendiente" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                </select>
              </label>
              {topicId && (
                <p className="text-sm text-ink/65">
                  Repaso dirigido al tema elegido desde tus resultados.{" "}
                  <button
                    type="button"
                    className="min-h-11 text-pizarron underline"
                    onClick={() => setTopicId("")}
                  >
                    Practicar toda la asignatura
                  </button>
                </p>
              )}
              <div className="flex items-center justify-between gap-4 rounded-xl bg-white p-4">
                <p className="text-sm leading-6 text-ink/70">
                  Hasta 10 preguntas por sesión.
                  {!subjectKey &&
                    (mode === "career"
                      ? " Solo tus tres áreas de bachillerato y la base común de primaria y secundaria."
                      : " Primero tus áreas EXCOBA, luego el resto del temario y al final los extras.")}
                </p>
                <button
                  type="button"
                  onClick={start}
                  disabled={
                    loading ||
                    loadingSubjects ||
                    (Boolean(subjectKey) &&
                      !subjects.some((s) => s.key === subjectKey && s.questionCount > 0))
                  }
                  aria-label="Iniciar práctica"
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-pizarron text-white disabled:opacity-40"
                >
                  <span aria-hidden="true">{loading ? "…" : "▶"}</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-5 text-sm text-alerta">
          {error}
        </p>
      )}
      {attemptId && q && (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-ink/60">
            Pregunta {index + 1} de {questions.length} · {Object.keys(selected).length} respondidas
          </p>
          <fieldset className="rounded-xl border border-ink/10 bg-white p-5">
            <legend className="sr-only">Pregunta {index + 1}</legend>
            <p className="leading-7 text-ink">{q.text}</p>
            <div className="mt-5 space-y-3">
              {q.answers.map((answer) => (
                <label
                  key={answer.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink/10 p-3 text-sm leading-6"
                >
                  <input
                    type="radio"
                    name={q.id}
                    checked={selected[q.id] === answer.id}
                    onChange={() => setSelected((previous) => ({ ...previous, [q.id]: answer.id }))}
                    className="mt-1"
                    disabled={loading}
                  />
                  {answer.text}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => setIndex(index - 1)}
              disabled={index === 0 || loading}
              className="rounded-lg border border-ink/20 px-4 py-3 text-sm disabled:opacity-40"
            >
              Anterior
            </button>
            {index < questions.length - 1 ? (
              <button
                onClick={() => setIndex(index + 1)}
                disabled={loading}
                className="rounded-lg bg-pizarron px-4 py-3 text-sm text-white"
              >
                {selected[q.id] ? "Siguiente" : "Omitir y continuar"}
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={loading}
                className="rounded-lg bg-pizarron px-4 py-3 text-sm text-white disabled:opacity-40"
              >
                {loading ? "Guardando…" : "Entregar práctica"}
              </button>
            )}
          </div>
          {index === questions.length - 1 && (
            <p className="text-xs text-ink/60">
              Las preguntas omitidas cuentan como incorrectas. Puedes volver con “Anterior” para
              revisarlas.
            </p>
          )}
        </div>
      )}
      {result && (
        <div className="mt-6 space-y-4 rounded-xl border border-ink/10 bg-white p-6">
          <p className="font-display text-3xl text-pizarron">{Math.round(result.score)}%</p>
          <p className="text-ink/70">
            {result.correctCount} de {result.totalCount} respuestas correctas.
          </p>
          <p className="text-sm text-ink/60">Tu avance se guardó en tu cuenta.</p>
          <div className="flex items-center justify-between gap-4">
            <Link href="/estudio" className="text-sm text-pizarron underline">
              Ver progreso
            </Link>
            <button
              aria-label="Preparar otra práctica"
              onClick={() => {
                setResult(null);
                setTopicId("");
                setMode("career");
                setSubjectKey("");
                setError("");
              }}
              className="grid h-11 w-11 place-items-center rounded-full bg-pizarron text-white"
            >
              <span aria-hidden="true">▶</span>
            </button>
          </div>
          <AttemptFeedback review={result.review} />
        </div>
      )}
    </main>
  );
}
