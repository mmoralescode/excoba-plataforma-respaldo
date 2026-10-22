import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  refs: [] as Array<{ current: unknown }>,
  refCursor: 0,
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    useRef: (initial: unknown) => {
      const index = hooks.refCursor++;
      if (!(index in hooks.refs)) hooks.refs[index] = { current: initial };
      return hooks.refs[index];
    },
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = initial;
      return [
        hooks.states[index],
        (value: unknown) => {
          hooks.states[index] = typeof value === "function" ? value(hooks.states[index]) : value;
        },
      ];
    },
  };
});
vi.mock("next/link", () => ({ default: "a" }));

import { FeedbackBox } from "../src/components/feedback-box";

// Component-state and event-handler tests; these do not replace real-browser checks.
type Node = React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
function render() {
  hooks.cursor = 0;
  hooks.refCursor = 0;
  return FeedbackBox();
}
function elements(tree: React.ReactNode): Node[] {
  const found: Node[] = [];
  React.Children.forEach(tree, (child) => {
    if (React.isValidElement(child)) {
      const element = child as Node;
      found.push(element, ...elements(element.props.children));
    }
  });
  return found;
}
function node(tree: React.ReactNode, type: unknown, index = 0) {
  return elements(tree).filter((element) => element.type === type)[index]!;
}
function textOf(tree: React.ReactNode): string {
  return React.Children.toArray(tree)
    .map((child) =>
      React.isValidElement(child)
        ? textOf((child.props as { children?: React.ReactNode }).children)
        : String(child),
    )
    .join(" ");
}
function change(input: Node, value: string) {
  (input.props.onChange as (event: unknown) => void)({ target: { value } });
}
async function submit(tree: React.ReactNode) {
  await (node(tree, "form").props.onSubmit as (event: unknown) => Promise<void>)({
    preventDefault: vi.fn(),
  });
}
function reply(data: unknown, status = 201) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
function sentPayload(index = 0) {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error("No se realizó el envío esperado.");
  return JSON.parse(call[1].body);
}
const fetchMock = vi.fn();
const randomUUID = vi.fn();
const message = "Me gustaría poder organizar mis temas favoritos.";

