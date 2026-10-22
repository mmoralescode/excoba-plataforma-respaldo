"use client";

import { useEffect, useState } from "react";
import { CAREER_STORAGE_KEY, UAQ_CAREERS_2026_1 } from "@/content/uaq-careers";

export function CareerPicker() {
  const [career, setCareer] = useState("");

  useEffect(() => setCareer(localStorage.getItem(CAREER_STORAGE_KEY) ?? ""), []);

  function choose(value: string) {
    setCareer(value);
    if (value) localStorage.setItem(CAREER_STORAGE_KEY, value);
  }

  const selected = UAQ_CAREERS_2026_1.find((item) => item.name === career);
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        ¿A qué carrera quieres ingresar?
        <select value={career} onChange={(event) => choose(event.target.value)} className="rounded-md border border-ink/20 bg-paper px-3 py-3 text-ink">
          <option value="">Selecciona tu carrera</option>
          {UAQ_CAREERS_2026_1.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
      </label>
      {selected && <p className="mt-3 text-sm text-ink/70">Priorizaremos: {selected.requiredAreas.join(", ")}.</p>}
    </section>
  );
}
