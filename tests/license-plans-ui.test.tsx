import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { careers, getCareer } from "../src/content/career-catalog";
import { officialSubjects, officialTopics, subjectDbId } from "../src/content/study-plan";
import type { StudySubject } from "../src/content/study-types";
import type { LicenseAccess } from "../src/components/license-access-provider";

const state = vi.hoisted(() => ({
  careerId: "uaq-2026-1-01",
  singleCareer: true,
  showAll: false,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      initial === false ? [state.showAll, () => undefined] : actual.useState(initial),
  };
});
vi.mock("../src/components/career-selector", async (original) => ({
  ...(await original<typeof import("../src/components/career-selector")>()),
  useCareer: () => ({
    career: getCareer(state.careerId),
    singleCareer: state.singleCareer,
    ready: true,
    choose: async () => undefined,
  }),
}));

import { CareerSelector } from "../src/components/career-selector";
import { StudyDashboard } from "../src/components/study-dashboard";
import { CurriculumBrowser } from "../src/components/curriculum-browser";
import {
  LicenseAccessProvider,
  LicenseAccessDetails,
  LicenseAccessBanner,
} from "../src/components/license-access-provider";
import ActivarPage from "../src/app/activar/page";

const access = (overrides: Partial<LicenseAccess> = {}): LicenseAccess => ({
  validityMonths: 2,
  careerScope: "SINGLE_CAREER",
  selectedCareerId: state.careerId || null,
  careerSelectedAt: "2026-09-30T18:00:00.000Z",
  startsAt: "2026-09-30T18:00:00.000Z",
  expiresAt: "2026-11-30T18:00:00.000Z",
  ...overrides,
});
const render = (element: React.ReactNode, plan = access()) =>
  renderToStaticMarkup(
    <LicenseAccessProvider initialAccess={plan}>{element}</LicenseAccessProvider>,
  );
const subjects: StudySubject[] = officialSubjects.map((subject) => ({
  key: `official:${subject.id}`,
  id: subjectDbId(subject.id),
  officialId: subject.id,
  name: subject.name,
  scope: "official",
  topics: [],
  answered: 0,
  percent: 0,
  questionCount: 1,
}));

beforeEach(() => {
  vi.stubGlobal("React", React);
  state.singleCareer = true;
  state.careerId = "uaq-2026-1-01";
  state.showAll = false;
});
afterEach(() => vi.unstubAllGlobals());

describe("Vigencia y alcance del plan", () => {
  it("explica los dos planes en activación sin anunciar seis meses", () => {
    const html = renderToStaticMarkup(<ActivarPage />);
    expect(html).toContain("4 meses con todas las carreras");
    expect(html).toContain("2 meses con una sola carrera");
    expect(html).not.toContain("6 meses");
  });
  it("muestra el inicio, vencimiento y carrera fija del plan de dos meses", () => {
    const html = render(
      <>
        <LicenseAccessBanner />
        <LicenseAccessDetails />
      </>,
    );
    expect(html).toContain("Plan de 2 meses");
    expect(html).toContain("30 de noviembre de 2026");
    expect(html).toContain("30 de septiembre de 2026");
    expect(html).toContain(getCareer(state.careerId)!.name);
    expect(html).toContain("no reinicia ni amplía ese plazo");
    expect(html).toContain("aunque uses otro dispositivo");
    expect(html).toContain('href="/mi-acceso"');
  });
  it("muestra el pendiente y la advertencia antes de la primera confirmación", () => {
    state.careerId = "";
    const html = render(
      <>
        <LicenseAccessDetails />
        <CareerSelector value="" onChange={() => undefined} />
      </>,
    );
    expect(html).toContain("Pendiente de elegir");
    expect(html).toContain("Elegir mi única carrera");
    expect(html).toContain("no podrás cambiar tu elección");
    expect([...html.matchAll(/<option value="([^"]+)"/g)]).toHaveLength(careers.length);
  });
  it("no ofrece volver a elegir una carrera ya vinculada", () => {
    const html = render(<CareerSelector value="otra-carrera-cookie" onChange={() => undefined} />);
    expect(html).toContain(getCareer(state.careerId)!.name);
    expect(html).not.toContain("<select");
    expect(html).not.toContain("otra-carrera-cookie");
  });
  it("mantiene todas las carreras y cambios disponibles en el plan de cuatro meses", () => {
    state.singleCareer = false;
    const html = render(
      <>
        <LicenseAccessDetails />
        <CareerSelector value={state.careerId} onChange={() => undefined} />
      </>,
      access({ validityMonths: 4, careerScope: "ALL_CAREERS" }),
    );
    expect(html).toContain("Plan de 4 meses");
    expect(html).toContain("Todas las carreras del catálogo");
    expect(html).toContain("<select");
    expect(html).not.toContain("la primera carrera que confirmaste");
  });
  it("no expone otras áreas ni cambiar carrera aunque showAll esté activado", () => {
    state.showAll = true;
    const html = render(<StudyDashboard subjects={subjects} />);
    expect(html.match(/<progress /g)).toHaveLength(9);
    expect(html).not.toContain("Ver todos los temas");
    expect(html).not.toContain("Cambiar carrera");
    expect(html).not.toContain("scope=all");
    expect(html).not.toContain("Otras áreas EXCOBA");
  });
  it("limita el instructivo y no promete ampliar a otras carreras", () => {
    state.showAll = true;
    const html = render(<CurriculumBrowser subjects={officialSubjects} topics={officialTopics} />);
    expect(html.match(/<summary /g)).toHaveLength(9);
    expect(html).not.toContain("Ver todos los temas");
    expect(html).not.toContain("Las otras áreas siguen disponibles");
    state.careerId = "";
    const pending = render(
      <CurriculumBrowser subjects={officialSubjects} topics={officialTopics} />,
    );
    expect(pending).toContain("Elige y confirma tu carrera");
    expect(pending).not.toContain("<summary");
  });
});
