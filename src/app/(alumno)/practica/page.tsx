"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CAREER_STORAGE_KEY, type Career, subjectMatchesArea, UAQ_CAREERS_2026_1 } from "@/content/uaq-careers";

interface Subject { id: string; name: string; origin: "OFICIAL" | "PROPIO"; }
interface Answer { id: string; text: string; order: number; }
interface Question { id: string; text: string; difficulty: string; answers: Answer[]; }
interface Result { score: number; correctCount: number; totalCount: number; }

export default function PracticaPage() {
  const searchParams = useSearchParams();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [career, setCareer] = useState<Career | null>(null);
  const [choiceMade, setChoiceMade] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/subjects").then((r) => r.json()).then((data) => {
      setSubjects(data.subjects ?? []); setSubjectId(searchParams.get("subject") ?? "");
      const saved = localStorage.getItem(CAREER_STORAGE_KEY);
      setCareer(UAQ_CAREERS_2026_1.find((item) => item.name === saved) ?? null);
    }).catch(() => setError("No se pudieron cargar las materias."));
  }, [searchParams]);

  async function startPractice() {
    setError(null); setLoading(true); setResult(null);
    try {
      const response = await fetch("/api/practice/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subjectId: subjectId || undefined, questionCount: 10 }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "No se pudo iniciar la práctica."); return; }
      if (data.questions.length === 0) { setError("Todavía no hay preguntas publicadas para esta selección."); return; }
      setAttemptId(data.attemptId); setQuestions(data.questions); setSelected({});
    } catch { setError("No se pudo conectar con el servidor."); } finally { setLoading(false); }
  }

  async function submitPractice() {
    if (!attemptId) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/practice/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId, answers: questions.map((q) => ({ questionId: q.id, selectedAnswerId: selected[q.id] ?? null })) }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "No se pudo entregar la práctica."); return; }
      setResult(data); setQuestions([]); setAttemptId(null);
    } catch { setError("No se pudo conectar con el servidor."); } finally { setLoading(false); }
  }

  const orderedSubjects = [...subjects].sort((a, b) => {
    const rank = (subject: Subject) => subject.origin === "PROPIO" ? 2 : career?.requiredAreas.some((area) => subjectMatchesArea(subject.name, area)) ? 0 : 1;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  return <main className="mx-auto max-w-2xl px-6 py-16">
    <h1 className="font-display text-3xl text-pizarron">Práctica</h1>
    {!attemptId && !result && !career && <div className="mt-8 rounded-lg border border-alerta/30 bg-white p-5 text-sm text-ink/75">Primero selecciona la carrera a la que deseas ingresar. <Link href="/" className="font-medium text-pizarron underline">Elegir carrera</Link></div>}
    {!attemptId && !result && career && !choiceMade && <div className="mt-8 space-y-4"><p className="text-ink/70">Para {career.name}, primero verás: {career.requiredAreas.join(", ")}.</p><h2 className="font-display text-xl text-pizarron">¿Cómo quieres comenzar?</h2><div className="grid gap-3 sm:grid-cols-2"><button onClick={() => setChoiceMade(true)} className="rounded-lg border border-pizarron bg-white p-5 text-left text-pizarron hover:bg-pizarron/5"><span className="font-medium">Elegir un área</span><span className="mt-1 block text-sm text-ink/70">Comienza con una asignatura prioritaria.</span></button><button onClick={() => { setSubjectId(""); setChoiceMade(true); }} className="rounded-lg border border-ink/15 bg-white p-5 text-left text-pizarron hover:bg-pizarron/5"><span className="font-medium">Practicar todos los temas</span><span className="mt-1 block text-sm text-ink/70">Mezcla de todas las asignaturas.</span></button></div></div>}
    {!attemptId && !result && career && choiceMade && <div className="mt-8 flex flex-col gap-4"><label className="flex flex-col gap-1 text-sm text-ink/70">Área para practicar<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-ink"><option value="">Todos los temas</option>{orderedSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.origin === "PROPIO" ? "Extra - " : career.requiredAreas.some((area) => subjectMatchesArea(subject.name, area)) ? "Prioridad - " : ""}{subject.name}</option>)}</select></label><button onClick={startPractice} disabled={loading} className="rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50">{loading ? "Cargando…" : "Empezar práctica (10 preguntas)"}</button></div>}
    {error && <p className="mt-4 text-sm text-alerta">{error}</p>}
    {questions.length > 0 && <div className="mt-8 flex flex-col gap-8">{questions.map((q, index) => <fieldset key={q.id} className="rounded-md border border-ink/10 bg-white p-4"><legend className="px-1 text-sm text-ink/50">Pregunta {index + 1}</legend><p className="font-medium text-ink">{q.text}</p><div className="mt-3 flex flex-col gap-2">{q.answers.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm text-ink/80"><input type="radio" name={q.id} value={a.id} checked={selected[q.id] === a.id} onChange={() => setSelected((prev) => ({ ...prev, [q.id]: a.id }))} />{a.text}</label>)}</div></fieldset>)}<button onClick={submitPractice} disabled={loading} className="rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50">{loading ? "Entregando…" : "Entregar práctica"}</button></div>}
    {result && <div className="mt-8 rounded-md border border-ink/10 bg-white p-6"><p className="font-display text-2xl text-pizarron">{Math.round(result.score)}%</p><p className="mt-1 text-sm text-ink/70">{result.correctCount} de {result.totalCount} respuestas correctas.</p><button onClick={() => { setResult(null); setChoiceMade(false); }} className="mt-4 text-sm text-pizarron underline">Practicar de nuevo</button></div>}
  </main>;
}
