import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CareerSelector, CareerSourceNote } from "../src/components/career-selector";
import { CurriculumBrowser } from "../src/components/curriculum-browser";
import { StudyDashboard } from "../src/components/study-dashboard";
import { HomeStart } from "../src/components/home-start";
import HomePage from "../src/app/page";
import {
  careers,
  getCareer,
  officialSubjects,
  officialTopics,
  subjectDbId,
} from "../src/content/study-plan";
import sourceCatalog from "../src/content/career-sources.json";
import type { StudySubject } from "../src/content/study-types";

// Render each view with a controlled selection. No browser or new UI dependency is needed.
const selection = vi.hoisted(() => ({ careerId: "uaq-2026-1-01", showAll: false, search: "" }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (initial === false) return [selection.showAll, () => undefined];
      if (initial === "") return [selection.search, () => undefined];
      return actual.useState(initial);
    },
  };
});
vi.mock("../src/components/career-selector", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/components/career-selector")>()),
  useCareer: () => ({
    career: getCareer(selection.careerId),
    choose: () => undefined,
    ready: true,
  }),
}));

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
subjects.push({
  key: "extra:extra",
  id: "extra",
  officialId: null,
  name: "Contenido propio de prueba",
  scope: "extra",
  topics: [],
  answered: 0,
  percent: 0,
  questionCount: 1,
});
const render = (element: React.ReactElement) => renderToStaticMarkup(element);

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  selection.careerId = "uaq-2026-1-01";
  selection.showAll = false;
  selection.search = "";
});

describe("Plan visible para el estudiante", () => {
  it("muestra solo la bienvenida y los dos accesos en la portada", () => {
    const html = render(React.createElement(HomePage));
    expect(html).toContain("Tu carrera marca el inicio.");
    expect(html).toContain("Tengo un folio");
    expect(html).toContain("Iniciar sesión");
    expect([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "/activar",
      "/login?next=%2Festudio",
    ]);
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Buscar carrera o campus");
    expect(html).not.toContain("Ver instructivo");
  });

  it("ofrece canjear folio e iniciar sesión sin elegir primero una carrera", () => {
    selection.careerId = "";
    const html = render(React.createElement(HomeStart));
    expect(html).toContain('href="/activar"');
    expect(html).toContain('href="/login?next=%2Festudio"');
    expect(html).not.toContain('href="/estudio"');
  });

  it("muestra primero tres áreas y luego seis asignaturas comunes, sin extras por defecto", () => {
    const html = render(React.createElement(StudyDashboard, { subjects }));
    expect(html.match(/<progress /g)).toHaveLength(9);
    expect(html.indexOf("Tus tres áreas de bachillerato")).toBeLessThan(
      html.indexOf("Base común: primaria y secundaria"),
    );
    expect(html).toContain("Primaria · Español");
    expect(html).toContain("Secundaria · Ciencias sociales");
    expect(html).not.toContain("Contenido propio de prueba");
    expect(html).not.toContain("Especialidad · Matemáticas para cálculo");
    expect(html).toContain('href="/practica?scope=career"');
  });

  it("permite ampliar voluntariamente a catorce asignaturas y contenido propio", () => {
    selection.showAll = true;
    const html = render(React.createElement(StudyDashboard, { subjects }));
    expect(html.match(/<progress /g)).toHaveLength(15);
    expect(html).toContain("Contenido propio de prueba");
    expect(html).toContain('href="/practica?scope=all"');
    expect(html).toContain('href="/practica?subject=extra&amp;scope=extra"');
  });

  it("filtra el instructivo a nueve asignaturas con carrera y conserva las catorce sin selección", () => {
    expect(
      render(
        React.createElement(CurriculumBrowser, {
          subjects: officialSubjects,
          topics: officialTopics,
        }),
      ).match(/<summary /g),
    ).toHaveLength(9);
    selection.careerId = "";
    expect(
      render(
        React.createElement(CurriculumBrowser, {
          subjects: officialSubjects,
          topics: officialTopics,
        }),
      ).match(/<summary /g),
    ).toHaveLength(14);
  });

  it("muestra todo el instructivo cuando el alumno lo elige", () => {
    selection.showAll = true;
    expect(
      render(
        React.createElement(CurriculumBrowser, {
          subjects: officialSubjects,
          topics: officialTopics,
        }),
      ).match(/<summary /g),
    ).toHaveLength(14);
  });
});

describe("Selector y procedencia del catálogo", () => {
  const selector = () =>
    render(React.createElement(CareerSelector, { value: "", onChange: () => undefined }));

  it("ordena todas las opciones alfabéticamente sin alterar sus identificadores", () => {
    const optionIds = [...selector().matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
    expect(optionIds).toEqual(
      [...careers].sort((a, b) => a.name.localeCompare(b.name, "es")).map((career) => career.id),
    );
  });

  it("encuentra Actuaría sin acento y Odontología por su nombre anterior", () => {
    selection.search = "actuaria";
    expect(selector()).toContain("ACTUARÍA");
    expect(selector()).not.toContain("MEDICINA GENERAL");
    selection.search = "odontologia";
    expect(selector()).toContain("MEDICINA ESTOMATOLÓGICA");
  });

  it("advierte cuando las áreas proceden del anexo histórico 2025-2", () => {
    const historicalId = Object.entries(sourceCatalog.careers).find(
      ([, source]) => source.sourceId === "uaq-2025-2",
    )![0];
    const html = render(
      React.createElement(CareerSourceNote, { careerId: historicalId, historicalOnly: true }),
    );
    expect(html).toContain("2025-2");
    expect(html).toContain("Confirma las áreas y la apertura de ingreso con tu facultad");
    expect(html).toContain("https://dsa.uaq.mx/");
  });
});
