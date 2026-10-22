"use client";

import { SimulatorAnswerBoard } from "./simulator-answer-board";

export function SimulatorQuestionAnswer(props: {
  questionId: string;
  answers: Array<{ id: string; text: string }>;
  answerMode?: "MULTIPLE_CHOICE" | "DRAG_DROP";
  selectedId?: string;
  disabled?: boolean;
  onSelect: (id: string | null) => void;
}) {
  if (props.answerMode === "DRAG_DROP") return <SimulatorAnswerBoard {...props} />;
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-ink/60">Opción múltiple · Selecciona una respuesta.</p>
      {props.answers.map((answer) => (
        <label
          key={answer.id}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${props.selectedId === answer.id ? "border-pizarron bg-pizarron/10" : "border-ink/20 bg-white"}`}
        >
          <input
            type="radio"
            name={`question-${props.questionId}`}
            value={answer.id}
            checked={props.selectedId === answer.id}
            disabled={props.disabled}
            onChange={() => props.onSelect(answer.id)}
            className="accent-pizarron"
          />
          {answer.text}
        </label>
      ))}
      {props.selectedId && (
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => props.onSelect(null)}
          className="min-h-11 text-sm text-ink/60 underline disabled:opacity-50"
        >
          Quitar respuesta
        </button>
      )}
    </div>
  );
}
