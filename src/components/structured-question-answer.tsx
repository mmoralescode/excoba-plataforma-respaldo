"use client";
import { useRef, useState } from "react";
import type { InteractionPrompt, StructuredResponse } from "@/content/interaction-types";

export function StructuredQuestionAnswer({
  questionId,
  interaction,
  value = {},
  disabled,
  onChange,
}: {
  questionId: string;
  interaction: InteractionPrompt;
  value?: StructuredResponse;
  disabled: boolean;
  onChange: (value: StructuredResponse) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const drag = useRef<{ id: string; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const place = (item: string, target: string) => {
    if (disabled) return;
    const placements = { ...value.placements };
    if (target) placements[item] = target;
    else delete placements[item];
    onChange({ placements });
    setPicked(null);
  };
  if (interaction.kind === "numeric" || interaction.kind === "algebra")
    return (
      <div className="mt-4 space-y-2">
        <label htmlFor={questionId + "-response"} className="block text-sm">
          Tu respuesta
        </label>
        <input
          id={questionId + "-response"}
          value={value.text ?? ""}
          disabled={disabled}
          maxLength={120}
          autoComplete="off"
          spellCheck={false}
          inputMode={interaction.kind === "numeric" ? "decimal" : "text"}
          onChange={(event) => onChange({ text: event.target.value })}
          aria-describedby={questionId + "-hint"}
          className="min-h-11 w-full rounded-md border border-ink/20 px-3 text-lg"
        />
        <p id={questionId + "-hint"} className="text-sm text-ink/60">
          {interaction.hint}
        </p>
      </div>
    );
  if (interaction.kind === "match")
    return (
      <div className="mt-4 space-y-4">
        <p className="text-sm text-ink/65">
          Arrastra cada ficha a su categoría, o selecciónala y pulsa el destino. También puedes usar
          los selectores. Cada relación correcta suma una parte del punto.
        </p>
        <div className="flex flex-wrap gap-2">
          {interaction.items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              aria-pressed={picked === item.id}
              className={`min-h-11 touch-none rounded-md border px-3 py-2 text-sm ${picked === item.id ? "border-pizarron bg-pizarron text-white" : "border-ink/20 bg-paper"}`}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                setPicked(item.id);
              }}
              onPointerDown={(event) => {
                if (disabled || event.button !== 0 || event.isPrimary === false) return;
                setPicked(item.id);
                drag.current = { id: item.id, x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onPointerUp={(event) => {
                const start = drag.current;
                drag.current = null;
                if (
                  !start ||
                  disabled ||
                  Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
                )
                  return;
                suppressClick.current = true;
                const zone = document
                  .elementFromPoint(event.clientX, event.clientY)
                  ?.closest<HTMLElement>("[data-match-target]");
                if (zone?.dataset.question === questionId && zone.dataset.matchTarget)
                  place(start.id, zone.dataset.matchTarget);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {interaction.targets.map((target) => (
            <button
              key={target.id}
              type="button"
              disabled={disabled}
              data-match-target={target.id}
              data-question={questionId}
              onClick={() => picked && place(picked, target.id)}
              className="min-h-20 rounded-md border-2 border-dashed border-ink/25 p-3 text-left text-sm"
            >
              <span className="font-medium">{target.label}</span>
              <span className="mt-2 block text-ink/65">
                {interaction.items
                  .filter((item) => value.placements?.[item.id] === target.id)
                  .map((item) => item.label)
                  .join(", ") || "Ubica aquí"}
              </span>
            </button>
          ))}
        </div>
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2">
            Asignar o cambiar con selectores
          </summary>
          {interaction.items.map((item) => (
            <label key={item.id} className="mt-2 block">
              {item.label}
              <select
                disabled={disabled}
                value={value.placements?.[item.id] ?? ""}
                onChange={(event) => place(item.id, event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-ink/20 bg-white px-2"
              >
                <option value="">Sin ubicar</option>
                {interaction.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </details>
        <p role="status" className="text-sm text-ink/60">
          {Object.keys(value.placements ?? {}).length} de {interaction.items.length} elementos
          ubicados.
        </p>
      </div>
    );
  if (interaction.kind === "multi")
    return (
      <fieldset disabled={disabled} className="mt-4 space-y-3">
        <legend className="mb-2 text-sm">
          Selecciona hasta {interaction.required} elementos. Cada acierto suma una parte del punto.
        </legend>
        {interaction.items.map((item) => (
          <label
            key={item.id}
            className="flex min-h-11 items-center gap-3 rounded-md border border-ink/15 px-3"
          >
            <input
              type="checkbox"
              checked={value.selected?.includes(item.id) ?? false}
              onChange={(event) => {
                const selected = value.selected ?? [];
                if (event.target.checked && selected.length >= interaction.required) return;
                onChange({
                  selected: event.target.checked
                    ? [...selected, item.id]
                    : selected.filter((id) => id !== item.id),
                });
              }}
            />
            {item.label}
          </label>
        ))}
      </fieldset>
    );
  if (interaction.kind !== "image") return null;
  return (
    <div className="mt-4">
      <svg
        viewBox="0 0 320 190"
        className="mx-auto w-full max-w-sm"
        role="img"
        aria-label="Triángulo rectángulo: cateto vertical A, cateto horizontal B y lado inclinado C; ángulo recto en el vértice inferior izquierdo."
      >
        <path d="M40 40 V150 H280 Z" fill="none" stroke="#203d4b" strokeWidth="3" />
        <path d="M40 133 H57 V150" fill="none" stroke="#203d4b" strokeWidth="2" />
        {interaction.regions.map((region) => (
          <g
            key={region.id}
            onClick={() => !disabled && onChange({ text: region.id })}
            className={disabled ? "" : "cursor-pointer"}
          >
            <circle
              cx={region.x}
              cy={region.y}
              r="22"
              fill={value.text === region.id ? "#203d4b" : "#faf8f2"}
              stroke="#203d4b"
            />
            <text
              x={region.x}
              y={region.y + 5}
              textAnchor="middle"
              fill={value.text === region.id ? "white" : "#203d4b"}
            >
              {region.id.toUpperCase()}
            </text>
          </g>
        ))}
      </svg>
      <fieldset disabled={disabled} className="flex flex-wrap gap-3">
        <legend className="mb-2 text-sm">Selecciona sobre el esquema o utiliza una opción:</legend>
        {interaction.regions.map((region) => (
          <label key={region.id} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name={questionId}
              checked={value.text === region.id}
              onChange={() => onChange({ text: region.id })}
            />
            {region.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
