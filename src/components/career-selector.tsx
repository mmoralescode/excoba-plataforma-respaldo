"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useLicenseAccess, type LicenseAccess } from "./license-access-provider";
import { careers, CAREER_COOKIE, getCareer } from "@/content/career-catalog";
import { subjectName } from "@/content/subject-catalog";
import sourceCatalog from "@/content/career-sources.json";

const careerSources = sourceCatalog.careers as Record<
  string,
  { sourceId: string; aliases: string[] }
>;
const sources = sourceCatalog.sources as Record<string, { title: string; url: string | null }>;

const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
const sortedCareers = [...careers].sort((a, b) => a.name.localeCompare(b.name, "es"));

export function CareerSourceNote({
  careerId,
  historicalOnly = false,
}: {
  careerId: string;
  historicalOnly?: boolean;
}) {
  const sourceId = careerSources[careerId]?.sourceId;
  const source = sourceId ? sources[sourceId] : null;
  const historical = sourceId !== "uaq-2026-2";
  if (!source || (historicalOnly && !historical)) return null;
  return (
    <p
      className={`text-xs leading-5 ${historical ? "rounded-lg border border-acento/30 bg-white p-3 text-ink/75" : "text-ink/50"}`}
    >
      Áreas según{" "}
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer" className="underline">
          {source.title}
        </a>
      ) : (
        source.title
      )}
      .
      {historical &&
        " Referencia de un ciclo anterior: este programa no aparece en el Anexo 2026-2. Confirma las áreas y la apertura de ingreso con tu facultad."}
    </p>
  );
}

export function useCareer() {
  const context = useLicenseAccess();
  const router = useRouter();
  const singleCareer = context?.access.careerScope === "SINGLE_CAREER";
  const [careerId, setCareerId] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => {
      const value = document.cookie
        .split("; ")
        .find((entry) => entry.startsWith(CAREER_COOKIE + "="))
        ?.split("=")[1];
      setCareerId(getCareer(value)?.id ?? "");
      setReady(true);
    };
    read();
    window.addEventListener("excoba:career", read);
    return () => window.removeEventListener("excoba:career", read);
  }, []);
  async function choose(id: string) {
    const valid = getCareer(id)?.id ?? "";
    if (singleCareer) {
      if (!valid) throw new Error("Elige una carrera válida.");
      const response = await fetch("/api/license-access/career", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careerId: valid }),
      });
      const data = await response.json();
      if (!response.ok) {
        // Another tab/device may have confirmed a different career first.
        // Reload the authoritative plan instead of leaving a stale empty selector.
        if (response.status === 409 || response.status === 401) router.refresh();
        throw new Error(data.error ?? "No se pudo guardar tu carrera. Intenta nuevamente.");
      }
      context?.update(data as LicenseAccess);
      router.refresh();
      return;
    }
    document.cookie = `${CAREER_COOKIE}=${valid}; Path=/; Max-Age=${valid ? 31536000 : 0}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setCareerId(valid);
    window.dispatchEvent(new Event("excoba:career"));
  }
  return {
    career: getCareer(singleCareer ? (context?.access.selectedCareerId ?? "") : careerId),
    choose,
    ready,
    singleCareer,
  };
}

export function CareerSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void | Promise<void>;
}) {
  const context = useLicenseAccess();
  const singleCareer = context?.access.careerScope === "SINGLE_CAREER";
  const lockedCareer = singleCareer ? getCareer(context?.access.selectedCareerId ?? "") : null;
  const id = useId();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const career = getCareer(pending ?? value);
  const matches = sortedCareers.filter((item) =>
    [item.name, ...(careerSources[item.id]?.aliases ?? [])].some((name) =>
      normalizeSearch(name).includes(normalizeSearch(search)),
    ),
  );
  const keepSelection = career && !matches.some((item) => item.id === career.id);
  if (lockedCareer)
    return (
      <div className="space-y-2 rounded-lg border border-pizarron/20 bg-white p-4 text-sm">
        <p className="font-medium text-pizarron">{lockedCareer.name}</p>
        <p className="leading-6 text-ink/70">
          Plan de 2 meses · Una sola carrera. Esta elección está vinculada a tu cuenta y no se puede
          cambiar.
        </p>
      </div>
    );
  async function confirmCareer() {
    if (!pending || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onChange(pending);
      setPending(null);
      setSearch("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar tu carrera.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-3">
      {singleCareer && (
        <p className="rounded-lg border border-acento/30 bg-white p-3 text-sm leading-6">
          Tu plan dura 2 meses y permite una sola carrera. Revisa el nombre y campus antes de
          confirmar; no podrás cambiar tu elección.
        </p>
      )}
      <label htmlFor={`${id}-search`} className="sr-only">
        Buscar carrera o campus
      </label>
      <input
        id={`${id}-search`}
        type="search"
        value={search}
        disabled={saving}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar carrera o campus, por ejemplo: Actuaría"
        autoComplete="off"
        aria-describedby={`${id}-results`}
        className="w-full rounded-lg border border-ink/20 bg-white p-3 text-sm focus:outline-pizarron"
      />
      <select
        id={id}
        aria-label="Carrera"
        value={pending ?? value}
        disabled={saving}
        onChange={(event) => {
          if (singleCareer) setPending(event.target.value || null);
          else void onChange(event.target.value);
          setError(null);
          setSearch("");
        }}
        className="w-full min-w-0 rounded-lg border border-ink/20 bg-white p-3 text-sm focus:outline-pizarron"
      >
        <option value="">Selecciona tu carrera</option>
        {keepSelection && (
          <optgroup label="Carrera seleccionada">
            <option value={career.id}>{career.name}</option>
          </optgroup>
        )}
        {matches.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      {singleCareer && pending && career && (
        <div
          role="group"
          aria-label="Confirmar mi única carrera"
          className="space-y-3 rounded-lg border border-acento/40 bg-white p-4 text-sm leading-6"
        >
          <p>
            Vas a elegir <strong>{career.name}</strong>. Será la única carrera disponible en tu
            plan. Esta elección no se puede cambiar.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={confirmCareer}
              className="min-h-11 rounded-lg bg-pizarron px-4 py-2 text-white disabled:opacity-50"
            >
              {saving ? "Guardando carrera…" : "Confirmar mi única carrera"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setPending(null)}
              className="min-h-11 rounded-lg border border-ink/20 px-4 py-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-alerta">
          {error}
        </p>
      )}
      <p id={`${id}-results`} role="status" className="text-xs text-ink/50">
        {matches.length
          ? `${matches.length} opciones de carrera y campus${search ? " encontradas" : " disponibles"}.`
          : "No hay coincidencias. Prueba con otro nombre o campus."}
      </p>
      {career && (
        <div className="space-y-2 text-sm leading-6 text-ink/70">
          <p>
            Tus tres áreas de bachillerato:{" "}
            {career.subjectIds
              .map((subjectId) => subjectName(subjectId)?.split(" · ")[1])
              .filter(Boolean)
              .join(", ")}
            .
          </p>
          <p>
            También debes estudiar primaria y secundaria: son la base común del examen para todas
            las carreras.
          </p>
        </div>
      )}
      {career && <CareerSourceNote careerId={career.id} />}
      <p className="text-xs text-ink/50">
        Catálogo de carreras y campus, no de convocatorias abiertas. La elección se guarda en este
        navegador para los planes de todas las carreras. En el plan de una carrera, la elección
        confirmada se guarda en tu cuenta.
      </p>
    </div>
  );
}
