"use client";

import { useId, useRef, useState } from "react";
import { formulaSheet } from "@/content/formula-sheet";
import { FormulaNotation } from "./formula-notation";

export function SimulatorFormulaSheet() {
  const [activeSubject, setActiveSubject] = useState(0);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const current = formulaSheet[activeSubject]!;
  return (
    <details className="mt-6 rounded-lg border border-ink/15 bg-white p-4">
      <summary className="cursor-pointer font-medium text-pizarron">
        Formulario · Física, Química y Matemáticas
      </summary>
      <p className="mt-3 text-xs leading-5 text-ink/60">
        Apoyo general de nuestra plataforma: fórmulas, símbolos y unidades. No contiene respuestas
        ni soluciones. Consultarlo no pausa el cronómetro.
      </p>
      <div
        className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-paper p-1"
        role="group"
        aria-label="Materia del formulario"
      >
        {formulaSheet.map(({ subject }, index) => (
          <button
            key={subject}
            type="button"
            aria-pressed={activeSubject === index}
            aria-controls={panelId}
            onClick={() => {
              setActiveSubject(index);
              if (panelRef.current) panelRef.current.scrollTop = 0;
            }}
            className={`min-h-11 rounded-md px-2 py-2 text-xs font-medium transition sm:text-sm ${activeSubject === index ? "bg-pizarron text-white" : "text-ink/65 hover:bg-white"}`}
          >
            {subject}
          </button>
        ))}
      </div>
      <div
        ref={panelRef}
        id={panelId}
        className="mt-4 max-h-[26rem] overflow-y-auto overscroll-contain pr-2"
        tabIndex={0}
        role="region"
        aria-label={`Fórmulas de ${current.subject}`}
      >
        <section key={current.subject}>
          <h2 className="sr-only">{current.subject}</h2>
          <dl className="divide-y divide-ink/10">
            {current.formulas.map(([name, formula, meaning]) => (
              <div key={name} className="py-4 first:pt-0 last:pb-0">
                <dt className="text-sm font-medium text-pizarron">{name}</dt>
                <dd className="mt-1 min-w-0 text-ink">
                  <FormulaNotation name={name} fallback={formula} />
                  <span className="block text-xs leading-5 text-ink/65">{meaning}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </details>
  );
}
