import { z } from "zod";
import type { InteractionPrompt, StructuredResponse } from "@/content/interaction-types";

export const StructuredResponseSchema = z
  .object({
    text: z.string().max(120).optional(),
    placements: z
      .record(z.string().max(40), z.string().max(40))
      .refine((v) => Object.keys(v).length <= 12)
      .optional(),
    selected: z.array(z.string().max(40)).max(12).optional(),
  })
  .strict();

type Spec = { public: InteractionPrompt; expected: string | string[] | Record<string, string> };
const specs: Record<string, Spec> = {
  "uaq26-interactive-v4-01": {
    public: {
      kind: "match",
      prompt: "Relaciona cada acontecimiento con su año de inicio.",
      items: [
        { id: "a", label: "Independencia de México" },
        { id: "b", label: "Revolución mexicana" },
        { id: "c", label: "Primera Guerra Mundial" },
      ],
      targets: [
        { id: "1810", label: "1810" },
        { id: "1910", label: "1910" },
        { id: "1914", label: "1914" },
      ],
    },
    expected: { a: "1810", b: "1910", c: "1914" },
  },
  "uaq26-interactive-v4-02": {
    public: {
      kind: "match",
      prompt: "Clasifica cada estructura celular según su función principal.",
      items: [
        { id: "a", label: "Ribosoma" },
        { id: "b", label: "Mitocondria" },
        { id: "c", label: "Membrana plasmática" },
      ],
      targets: [
        { id: "s", label: "Síntesis de proteínas" },
        { id: "e", label: "Producción de ATP en respiración aerobia" },
        { id: "b", label: "Barrera selectiva" },
      ],
    },
    expected: { a: "s", b: "e", c: "b" },
  },
  "uaq26-interactive-v4-03": {
    public: {
      kind: "match",
      prompt: "Relaciona cada magnitud con su unidad del SI.",
      items: [
        { id: "a", label: "Fuerza" },
        { id: "b", label: "Energía" },
        { id: "c", label: "Potencia" },
        { id: "d", label: "Presión" },
      ],
      targets: [
        { id: "n", label: "Newton (N)" },
        { id: "j", label: "Joule (J)" },
        { id: "w", label: "Watt (W)" },
        { id: "p", label: "Pascal (Pa)" },
      ],
    },
    expected: { a: "n", b: "j", c: "w", d: "p" },
  },
  "uaq26-interactive-v4-04": {
    public: {
      kind: "image",
      prompt: "Selecciona en el esquema el lado que corresponde a la hipotenusa.",
      diagram: "triangle",
      regions: [
        { id: "a", label: "Lado A", x: 40, y: 95 },
        { id: "b", label: "Lado B", x: 160, y: 150 },
        { id: "c", label: "Lado C", x: 160, y: 95 },
      ],
    },
    expected: "c",
  },
  "uaq26-interactive-v4-05": {
    public: {
      kind: "numeric",
      prompt: "Un rectángulo mide 7 cm por 9 cm. Escribe su área en cm².",
      hint: "Escribe solo el número; puedes usar punto decimal o una fracción.",
    },
    expected: "63",
  },
  "uaq26-interactive-v4-06": {
    public: {
      kind: "numeric",
      prompt:
        "Disuelves 0.25 mol de soluto hasta obtener 0.5 L de disolución. Escribe la concentración molar en mol/L.",
      hint: "Escribe solo el número; se aceptan 0.5, 0,5 o fracciones equivalentes.",
    },
    expected: "0.5",
  },
  "uaq26-interactive-v4-07": {
    public: {
      kind: "algebra",
      prompt: "Simplifica 3x + 2x − 4. Escribe una expresión de la forma ax+b.",
      hint: "Usa x y términos lineales, por ejemplo 2x+7. No uses paréntesis ni potencias.",
    },
    expected: "5x-4",
  },
  "uaq26-interactive-v4-08": {
    public: {
      kind: "multi",
      prompt:
        "Selecciona las dos estructuras presentes en una célula vegetal fotosintética típica que no están en una célula animal.",
      required: 2,
      items: [
        { id: "a", label: "Pared celular de celulosa" },
        { id: "b", label: "Cloroplastos" },
        { id: "c", label: "Ribosomas" },
        { id: "d", label: "Membrana plasmática" },
      ],
    },
    expected: ["a", "b"],
  },
};

