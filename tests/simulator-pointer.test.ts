import * as React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refs: [] as Array<{ current: unknown }>, state: vi.fn() }));
vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    useRef: (current: unknown) => {
      const ref = { current };
      mocks.refs.push(ref);
      return ref;
    },
    useState: (initial: unknown) => [initial, mocks.state],
  };
});
import { SimulatorAnswerBoard } from "../src/components/simulator-answer-board";

// Prueba de los manejadores con coordenadas y captura simuladas, no de un navegador real.
function setup(disabled = false) {
  const onSelect = vi.fn();
  const tree = SimulatorAnswerBoard({
    questionId: "q1",
    answers: [
      { id: "a1", text: "A" },
      { id: "a2", text: "B" },
    ],
    disabled,
    onSelect,
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
  mocks.refs[0]!.current = {
    getBoundingClientRect: () => ({ left: 20, right: 200, top: 100, bottom: 180 }),
  };
  const button = elements.find((element) => element.type === "button")!;
  const props = button.props as React.ComponentProps<"button">;
  const currentTarget = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
  const pointer = (x: number, y: number, pointerType = "mouse") =>
    ({
      isPrimary: true,
      button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
      pointerType,
      currentTarget,
    }) as unknown as React.PointerEvent<HTMLButtonElement>;
  return { props, onSelect, pointer };
}
beforeEach(() => {
  mocks.refs.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Interacción de opciones arrastrables", () => {
  it.each(["mouse", "touch", "pen"])("coloca la misma opción con puntero %s", (type) => {
    const { props, onSelect, pointer } = setup();
    props.onPointerDown!(pointer(30, 20, type));
    props.onPointerMove!(pointer(80, 130, type));
    props.onPointerUp!(pointer(80, 130, type));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("a1");
    props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
    expect(onSelect).toHaveBeenCalledTimes(1); // No duplicar con el clic posterior al arrastre.
  });
  it("soltar fuera no cambia la respuesta", () => {
    const { props, onSelect, pointer } = setup();
    props.onPointerDown!(pointer(30, 20));
    props.onPointerMove!(pointer(300, 250));
    props.onPointerUp!(pointer(300, 250));
    props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("permite la colocación alternativa por clic sin arrastre", () => {
    const { props, onSelect } = setup();
    props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
    expect(onSelect).toHaveBeenCalledWith("a1");
  });
  it("cancelar el gesto no guarda ninguna opción", () => {
    const { props, onSelect, pointer } = setup();
    props.onPointerDown!(pointer(30, 20));
    props.onPointerMove!(pointer(80, 130));
    props.onPointerCancel!(pointer(80, 130));
    props.onPointerUp!(pointer(80, 130));
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("no guarda cambios cuando los controles están deshabilitados", () => {
    const { props, onSelect, pointer } = setup(true);
    props.onClick!({} as React.MouseEvent<HTMLButtonElement>);
    props.onPointerDown!(pointer(30, 20));
    props.onPointerMove!(pointer(80, 130));
    props.onPointerUp!(pointer(80, 130));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
