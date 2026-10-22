export type StructuredResponse = {
  text?: string;
  placements?: Record<string, string>;
  selected?: string[];
};
export function responseComplete(prompt: InteractionPrompt, value?: StructuredResponse) {
  if (!value) return false;
  if (prompt.kind === "match") return prompt.items.every((item) => !!value.placements?.[item.id]);
  if (prompt.kind === "multi") return value.selected?.length === prompt.required;
  return !!value.text?.trim();
}
export type InteractionPrompt =
  | { kind: "numeric" | "algebra"; prompt: string; hint: string }
  | {
      kind: "match";
      prompt: string;
      items: { id: string; label: string }[];
      targets: { id: string; label: string }[];
    }
  | {
      kind: "image";
      prompt: string;
      diagram: "triangle";
      regions: { id: string; label: string; x: number; y: number }[];
    }
  | { kind: "multi"; prompt: string; items: { id: string; label: string }[]; required: number };
