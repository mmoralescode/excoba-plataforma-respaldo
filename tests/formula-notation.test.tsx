import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { formulaSheet } from "../src/content/formula-sheet";
import { FormulaNotation, formulaNotation } from "../src/components/formula-notation";
import { SimulatorFormulaSheet } from "../src/components/simulator-formula-sheet";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const render = (name: string) =>
  renderToStaticMarkup(<FormulaNotation name={name} fallback="Texto alternativo" />);

describe("Formulario con notación matemática", () => {
  it("representa los 18 grupos sin omitir ninguna fórmula del formulario", () => {
    const names = formulaSheet.flatMap((section) => section.formulas.map(([name]) => name));
    expect(names).toHaveLength(18);
    expect(Object.keys(formulaNotation).sort()).toEqual([...names].sort());
    for (const name of names) {
      expect(formulaNotation[name]!.length).toBeGreaterThan(0);
      const html = render(name);
      expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
      expect(html).not.toContain("Texto alternativo");
      expect(html).not.toContain("<img");
    }
  });
  it("presenta la fórmula cuadrática con fracción, raíz, potencia y signo más/menos", () => {
    const html = render("Ecuación cuadrática");
    for (const element of ["mfrac", "msqrt", "msup"]) expect(html).toContain(`<${element}>`);
    expect(html).toContain("±");
    expect(html).toContain("−");
    expect(html).not.toContain("<mo>/</mo>");
  });
  it("usa subíndices, sumatoria con límites y símbolos griegos", () => {
    expect(render("Movimiento")).toContain("<msub>");
    expect(render("Movimiento")).toContain("Δ");
    expect(render("Media y probabilidad")).toContain("<munderover>");
    expect(render("Media y probabilidad")).toContain("∑");
    expect(render("Fluidos")).toContain("ρ");
    expect(render("Geometría")).toContain("π");
    expect(render("Energía, trabajo y potencia")).toContain("θ");
    expect(render("Acidez")).toContain("<msup><mi>H</mi><mo>+</mo></msup>");
  });
  it("permite elegir materia y muestra solo la activa, manteniéndose plegado", () => {
    const html = renderToStaticMarkup(<SimulatorFormulaSheet />);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html).toContain("Ecuación cuadrática");
    expect(html).not.toContain("Gases ideales");
    expect(html).not.toContain("Estructura atómica");
    expect(html).not.toContain(" open=");
    expect(html).toContain("no pausa el cronómetro");
  });
  it("mantiene texto alternativo si se agrega una fórmula sin representación", () => {
    expect(render("Desconocida")).toContain("Texto alternativo");
  });
});
