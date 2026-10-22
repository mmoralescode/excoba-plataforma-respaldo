"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Answer {
  id: string;
  text: string;
}

interface Question {
  id: string;
  text: string;
  subjectId: string;
  answers: Answer[];
}

interface Result {
  score: number;
  correctCount: number;
  totalCount: number;
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SimuladorPage() {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attemptIdRef = useRef<string | null>(null);
  const questionsRef = useRef<Question[]>([]);
  const selectedRef = useRef<Record<string, string>>({});
  attemptIdRef.current = attemptId;
  questionsRef.current = questions;
  selectedRef.current = selected;

  const submitSimulator = useCallback(async () => {
    if (!attemptIdRef.current) return;
    setLoading(true);
    try {
      const response = await fetch("/api/simulator/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: attemptIdRef.current,
          answers: questionsRef.current.map((q) => ({
            questionId: q.id,
            selectedAnswerId: selectedRef.current[q.id] ?? null,
          })),
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setResult(data);
        setQuestions([]);
        setAttemptId(null);
      } else {
        setError(data.error ?? "No se pudo entregar el simulador.");
      }
    } catch {
      setError("No se pudo conectar con el servidor al entregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Cronómetro visual: cuenta hacia abajo localmente cada segundo, pero el
  // valor real siempre viene del servidor (ver efecto de sincronización
  // abajo) — el navegador nunca decide cuándo se acaba el tiempo.
  useEffect(() => {
    if (remainingSeconds === null || !attemptId) return;
    if (remainingSeconds <= 0) {
      submitSimulator();
      return;
    }
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => (prev !== null ? Math.max(0, prev - 1) : prev));
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSeconds, attemptId, submitSimulator]);

  // Sincroniza el tiempo restante real contra el servidor cada 20s, y al
  // recuperar el intento tras una desconexión.
  useEffect(() => {
    if (!attemptId) return;
    const sync = async () => {
      try {
        const response = await fetch(`/api/simulator/answer?attemptId=${attemptId}`);
        const data = await response.json();
        if (response.ok) {
          setRemainingSeconds(data.remainingSeconds);
        }
      } catch {
        // Silencioso: si falla la sincronización puntual, el cronómetro
        // local sigue corriendo hasta el próximo intento.
      }
    };
    const interval = setInterval(sync, 20_000);
    return () => clearInterval(interval);
  }, [attemptId]);

  async function startSimulator() {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/simulator/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionCount: 20, timeLimitSeconds: 20 * 60 }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo iniciar el simulador.");
        return;
      }
      if (data.questions.length === 0) {
        setError("Todavía no hay preguntas publicadas para el simulador.");
        return;
      }
      setAttemptId(data.attemptId);
      setQuestions(data.questions);
      setRemainingSeconds(data.timeLimitSeconds);
      setSelected({});
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function selectAnswer(questionId: string, answerId: string) {
    setSelected((prev) => ({ ...prev, [questionId]: answerId }));
    if (!attemptId) return;
    // Autosave: se guarda de inmediato en el servidor para poder recuperar
    // el intento si hay una desconexión (ver Módulo 8).
    fetch("/api/simulator/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId, questionId, selectedAnswerId: answerId }),
    }).catch(() => {
      /* el siguiente autosave o la entrega final lo reintentan */
    });
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl text-pizarron">Simulador</h1>
        {remainingSeconds !== null && attemptId && (
          <p className="font-display text-2xl text-acento">{formatTime(remainingSeconds)}</p>
        )}
      </div>

      {!attemptId && !result && (
        <div className="mt-8">
          <p className="text-sm text-ink/60">
            20 preguntas, 20 minutos. El tiempo se controla en el servidor: si cierras la pestaña
            y vuelves, tu progreso y el tiempo restante real se recuperan automáticamente.
          </p>
          <button
            onClick={startSimulator}
            disabled={loading}
            className="mt-4 rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Empezar simulador"}
          </button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-alerta">{error}</p>}

      {questions.length > 0 && (
        <div className="mt-8 flex flex-col gap-8">
          {questions.map((q, index) => (
            <fieldset key={q.id} className="rounded-md border border-ink/10 bg-white p-4">
              <legend className="px-1 text-sm text-ink/50">Pregunta {index + 1}</legend>
              <p className="font-medium text-ink">{q.text}</p>
              <div className="mt-3 flex flex-col gap-2">
                {q.answers.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm text-ink/80">
                    <input
                      type="radio"
                      name={q.id}
                      value={a.id}
                      checked={selected[q.id] === a.id}
                      onChange={() => selectAnswer(q.id, a.id)}
                    />
                    {a.text}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <button
            onClick={submitSimulator}
            disabled={loading}
            className="rounded-md bg-pizarron px-4 py-2 text-white transition hover:bg-pizarron/90 disabled:opacity-50"
          >
            {loading ? "Entregando…" : "Entregar simulador"}
          </button>
        </div>
      )}

      {result && (
        <div className="mt-8 rounded-md border border-ink/10 bg-white p-6">
          <p className="font-display text-2xl text-pizarron">{Math.round(result.score)}%</p>
          <p className="mt-1 text-sm text-ink/70">
            {result.correctCount} de {result.totalCount} respuestas correctas.
          </p>
          <button onClick={() => setResult(null)} className="mt-4 text-sm text-pizarron underline">
            Hacer otro simulador
          </button>
        </div>
      )}
    </main>
  );
}