beforeEach(() => {
  hooks.states = [];
  hooks.refs = [];
  hooks.cursor = 0;
  hooks.refCursor = 0;
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetchMock);
  let id = 0;
  randomUUID.mockImplementation(() => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`);
  vi.stubGlobal("crypto", { randomUUID });
});
afterEach(() => vi.unstubAllGlobals());

describe("Buzón de sugerencias y errores en Perfil", () => {
  it("ofrece categorías y apartados, con aviso de privacidad y límites accesibles", () => {
    const tree = render();
    expect(textOf(tree)).toContain("Buzón de sugerencias y errores");
    expect(textOf(tree)).toContain("No incluyas contraseñas, folios ni códigos de recuperación");
    expect(textOf(tree).replace(/\s+/g, " ")).toContain("vinculado a tu cuenta");
    expect(textOf(tree).replace(/\s+/g, " ")).toContain("administración y soporte");
    expect(
      elements(node(tree, "select", 0))
        .filter((item) => item.type === "option")
        .map((item) => item.props.value),
    ).toEqual(["SUGERENCIA", "ERROR"]);
    expect(
      elements(node(tree, "select", 1))
        .filter((item) => item.type === "option")
        .map((item) => item.props.value),
    ).toEqual(["GENERAL", "INSTRUCTIVO", "PRACTICA", "SIMULADOR", "PERFIL", "OTRO"]);
    expect(node(tree, "textarea").props).toMatchObject({
      required: true,
      minLength: 10,
      maxLength: 1000,
      "aria-describedby": "feedback-message-help feedback-privacy",
    });
    expect(node(tree, "button").props.disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["", "          ", "  Corto  ", "x".repeat(1001)])(
    "no envía un mensaje inválido (%s)",
    async (value) => {
      change(node(render(), "textarea"), value);
      await submit(render());
      expect(fetchMock).not.toHaveBeenCalled();
      expect(randomUUID).not.toHaveBeenCalled();
      expect(textOf(render())).toContain("entre 10 y 1000 caracteres");
      expect(node(render(), "textarea").props.value).toBe(value);
    },
  );

  it("recorta espacios y envía únicamente el contenido del buzón con un identificador privado", async () => {
    const tree = render();
    change(node(tree, "select", 0), "ERROR");
    change(node(tree, "select", 1), "SIMULADOR");
    change(node(tree, "textarea"), `  ${message}  `);
    fetchMock.mockResolvedValueOnce(reply({ id: "message-1", message: "Recibido" }));
    await submit(render());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(sentPayload()).toEqual({
      category: "ERROR",
      section: "SIMULADOR",
      message,
      submissionId: "00000000-0000-4000-8000-000000000001",
    });
    expect(node(render(), "textarea").props.value).toBe("");
    expect(node(render(), "select", 0).props.value).toBe("SUGERENCIA");
    expect(node(render(), "select", 1).props.value).toBe("GENERAL");
    expect(textOf(render())).toContain("Recibimos tu mensaje");
    expect(elements(render()).some((item) => item.props.role === "status")).toBe(true);
  });

  it("muestra el contador con la longitud que se enviará", () => {
    change(node(render(), "textarea"), "  Diez letras  ");
    const tree = render();
    expect(textOf(tree)).toContain("11  / 1000");
    expect(node(tree, "button").props.disabled).toBe(false);
  });

  it("conserva texto e identificador al reintentar una respuesta perdida", async () => {
    change(node(render(), "textarea"), message);
    fetchMock.mockRejectedValueOnce(new Error("Connection interrupted"));
    await submit(render());
    expect(node(render(), "textarea").props.value).toBe(message);
    expect(textOf(render())).toContain("Tu mensaje sigue aquí");
    fetchMock.mockResolvedValueOnce(reply({ id: "message-1", message: "Recibido" }, 200));
    await submit(render());
    expect(sentPayload(0)).toEqual(sentPayload(1));
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(textOf(render())).toContain("Recibimos tu mensaje");
  });

  it.each(["message", "category", "section"])(
    "usa un identificador nuevo cuando cambia %s",
    async (field) => {
      change(node(render(), "textarea"), message);
      fetchMock.mockRejectedValueOnce(new Error("Connection interrupted"));
      await submit(render());
      const tree = render();
      if (field === "message") change(node(tree, "textarea"), `${message} Gracias.`);
      if (field === "category") change(node(tree, "select", 0), "ERROR");
      if (field === "section") change(node(tree, "select", 1), "PERFIL");
      fetchMock.mockResolvedValueOnce(reply({ id: "message-2" }));
      await submit(render());
      expect(sentPayload(0).submissionId).not.toBe(sentPayload(1).submissionId);
      expect(randomUUID).toHaveBeenCalledTimes(2);
    },
  );

  it("no borra un borrador si la respuesta de éxito está incompleta y conserva su identificador", async () => {
    change(node(render(), "textarea"), message);
    fetchMock.mockResolvedValueOnce(reply({ message: "Recibido" }));
    await submit(render());
    expect(textOf(render())).toContain("No recibimos la confirmación");
    expect(node(render(), "textarea").props.value).toBe(message);
    fetchMock.mockResolvedValueOnce(reply({ id: "message-1" }, 200));
    await submit(render());
    expect(sentPayload(0)).toEqual(sentPayload(1));
  });

  it.each([400, 401, 409, 429, 500])(
    "conserva el borrador y maneja el error %s sin reflejar detalles del servidor",
    async (status) => {
      change(node(render(), "textarea"), message);
      fetchMock.mockResolvedValueOnce(reply({ error: "Detalle privado del servidor" }, status));
      await submit(render());
      const tree = render();
      expect(node(tree, "textarea").props.value).toBe(message);
      expect(elements(tree).some((item) => item.props.role === "alert")).toBe(true);
      expect(textOf(tree)).not.toContain("Detalle privado del servidor");
      expect(node(tree, "button").props.disabled).toBe(false);
      if (status === 401) expect(node(tree, "a").props.href).toBe("/login");
      if (status === 429) expect(textOf(tree)).toContain("hasta 5 mensajes por hora");
      if (status === 409) {
        fetchMock.mockResolvedValueOnce(reply({ id: "message-2" }));
        await submit(render());
        expect(sentPayload(0).submissionId).not.toBe(sentPayload(1).submissionId);
      }
    },
  );

  it("bloquea el doble envío antes del siguiente render y desactiva campos mientras guarda", async () => {
    change(node(render(), "textarea"), message);
    let release!: (value: ReturnType<typeof reply>) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const tree = render();
    const pending = submit(tree);
    await submit(tree);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(node(render(), "fieldset").props.disabled).toBe(true);
    expect(node(render(), "form").props["aria-busy"]).toBe(true);
    expect(textOf(render())).toContain("Enviando…");
    release(reply({ id: "message-1" }));
    await pending;
    expect(node(render(), "fieldset").props.disabled).toBe(false);
  });

  it("limpia la confirmación al empezar otro mensaje y genera un identificador distinto", async () => {
    change(node(render(), "textarea"), message);
    fetchMock.mockResolvedValueOnce(reply({ id: "message-1" }));
    await submit(render());
    change(node(render(), "textarea"), message);
    expect(textOf(render())).not.toContain("Recibimos tu mensaje");
    fetchMock.mockResolvedValueOnce(reply({ id: "message-2" }));
    await submit(render());
    expect(sentPayload(0).submissionId).not.toBe(sentPayload(1).submissionId);
  });
});
