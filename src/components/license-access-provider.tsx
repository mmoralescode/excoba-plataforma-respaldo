"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { getCareer } from "@/content/career-catalog";

export type LicenseAccess = {
  validityMonths: number | null;
  careerScope: "ALL_CAREERS" | "SINGLE_CAREER";
  selectedCareerId: string | null;
  careerSelectedAt: string | null;
  startsAt: string | null;
  expiresAt: string | null;
};

const AccessContext = createContext<{
  access: LicenseAccess;
  update: (access: LicenseAccess) => void;
} | null>(null);

export function LicenseAccessProvider({
  initialAccess,
  children,
}: {
  initialAccess: LicenseAccess;
  children: React.ReactNode;
}) {
  const [access, update] = useState(initialAccess);
  useEffect(() => update(initialAccess), [initialAccess]);
  return <AccessContext.Provider value={{ access, update }}>{children}</AccessContext.Provider>;
}

export const useLicenseAccess = () => useContext(AccessContext);

function dateLabel(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "Sin fecha configurada";
  return new Date(value).toLocaleDateString("es-MX", {
    dateStyle: "long",
    timeZone: "America/Mexico_City",
  });
}

export function LicenseAccessBanner() {
  const context = useLicenseAccess();
  if (!context) return null;
  const { access } = context;
  return (
    <aside aria-label="Resumen de tu acceso" className="border-b border-pizarron/15 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
        <p className="text-ink/75">
          {access.validityMonths ? `${access.validityMonths} meses` : "Tu acceso"}
          {" · "}
          {access.careerScope === "SINGLE_CAREER" ? "Una sola carrera" : "Todas las carreras"}
          {access.expiresAt && <> · Vence el {dateLabel(access.expiresAt)}</>}
        </p>
        <Link href="/mi-acceso" className="text-pizarron underline">
          Ver mi acceso
        </Link>
      </div>
    </aside>
  );
}

export function LicenseAccessDetails() {
  const context = useLicenseAccess();
  if (!context) return <p role="status">Cargando tu acceso…</p>;
  const { access } = context;
  const singleCareer = access.careerScope === "SINGLE_CAREER";
  const career = getCareer(access.selectedCareerId ?? "");
  return (
    <section className="mt-6 space-y-5 rounded-xl border border-ink/10 bg-white p-5 sm:p-6">
      <h2 className="font-display text-xl text-pizarron">
        {access.validityMonths ? `Plan de ${access.validityMonths} meses` : "Tu licencia"}
      </h2>
      <dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink/60">Duración</dt>
        <dd>
          {access.validityMonths
            ? `${access.validityMonths} meses naturales desde la activación`
            : "Según tu licencia"}
        </dd>
        <dt className="text-ink/60">Inicio del acceso</dt>
        <dd>{dateLabel(access.startsAt)}</dd>
        <dt className="text-ink/60">Fecha de vencimiento</dt>
        <dd>{dateLabel(access.expiresAt)}</dd>
        <dt className="text-ink/60">Carreras incluidas</dt>
        <dd>{singleCareer ? "Una sola carrera" : "Todas las carreras del catálogo"}</dd>
        {singleCareer && (
          <>
            <dt className="text-ink/60">Tu carrera</dt>
            <dd>{career?.name ?? "Pendiente de elegir"}</dd>
          </>
        )}
      </dl>
      {singleCareer ? (
        <div className="space-y-2 rounded-lg border border-acento/30 bg-paper p-4 text-sm leading-6 text-ink/80">
          <p className="font-medium">Tu plan de 2 meses da acceso a una sola carrera.</p>
          <p>
            {career
              ? "Esta es la primera carrera que confirmaste y queda vinculada a tu cuenta. No puedes cambiarla durante la vigencia de este acceso, aunque uses otro dispositivo."
              : "Elige con cuidado: la primera carrera que confirmes quedará vinculada a tu cuenta y no podrás cambiarla durante la vigencia de este acceso."}
          </p>
          <p>
            Incluye sus tres áreas de bachillerato y la base común de primaria y secundaria. No
            incluye las otras carreras ni áreas complementarias.
          </p>
        </div>
      ) : (
        <p className="text-sm leading-6 text-ink/75">
          Puedes elegir y cambiar de carrera, consultar todas las áreas y practicar sus temas
          durante la vigencia de tu acceso.
        </p>
      )}
      <p className="text-sm leading-6 text-ink/65">
        La vigencia comenzó al completar la creación de tu cuenta, no al recibir el folio. Elegir
        carrera después no reinicia ni amplía ese plazo.
      </p>
      <Link
        href="/estudio"
        className="inline-flex min-h-11 items-center rounded-lg bg-pizarron px-4 py-2 text-sm text-white"
      >
        {singleCareer && !career ? "Elegir mi única carrera" : "Continuar estudiando"}
      </Link>
    </section>
  );
}