export function structuredPrompt(id: string) {
  return specs[id]?.public;
}
export function hasStructuredMode(config: unknown, id: string) {
  return (
    (config as { answerModes?: Record<string, string> } | null)?.answerModes?.[id] ===
      "STRUCTURED" && !!specs[id]
  );
}
function numberValue(text: string): number | null {
  const normalized = text.trim().replace("−", "-").replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/.test(normalized))
    return null;
  const [a, b] = normalized.split("/").map(Number);
  const value = a! / (b ?? 1);
  return Number.isFinite(value) ? value : null;
}
/** Restricted linear grammar; no eval, dynamic code or symbolic runtime. */
function linearValue(text: string): [number, number] | null {
  const value = text.toLowerCase().replaceAll("−", "-").replaceAll(" ", "").replaceAll("*", "");
  if (!value || value.length > 120) return null;
  const terms = value.match(/[+-]?(?:\d+(?:\.\d+)?x?|x)/g);
  if (!terms || terms.join("") !== value || terms.some((term, i) => i > 0 && !/^[+-]/.test(term)))
    return null;
  let a = 0,
    b = 0;
  for (const term of terms) {
    if (term.endsWith("x")) {
      const n = term.slice(0, -1);
      a += n === "" || n === "+" ? 1 : n === "-" ? -1 : Number(n);
    } else b += Number(term);
  }
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}
export function gradeStructured(id: string, raw: unknown): number {
  const spec = specs[id];
  const parsed = StructuredResponseSchema.safeParse(raw ?? {});
  if (!spec || !parsed.success) return 0;
  const response = parsed.data;
  if (spec.public.kind === "numeric") {
    const actual = numberValue(response.text ?? ""),
      expected = numberValue(spec.expected as string)!;
    return actual !== null && Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected))
      ? 1
      : 0;
  }
  if (spec.public.kind === "algebra") {
    const actual = linearValue(response.text ?? ""),
      expected = linearValue(spec.expected as string)!;
    return actual && actual.every((v, i) => Math.abs(v - expected[i]!) < 1e-10) ? 1 : 0;
  }
  if (spec.public.kind === "match") {
    const expected = spec.expected as Record<string, string>;
    return (
      Object.entries(expected).filter(([key, value]) => response.placements?.[key] === value)
        .length / Object.keys(expected).length
    );
  }
  if (spec.public.kind === "multi") {
    const prompt = spec.public;
    const selected = response.selected ?? [],
      expected = spec.expected as string[];
    if (
      new Set(selected).size !== selected.length ||
      selected.length > prompt.required ||
      selected.some((id) => !prompt.items.some((item) => item.id === id))
    )
      return 0;
    return selected.filter((id) => expected.includes(id)).length / expected.length;
  }
  return response.text === spec.expected ? 1 : 0;
}
export function responseLabel(id: string, response?: StructuredResponse | null): string {
  const spec = specs[id];
  if (!spec || !response) return "Sin respuesta";
  if (spec.public.kind === "match") {
    const prompt = spec.public;
    return prompt.items
      .map(
        (item) =>
          `${item.label}: ${prompt.targets.find((t) => t.id === response.placements?.[item.id])?.label ?? "Sin ubicar"}`,
      )
      .join("; ");
  }
  if (spec.public.kind === "multi") {
    const items = spec.public.items;
    return (
      (response.selected ?? [])
        .map((id) => items.find((item) => item.id === id)?.label ?? "")
        .join("; ") || "Sin respuesta"
    );
  }
  if (spec.public.kind === "image")
    return spec.public.regions.find((r) => r.id === response.text)?.label ?? "Sin respuesta";
  return response.text || "Sin respuesta";
}
