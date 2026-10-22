import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LicenseAccess } from "../src/components/license-access-provider";

const hooks = vi.hoisted(() => ({
  cursor: 0,
  states: [] as unknown[],
  access: {} as LicenseAccess,
  update: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useId: () => "career-choice",
  useEffect: () => undefined,
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [
      hooks.states[index],
      (value: unknown) => {
        hooks.states[index] = value;
      },
    ];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: hooks.refresh }) }));
vi.mock("../src/components/license-access-provider", () => ({
  useLicenseAccess: () => ({ access: hooks.access, update: hooks.update }),
}));
import { CareerSelector, useCareer } from "../src/components/career-selector";

type Node = React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
function nodes(tree: React.ReactNode): Node[] {
  return React.Children.toArray(tree).flatMap((child) => {
    if (!React.isValidElement(child)) return [];
    const element = child as Node;
    return [element, ...nodes(element.props.children)];
  });
}
const label = (tree: React.ReactNode): string =>
  React.Children.toArray(tree)
    .map((child) =>
      React.isValidElement(child)
        ? label((child.props as { children?: React.ReactNode }).children)
        : String(child),
    )
    .join("");
const button = (tree: React.ReactNode, text: string) =>
  nodes(tree).find((item) => item.type === "button" && label(item.props.children) === text)!;
function render(onChange: (id: string) => void | Promise<void>) {
  hooks.cursor = 0;
  return CareerSelector({ value: "", onChange });
}
function select(tree: React.ReactNode, id: string) {
  const element = nodes(tree).find((item) => item.type === "select")!;
  (element.props.onChange as (event: unknown) => void)({ target: { value: id } });
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  hooks.states = [];
  hooks.cursor = 0;
  hooks.access = {
    validityMonths: 2,
    careerScope: "SINGLE_CAREER",
    selectedCareerId: null,
    careerSelectedAt: null,
    startsAt: "2026-09-30T18:00:00Z",
    expiresAt: "2026-11-30T18:00:00Z",
  };
});
afterEach(() => vi.unstubAllGlobals());

describe("Primera elección explícita de carrera", () => {
  it("no guarda al explorar el selector; exige confirmar y permite cancelar antes", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    select(render(save), "uaq-2026-1-01");
    let tree = render(save);
    expect(label(tree)).toContain("Esta elección no se puede cambiar");
    expect(save).not.toHaveBeenCalled();
    (button(tree, "Cancelar").props.onClick as () => void)();
    expect(save).not.toHaveBeenCalled();
    select(render(save), "uaq-2026-1-01");
    tree = render(save);
    await (button(tree, "Confirmar mi única carrera").props.onClick as () => Promise<void>)();
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("uaq-2026-1-01");
  });
  it("muestra el error de servidor sin fingir que quedó guardada la carrera", async () => {
    const save = vi.fn().mockRejectedValue(new Error("No se pudo guardar tu carrera."));
    select(render(save), "uaq-2026-1-01");
    await (
      button(render(save), "Confirmar mi única carrera").props.onClick as () => Promise<void>
    )();
    const tree = render(save);
    expect(nodes(tree).some((item) => item.props.role === "alert")).toBe(true);
    expect(label(tree)).toContain("No se pudo guardar tu carrera.");
    expect(button(tree, "Confirmar mi única carrera")).toBeDefined();
  });
  it("el plan de todas las carreras cambia sin confirmación irreversible", () => {
    hooks.access.careerScope = "ALL_CAREERS";
    hooks.access.validityMonths = 4;
    const save = vi.fn();
    select(render(save), "uaq-2026-1-01");
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("uaq-2026-1-01");
    expect(label(render(save))).not.toContain("Confirmar mi única carrera");
  });
  it("usa la carrera del servidor, no una cookie previa, y refresca tras guardar", async () => {
    hooks.states = ["uaq-2026-1-02", true];
    hooks.access.selectedCareerId = "uaq-2026-1-01";
    const result = useCareer();
    expect(result.career?.id).toBe("uaq-2026-1-01");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => hooks.access });
    vi.stubGlobal("fetch", fetchMock);
    await result.choose("uaq-2026-1-01");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/license-access/career",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ careerId: "uaq-2026-1-01" }),
      }),
    );
    expect(hooks.update).toHaveBeenCalledWith(hooks.access);
    expect(hooks.refresh).toHaveBeenCalledOnce();
  });
});
