"use client";

import { useRef, useState } from "react";

export function isInsideDropZone(
  x: number,
  y: number,
  rect: { left: number; right: number; top: number; bottom: number },
) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

type Answer = { id: string; text: string };

/** El mismo identificador se guarda al arrastrar, tocar o usar el teclado. */
export function SimulatorAnswerBoard({
  questionId,
  answers,
  selectedId,
  disabled = false,
  onSelect,
}: {
  questionId: string;
  answers: Answer[];
  selectedId?: string;
  disabled?: boolean;
  onSelect: (answerId: string | null) => void;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    pointerId: number;
    answerId: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClickUntil = useRef(0);
  const [drag, setDrag] = useState<{
    answerId: string;
    x: number;
    y: number;
    over: boolean;
  } | null>(null);
  const selected = answers.find((answer) => answer.id === selectedId);
  const dragged = answers.find((answer) => answer.id === drag?.answerId);
  const hintId = `answer-hint-${questionId}`;

  return (
    <div className="mt-4 space-y-4">
      <p id={hintId} className="text-sm leading-6 text-ink/60">
        Arrastra una opción al recuadro. También puedes tocarla o seleccionarla con Tab y Enter.
        Para cambiar tu respuesta, coloca otra opción.
      </p>
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        role="group"
        aria-label="Opciones de respuesta"
        aria-describedby={hintId}
      >
        {answers.map((answer) => (
          <button
            key={answer.id}
            type="button"
            disabled={disabled}
            aria-pressed={answer.id === selectedId}
            className={`min-h-12 touch-none select-none rounded-lg border px-4 py-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pizarron disabled:cursor-not-allowed disabled:opacity-50 ${answer.id === selectedId ? "border-pizarron bg-pizarron/10" : "border-ink/20 bg-white hover:border-pizarron"} ${drag?.answerId === answer.id ? "cursor-grabbing opacity-60" : "cursor-grab"}`}
            onClick={() => {
              if (!disabled && Date.now() > suppressClickUntil.current) onSelect(answer.id);
            }}
            onPointerDown={(event) => {
              if (disabled || !event.isPrimary || event.button !== 0) return;
              gesture.current = {
                pointerId: event.pointerId,
                answerId: answer.id,
                x: event.clientX,
                y: event.clientY,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const active = gesture.current;
              if (!active || active.pointerId !== event.pointerId || disabled) return;
              if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 6)
                active.moved = true;
              if (!active.moved) return;
              const rect = targetRef.current?.getBoundingClientRect();
              setDrag({
                answerId: active.answerId,
                x: event.clientX,
                y: event.clientY,
                over: !!rect && isInsideDropZone(event.clientX, event.clientY, rect),
              });
            }}
            onPointerUp={(event) => {
              const active = gesture.current;
              if (!active || active.pointerId !== event.pointerId) return;
              if (active.moved) {
                suppressClickUntil.current = Date.now() + 300;
                const rect = targetRef.current?.getBoundingClientRect();
                if (!disabled && rect && isInsideDropZone(event.clientX, event.clientY, rect))
                  onSelect(active.answerId);
              }
              gesture.current = null;
              setDrag(null);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              gesture.current = null;
              setDrag(null);
            }}
            onLostPointerCapture={() => {
              gesture.current = null;
              setDrag(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                gesture.current = null;
                setDrag(null);
              }
            }}
          >
            <span aria-hidden="true" className="mr-2 text-ink/40">
              ⠿
            </span>
            {answer.text}
          </button>
        ))}
      </div>
      <div
        ref={targetRef}
        data-testid="answer-drop-zone"
        className={`flex min-h-24 items-center justify-between gap-3 rounded-lg border-2 border-dashed p-4 ${drag?.over ? "border-pizarron bg-pizarron/10" : "border-ink/25 bg-paper"}`}
      >
        <p role="status" className="text-sm text-pizarron">
          <span className="block text-xs uppercase tracking-wide text-ink/50">Tu respuesta</span>
          <span className="mt-1 block font-medium">
            {selected?.text ?? "Suelta aquí una opción"}
          </span>
        </p>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            disabled={disabled}
            className="min-h-11 px-2 text-sm text-ink/60 underline disabled:opacity-50"
          >
            Quitar
          </button>
        )}
      </div>
      {drag && dragged && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 max-w-[70vw] rounded-lg border border-pizarron bg-white px-4 py-3 text-sm shadow-xl"
          style={{ left: drag.x, top: drag.y, transform: "translate(-50%, -120%)" }}
        >
          {dragged.text}
        </div>
      )}
    </div>
  );
}
