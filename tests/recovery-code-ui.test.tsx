import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  refs: [] as Array<{ current: unknown }>,
  refCursor: 0,
  effects: [] as Array<() => unknown>,
  push: vi.fn(),
}));
vi.mock("react", async (original) => {
  const actual = await original<typeof React>();
  return {
    ...actual,
    useId: () => "test-recovery-code",
    useRef: (initial: unknown) => {
      const index = hooks.refCursor++;
      if (!(index in hooks.refs)) hooks.refs[index] = { current: initial };
      return hooks.refs[index];
    },
    useEffect: (effect: () => unknown) => {
      hooks.effects.push(effect);
    },
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) {
        hooks.states[index] = typeof initial === "function" ? initial() : initial;
      }
      return [
        hooks.states[index],
        (value: unknown) => {
          hooks.states[index] = typeof value === "function" ? value(hooks.states[index]) : value;
        },
      ];
    },
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: hooks.push }) }));
vi.mock("next/link", () => ({ default: "a" }));

import ActivarPage from "../src/app/activar/page";
import RecuperarPasswordPage from "../src/app/recuperar-password/page";
import { RecoveryCodeDisplay } from "../src/components/recovery-code-display";
import { RecoveryCodeSettings } from "../src/components/recovery-code-settings";

// These tests exercise component state and handlers, not a real browser or clipboard.
type Node = React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
function render(component: () => React.ReactElement) {
  hooks.cursor = 0;
  hooks.refCursor = 0;
  return component();
}
function elements(tree: React.ReactNode): Node[] {
  const found: Node[] = [];
  React.Children.forEach(tree, (child) => {
    if (React.isValidElement(child)) {
      const node = child as Node;
      found.push(node);
      found.push(...elements(node.props.children));
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
function change(input: Node, value: string | boolean) {
  (input.props.onChange as (event: unknown) => void)({ target: { value, checked: value } });
}
async function submit(tree: React.ReactNode) {
  await (node(tree, "form").props.onSubmit as (event: unknown) => Promise<void>)({
    preventDefault: vi.fn(),
  });
}
function reply(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
const events = new Map<string, () => void>();
const fetchMock = vi.fn();
beforeEach(() => {
  hooks.states = [];
  hooks.cursor = 0;
  hooks.refs = [];
  hooks.refCursor = 0;
  hooks.effects = [];
  events.clear();
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    addEventListener: (type: string, handler: () => void) => events.set(type, handler),
    removeEventListener: (type: string) => events.delete(type),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Interfaz de recuperación sin correo", () => {
  it("exige confirmar que el código fue guardado antes de continuar", () => {
    const onSaved = vi.fn();
    const component = () => RecoveryCodeDisplay({ code: "REC-TEST-ONLY", onSaved });
    let tree = render(component);
    expect(textOf(tree)).toContain("diferente de tu folio");
    expect(textOf(tree)).toContain("Solo lo mostramos ahora");
    const next = node(tree, "button", 1);
    expect(next.props.disabled).toBe(true);
    (next.props.onClick as () => void)();
    expect(onSaved).not.toHaveBeenCalled();
    change(node(tree, "input"), true);
    tree = render(component);
    expect(node(tree, "button", 1).props.disabled).toBe(false);
    (node(tree, "button", 1).props.onClick as () => void)();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("copia el secreto solo cuando el alumno lo solicita", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const component = () => RecoveryCodeDisplay({ code: "REC-TEST-ONLY", onSaved: vi.fn() });
    let tree = render(component);
    expect(writeText).not.toHaveBeenCalled();
    await (node(tree, "button").props.onClick as () => Promise<void>)();
    expect(writeText).toHaveBeenCalledWith("REC-TEST-ONLY");
    tree = render(component);
    expect(textOf(tree)).toContain("Código copiado");
  });

  it("valida la confirmación y envía el código únicamente en el cuerpo del POST", async () => {
    let tree = render(RecuperarPasswordPage);
    expect(textOf(tree).replace(/\s+/g, " ")).toContain("nunca guardaste un código");
    change(node(tree, "input", 0), " alumno@example.test ");
    change(node(tree, "input", 1), " REC-TEST-ONLY ");
    change(node(tree, "input", 3), "NuevaClaveSegura123");
    change(node(tree, "input", 4), "NoCoincide123");
    tree = render(RecuperarPasswordPage);
    await submit(tree);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(textOf(render(RecuperarPasswordPage))).toContain("Las contraseñas no coinciden");

    tree = render(RecuperarPasswordPage);
    change(node(tree, "input", 4), "NuevaClaveSegura123");
    fetchMock.mockResolvedValueOnce(reply({ message: "Contraseña actualizada." }));
    tree = render(RecuperarPasswordPage);
    await submit(tree);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/recover-with-code",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({
          email: "alumno@example.test",
          code: "REC-TEST-ONLY",
          newPassword: "NuevaClaveSegura123",
          confirmPassword: "NuevaClaveSegura123",
        }),
      }),
    );
    tree = render(RecuperarPasswordPage);
    expect(textOf(tree)).toContain("Contraseña actualizada");
    expect(textOf(tree)).toContain("genera otro código desde tu perfil");
    expect(hooks.states.slice(1, 4)).toEqual(["", "", ""]);
  });

  it.each([400, 429, 500])(
    "maneja error %s sin mostrar respuestas que identifiquen cuentas",
    async (status) => {
      let tree = render(RecuperarPasswordPage);
      change(node(tree, "input", 0), "alumno@example.test");
      change(node(tree, "input", 1), "REC-TEST-ONLY");
      change(node(tree, "input", 3), "NuevaClaveSegura123");
      change(node(tree, "input", 4), "NuevaClaveSegura123");
      fetchMock.mockResolvedValueOnce(
        reply({ error: "Cuenta no encontrada: alumno@example.test" }, status),
      );
      await submit(render(RecuperarPasswordPage));
      tree = render(RecuperarPasswordPage);
      expect(textOf(tree)).not.toContain("Cuenta no encontrada");
      expect(elements(tree).some((element) => element.props.role === "alert")).toBe(true);
      if (status === 429) expect(textOf(tree)).toContain("demasiados intentos");
    },
  );

  it("mantiene folio y registro; muestra el código antes de navegar al login", async () => {
    let tree = render(ActivarPage);
    change(node(tree, "input"), "EXCOBA-TEST-ONLY");
    fetchMock.mockResolvedValueOnce(reply({ licenseId: "license-test", validityMonths: 6 }));
    await submit(render(ActivarPage));
    tree = render(ActivarPage);
    expect(textOf(tree)).toContain("Crea tu cuenta");
    const notice = node(tree, "aside");
    expect(notice.props.role).toBe("note");
    expect(notice.props.id).toBe("account-security-note");
    expect(textOf(notice).replace(/\s+/g, " ")).toContain(
      "Es de suma importancia que recuerdes tu contraseña",
    );
    expect(textOf(notice).replace(/\s+/g, " ")).toContain("cada código se puede usar una sola vez");
    expect(textOf(notice).replace(/\s+/g, " ")).toContain("genera otro código en Perfil");
    expect(elements(notice).filter((element) => element.type === "li")).toHaveLength(4);
    expect(textOf(notice).replace(/\s+/g, " ")).toContain("Iniciar sesión → Olvidé mi contraseña");
    expect(textOf(notice).replace(/\s+/g, " ")).toContain(
      "Protege el acceso a tu cuenta → Generar código de recuperación",
    );
    expect(textOf(notice).replace(/\s+/g, " ")).toContain("Al crear tu cuenta, copia y guarda");
    expect(textOf(notice).replace(/\s+/g, " ")).toContain(
      "Puedes recuperar tu cuenta nuevamente con un código nuevo y válido",
    );
    expect(node(tree, "input", 2).props["aria-describedby"]).toBe("account-security-note");
    change(node(tree, "input", 0), "Alumno de prueba");
    change(node(tree, "input", 1), "alumno@example.test");
    change(node(tree, "input", 2), "NuevaClaveSegura123");
    fetchMock.mockResolvedValueOnce(
      reply({ id: "user-test", email: "alumno@example.test", recoveryCode: "REC-TEST-ONLY" }),
    );
    await submit(render(ActivarPage));
    tree = render(ActivarPage);
    const display = node(tree, RecoveryCodeDisplay);
    expect(display.props.code).toBe("REC-TEST-ONLY");
    expect(textOf(node(tree, "aside")).replace(/\s+/g, " ")).toContain(
      "Copia y guarda el código de recuperación que aparece abajo antes de continuar",
    );
    expect(textOf(node(tree, "aside")).replace(/\s+/g, " ")).toContain(
      "sin haber guardado un código nuevo y válido, no podrás recuperarla mediante este método",
    );
    expect(textOf(tree)).not.toContain("no habrá otra oportunidad");
    expect(hooks.push).not.toHaveBeenCalled();
    expect(elements(tree).some((element) => element.type === "form")).toBe(false);
    expect(hooks.states[9]).toBe(""); // Password is cleared; careerScope is a separate state now.
    (display.props.onSaved as () => void)();
    expect(hooks.push).toHaveBeenCalledWith("/login");
    expect(hooks.states[1]).toBeNull();
  });

  it("si falta el código en un registro exitoso, no permite repetir el canje", async () => {
    let tree = render(ActivarPage);
    change(node(tree, "input"), "EXCOBA-TEST-ONLY");
    fetchMock.mockResolvedValueOnce(reply({ licenseId: "license-test" }));
    await submit(render(ActivarPage));
    tree = render(ActivarPage);
    change(node(tree, "input", 0), "Alumno de prueba");
    change(node(tree, "input", 1), "alumno@example.test");
    change(node(tree, "input", 2), "NuevaClaveSegura123");
    fetchMock.mockResolvedValueOnce(reply({ id: "user-test" }));
    await submit(render(ActivarPage));
    tree = render(ActivarPage);
    expect(textOf(tree)).toContain("Tu cuenta ya se creó");
    expect(textOf(tree)).toContain("genera uno nuevo desde tu perfil");
    expect(textOf(node(tree, "aside")).replace(/\s+/g, " ")).toContain(
      "Si el código no aparece, inicia sesión con la contraseña que elegiste",
    );
    expect(textOf(node(tree, "aside"))).not.toContain("que aparece abajo");
    expect(elements(tree).some((element) => element.type === "form")).toBe(false);
  });

  it("en perfil verifica la contraseña, advierte el reemplazo y borra la copia al confirmar", async () => {
    fetchMock.mockResolvedValueOnce(reply({ available: true, createdAt: "2026-09-13T12:00:00Z" }));
    let tree = render(RecoveryCodeSettings);
    hooks.effects.splice(0).forEach((effect) => effect());
    await vi.waitFor(() =>
      expect(hooks.states[0]).toEqual({ available: true, createdAt: "2026-09-13T12:00:00Z" }),
    );
    tree = render(RecoveryCodeSettings);
    expect(textOf(tree)).toContain("el anterior dejará de funcionar inmediatamente");
    expect(node(tree, "button").props.disabled).toBe(true);
    change(node(tree, "input"), "ClaveActual123");
    fetchMock.mockResolvedValueOnce(
      reply({ code: "REC-NEW-TEST", createdAt: "2026-09-13T13:00:00Z" }),
    );
    await submit(render(RecoveryCodeSettings));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/account/recovery-code",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({ currentPassword: "ClaveActual123" }),
      }),
    );
    expect(hooks.states[2]).toBe("");
    tree = render(RecoveryCodeSettings);
    const display = node(tree, RecoveryCodeDisplay);
    expect(display.props.code).toBe("REC-NEW-TEST");
    (display.props.onSaved as () => void)();
    expect(hooks.states[3]).toBeNull();
    expect(textOf(render(RecoveryCodeSettings))).toContain("Conserva tu copia privada");
  });

  it("impide generar dos códigos por doble envío antes del siguiente render", async () => {
    hooks.states = [
      { available: false, createdAt: null },
      0,
      "ClaveActual123",
      null,
      null,
      null,
      false,
      false,
    ];
    let release!: (value: ReturnType<typeof reply>) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const tree = render(RecoveryCodeSettings);
    const pending = submit(tree);
    await submit(tree);
    expect(fetchMock).toHaveBeenCalledOnce();
    release(reply({ code: "REC-NEW-TEST", createdAt: "2026-09-13T13:00:00Z" }));
    await pending;
    expect(hooks.states[3]).toBe("REC-NEW-TEST");
  });

  it("limpia código y contraseñas al abandonar la página", () => {
    let tree = render(RecuperarPasswordPage);
    hooks.effects.splice(0).forEach((effect) => effect());
    change(node(tree, "input", 1), "REC-TEST-ONLY");
    change(node(tree, "input", 3), "NuevaClaveSegura123");
    change(node(tree, "input", 4), "NuevaClaveSegura123");
    events.get("pagehide")!();
    expect(hooks.states.slice(1, 4)).toEqual(["", "", ""]);
  });
});
