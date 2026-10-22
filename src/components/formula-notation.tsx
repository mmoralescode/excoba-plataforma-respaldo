import { createElement, type ReactNode } from "react";

// MathML nativo: notación estructurada, seleccionable y accesible, sin imágenes ni CDN.
const e = (tag: string, ...children: ReactNode[]) => createElement(tag, null, ...children);
const row = (...children: ReactNode[]) => e("mrow", ...children);
const v = (name: string) => e("mi", name);
const n = (value: string | number) => e("mn", String(value));
const op = (symbol: string) => e("mo", symbol);
const text = (value: string) => e("mtext", value);
const frac = (top: ReactNode, bottom: ReactNode) => e("mfrac", top, bottom);
const pow = (base: ReactNode, exponent: ReactNode = n(2)) => e("msup", base, exponent);
const sub = (base: string, index: string | number) =>
  e("msub", v(base), typeof index === "number" ? n(index) : text(index));
const delta = (name: string) => row(op("Δ"), v(name));
const eq = (left: ReactNode, right: ReactNode) => row(left, op("="), right);
const times = (...names: string[]) => row(...names.map(v));
const group = (...children: ReactNode[]) => row(op("("), ...children, op(")"));
const factorial = (value: ReactNode) => row(value, op("!"));

export const formulaNotation: Record<string, ReactNode[]> = {
  "Ecuación cuadrática": [
    eq(
      v("x"),
      frac(
        row(op("−"), v("b"), op("±"), e("msqrt", row(pow(v("b")), op("−"), n(4), v("a"), v("c")))),
        row(n(2), v("a")),
      ),
    ),
  ],
  Geometría: [
    eq(sub("A", "triángulo"), frac(times("b", "h"), n(2))),
    eq(sub("A", "círculo"), row(v("π"), pow(v("r")))),
    eq(sub("L", "circunferencia"), row(n(2), v("π"), v("r"))),
  ],
  "Pitágoras y pendiente": [
    eq(pow(v("c")), row(pow(v("a")), op("+"), pow(v("b")))),
    eq(
      v("m"),
      frac(row(sub("y", 2), op("−"), sub("y", 1)), row(sub("x", 2), op("−"), sub("x", 1))),
    ),
  ],
  "Media y probabilidad": [
    eq(
      e("mover", v("x"), op("¯")),
      frac(
        row(
          e("munderover", op("∑"), row(v("i"), op("="), n(1)), v("n")),
          e("msub", v("x"), v("i")),
        ),
        v("n"),
      ),
    ),
    eq(row(v("P"), group(v("A"))), frac(text("casos favorables"), text("casos posibles"))),
  ],
  Combinaciones: [
    eq(
      row(v("C"), group(v("n"), op(","), v("k"))),
      frac(factorial(v("n")), row(factorial(v("k")), factorial(group(v("n"), op("−"), v("k"))))),
    ),
  ],
  "Porcentajes e interés simple": [
    eq(text("parte"), row(text("total"), op("·"), frac(v("p"), n(100)))),
    eq(v("I"), times("C", "r", "t")),
  ],
  Movimiento: [
    eq(sub("v", "media"), frac(delta("x"), delta("t"))),
    eq(v("a"), frac(delta("v"), delta("t"))),
    eq(delta("x"), row(sub("v", 0), v("t"), op("+"), frac(row(v("a"), pow(v("t"))), n(2)))),
  ],
  Fuerzas: [eq(row(op("∑"), v("F")), times("m", "a")), eq(text("peso"), times("m", "g"))],
  "Energía, trabajo y potencia": [
    eq(sub("E", "c"), frac(row(v("m"), pow(v("v"))), n(2))),
    eq(sub("E", "p"), times("m", "g", "h")),
    eq(v("W"), row(v("F"), v("d"), e("mi", "cos"), v("θ"))),
    eq(v("P"), frac(v("W"), delta("t"))),
  ],
  Fluidos: [
    eq(v("ρ"), frac(v("m"), v("V"))),
    eq(v("p"), frac(e("msub", v("F"), op("⊥")), v("A"))),
    eq(delta("p"), times("ρ", "g", "h")),
  ],
  "Electricidad y calor": [
    eq(v("V"), times("I", "R")),
    eq(sub("P", "eléctrica"), times("V", "I")),
    eq(v("Q"), row(v("m"), v("c"), delta("T"))),
  ],
  Unidades: [
    eq(row(n(1), text(" km")), row(n(1000), text(" m"))),
    eq(row(n(1), text(" h")), row(n(3600), text(" s"))),
    eq(row(n(1), text(" N")), row(n(1), frac(row(text("kg"), op("·"), text("m")), pow(text("s"))))),
  ],
  "Estructura atómica": [eq(v("A"), row(v("Z"), op("+"), v("N")))],
  "Cantidad de sustancia": [
    eq(v("n"), frac(v("m"), sub("M", "m"))),
    eq(sub("N", "partículas"), row(v("n"), sub("N", "A"))),
  ],
  "Concentración y dilución": [
    eq(v("c"), frac(v("n"), v("V"))),
    eq(row(sub("c", 1), sub("V", 1)), row(sub("c", 2), sub("V", 2))),
  ],
  "Porcentaje en masa": [
    eq(text("% m/m"), row(frac(sub("m", "soluto"), sub("m", "disolución")), op("×"), n(100))),
  ],
  Acidez: [
    row(
      text("pH"),
      op("≈"),
      op("−"),
      e("msub", e("mi", "log"), n(10)),
      op("["),
      pow(v("H"), op("+")),
      op("]"),
    ),
    row(text("pH"), op("+"), text("pOH"), op("≈"), n(14)),
  ],
  "Gases ideales": [eq(times("P", "V"), times("n", "R", "T"))],
};

export function FormulaNotation({ name, fallback }: { name: string; fallback: string }) {
  const expressions = formulaNotation[name];
  if (!expressions) return <span>{fallback}</span>;
  return (
    <div className="formula-notation flex flex-wrap items-center gap-x-6 gap-y-4 py-3">
      {expressions.map((expression, index) => (
        <div key={index} className="max-w-full overflow-x-auto py-1">
          {createElement(
            "math",
            { xmlns: "http://www.w3.org/1998/Math/MathML", display: "block" },
            expression,
          )}
        </div>
      ))}
    </div>
  );
}
