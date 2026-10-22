import * as React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ refs: [] as Array<{ current: unknown }>, state: vi.fn() }));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (v: unknown) => [v, m.state],
  useRef: (v: unknown) => {
    const ref = { current: v };
    m.refs.push(ref);
    return ref;
  },
}));
import { StructuredQuestionAnswer } from "../src/components/structured-question-answer";
import { structuredPrompt } from "../src/server/use-cases/structured-responses";
function setup(disabled = false) {
  const onChange = vi.fn(),
    questionId = "uaq26-interactive-v4-01";
  const tree = StructuredQuestionAnswer({
    questionId,
    interaction: structuredPrompt(questionId)!,
    disabled,
    onChange,
  });
  const elements: React.ReactElement[] = [];
  function walk(node: React.ReactNode) {
    React.Children.forEach(node, (child) => {
      if (React.isValidElement(child)) {
        elements.push(child);
        walk((child.props as { children?: React.ReactNode }).children);
      }
    });
  }
  walk(tree);
  const props = elements.find((e) => e.type === "button")!.props as React.ComponentProps<"button">;
  const pointer = (x: number, y: number, pointerType = "touch") =>
    ({
      button: 0,
      isPrimary: true,
      pointerId: 1,
      clientX: x,
      clientY: y,
      pointerType,
      currentTarget: { setPointerCapture: vi.fn() },
    }) as unknown as React.PointerEvent<HTMLButtonElement>;
  return { onChange, props, pointer, elements, questionId };
}
beforeEach(() => {
  m.refs.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
});
afterEach(() => vi.unstubAllGlobals());
describe("Clasificación: pruebas de manejadores, no navegador real", () => {
  it.each(["mouse", "touch", "pen"])(
    "coloca ficha con %s y no duplica el clic posterior",
    (type) => {
      const { props, onChange, pointer, questionId } = setup();
      vi.stubGlobal("document", {
        elementFromPoint: () => ({
          closest: () => ({ dataset: { question: questionId, matchTarget: "1810" } }),
        }),
      });
      props.onPointerDown!(pointer(20, 20, type));
      props.onPointerUp!(pointer(100, 150, type));
      expect(onChange).toHaveBeenCalledWith({ placements: { a: "1810" } });
      props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
      expect(onChange).toHaveBeenCalledOnce();
    },
  );
  it("soltar fuera o sobre otra pregunta no cambia la respuesta", () => {
    const { props, onChange, pointer } = setup();
    vi.stubGlobal("document", {
      elementFromPoint: () => ({
        closest: () => ({ dataset: { question: "other", matchTarget: "1810" } }),
      }),
    });
    props.onPointerDown!(pointer(20, 20));
    props.onPointerUp!(pointer(100, 150));
    expect(onChange).not.toHaveBeenCalled();
  });
  it("el selector accesible permite asignar y deshacer sin arrastre", () => {
    const { elements, onChange } = setup();
    const props = elements.find((e) => e.type === "select")!
      .props as React.ComponentProps<"select">;
    props.onChange!({ target: { value: "1910" } } as React.ChangeEvent<HTMLSelectElement>);
    expect(onChange).toHaveBeenLastCalledWith({ placements: { a: "1910" } });
    props.onChange!({ target: { value: "" } } as React.ChangeEvent<HTMLSelectElement>);
    expect(onChange).toHaveBeenLastCalledWith({ placements: {} });
  });
  it("cancelar el gesto o deshabilitar controles no registra cambios", () => {
    const { props, onChange, pointer } = setup();
    props.onPointerDown!(pointer(20, 20));
    props.onPointerCancel!(pointer(50, 50));
    props.onPointerUp!(pointer(100, 150));
    expect(onChange).not.toHaveBeenCalled();
    const locked = setup(true);
    locked.props.onPointerDown!(locked.pointer(20, 20));
    locked.props.onPointerUp!(locked.pointer(100, 150));
    expect(locked.onChange).not.toHaveBeenCalled();
  });
});
