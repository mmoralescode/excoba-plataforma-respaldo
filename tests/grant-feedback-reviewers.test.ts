import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FeedbackReviewerConfigurationError,
  FeedbackReviewerGrantError,
  feedbackReviewerErrorReport,
  grantFeedbackReviewers,
  parseFeedbackReviewerEmails,
  runFeedbackReviewerCommand,
} from "../scripts/grant-feedback-reviewers";

const now = new Date("2026-09-14T18:00:00Z");
const emails = ["reviewer@example.test", "other-reviewer@example.test"];
function account(index: number, enabled = false) {
  return {
    id: `private-account-${index}`,
    email: emails[index]!,
    status: "ACTIVO",
    deletedAt: null as Date | null,
    canReviewFeedback: enabled,
    roles: [{ role: { name: "ALUMNO" } }],
    license: {
      userId: `private-account-${index}`,
      status: "ACTIVADA",
      startsAt: new Date("2026-09-01T18:00:00Z"),
      expiresAt: new Date("2027-03-01T18:00:00Z"),
    },
  };
}
const mocks = {
  initial: vi.fn(),
  fresh: vi.fn(),
  lock: vi.fn(),
  update: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
};
const tx = {
  $queryRaw: mocks.lock,
  user: { findMany: mocks.fresh, updateMany: mocks.update },
  auditLog: { create: mocks.audit },
};
const client = {
  user: { findMany: mocks.initial },
  $transaction: mocks.transaction,
} as unknown as Parameters<typeof grantFeedbackReviewers>[0];

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.initial.mockResolvedValue([account(0), account(1)]);
  mocks.fresh.mockResolvedValue([account(0), account(1)]);
  mocks.lock.mockResolvedValue([{ id: account(0).id }, { id: account(1).id }]);
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.audit.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (callback) => callback(tx));
});
afterEach(() => vi.useRealTimers());

describe("Configuración operativa explícita", () => {
  it("normaliza mayúsculas y espacios sin publicar direcciones reales", () => {
    expect(
      parseFeedbackReviewerEmails('[" REVIEWER@EXAMPLE.TEST ","Other-Reviewer@Example.Test"]'),
    ).toEqual(emails);
  });

  it.each([
    undefined,
    "",
    "[",
    '"reviewer@example.test"',
    "[]",
    '["reviewer@example.test",null]',
    '["reviewer@example.test"," REVIEWER@EXAMPLE.TEST "]',
    '["https://secret-database.invalid/password"]',
    JSON.stringify(Array.from({ length: 21 }, (_, index) => `reviewer-${index}@example.test`)),
  ])("rechaza una lista inválida antes de consultar la base (%s)", (input) => {
    expect(() => parseFeedbackReviewerEmails(input)).toThrow(FeedbackReviewerConfigurationError);
    expect(mocks.initial).not.toHaveBeenCalled();
  });

  it("el comando sin --apply es estrictamente de solo lectura", async () => {
    const report = await runFeedbackReviewerCommand(client, [], {
      FEEDBACK_REVIEWER_EMAILS: JSON.stringify(emails),
    });
    expect(report.mode).toBe("dry-run");
    expect(mocks.initial).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("el comando solo modifica cuentas si recibe --apply literalmente", async () => {
    const report = await runFeedbackReviewerCommand(client, ["--apply"], {
      FEEDBACK_REVIEWER_EMAILS: JSON.stringify(emails),
    });
    expect(report.mode).toBe("apply");
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it.each([["--apply=true"], ["--force"], ["--apply", "--apply"], ["--apply", "unknown"]])(
    "rechaza argumentos ambiguos o desconocidos %j sin consultar DB",
    async (...args) => {
      await expect(
        runFeedbackReviewerCommand(client, args, {
          FEEDBACK_REVIEWER_EMAILS: JSON.stringify(emails),
        }),
      ).rejects.toBeInstanceOf(FeedbackReviewerConfigurationError);
      expect(mocks.initial).not.toHaveBeenCalled();
    },
  );

  it("no expone errores de DB, credenciales, IDs ni stack en la salida operativa", () => {
    const privateText = "postgres://admin:secret@internal.invalid/db?token=private-account-0";
    const report = feedbackReviewerErrorReport(new Error(privateText));
    expect(report).toEqual({
      event: "feedback-reviewer-grant",
      ok: false,
      error: "No fue posible completar la operación de permisos del buzón.",
    });
    expect(JSON.stringify(report)).not.toContain(privateText);
    expect(JSON.stringify(report)).not.toContain("stack");
  });
});

describe("Resolución de cuentas existentes sin cambios implícitos", () => {
  it("la función también es dry-run por defecto y reporta solo campos públicos previstos", async () => {
    const report = await grantFeedbackReviewers(client, emails);
    expect(report).toEqual({
      mode: "dry-run",
      accounts: emails.map((email) => ({ email, canReviewFeedback: false })),
      missingEmails: [],
      unavailableEmails: [],
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain("private-account");
    const query = mocks.initial.mock.calls[0]![0];
    expect(query.where.OR).toEqual(
      emails.map((email) => ({ email: { equals: email, mode: "insensitive" } })),
    );
    expect(query.select).not.toHaveProperty("passwordHash");
    expect(query.select).not.toHaveProperty("recoveryCodeHash");
    expect(query.select).not.toHaveProperty("sessions");
  });

  it("resuelve sin importar las mayúsculas almacenadas", async () => {
    mocks.initial.mockResolvedValue([
      { ...account(0), email: emails[0]!.toUpperCase() },
      account(1),
    ]);
    expect((await grantFeedbackReviewers(client, emails)).accounts).toHaveLength(2);
  });

  it("una cuenta ausente aborta la concesión de las demás sin crearla", async () => {
    mocks.initial.mockResolvedValue([account(0)]);
    await expect(grantFeedbackReviewers(client, emails, { apply: true })).rejects.toMatchObject({
      report: {
        missingEmails: [emails[1]],
        accounts: [{ email: emails[0], canReviewFeedback: false }],
      },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("variantes duplicadas del mismo correo son ambiguas, no elige una arbitrariamente", async () => {
    mocks.initial.mockResolvedValue([
      account(0),
      { ...account(0), id: "duplicate-private-id", email: emails[0]!.toUpperCase() },
      account(1),
    ]);
    await expect(grantFeedbackReviewers(client, emails, { apply: true })).rejects.toMatchObject({
      report: { unavailableEmails: [emails[0]] },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["suspendida", { status: "SUSPENDIDO" }],
    ["eliminada", { deletedAt: now }],
    ["sin licencia", { license: null }],
    ["licencia vencida", { license: { ...account(1).license, expiresAt: now } }],
    ["licencia futura", { license: { ...account(1).license, startsAt: new Date("2027-01-01") } }],
    ["licencia ajena", { license: { ...account(1).license, userId: "other-user" } }],
    ["licencia revocada", { license: { ...account(1).license, status: "REVOCADA" } }],
    ["sin rol alumno", { roles: [] }],
  ] as const)("una cuenta %s impide todas las concesiones", async (_, change) => {
    mocks.initial.mockResolvedValue([account(0), { ...account(1), ...change }]);
    await expect(grantFeedbackReviewers(client, emails, { apply: true })).rejects.toBeInstanceOf(
      FeedbackReviewerGrantError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("Concesión atómica, mínima y auditable", () => {
  it("bloquea y revalida antes de actualizar exclusivamente los IDs solicitados", async () => {
    const report = await grantFeedbackReviewers(client, emails, { apply: true });
    expect(report.accounts).toEqual(emails.map((email) => ({ email, canReviewFeedback: true })));
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
      timeout: 15000,
    });
    const sqlParts = mocks.lock.mock.calls[0]![0] as TemplateStringsArray;
    expect(sqlParts.join("?")).toContain('ORDER BY "id" FOR UPDATE');
    expect(mocks.lock.mock.calls[0]![1].values).toEqual([account(0).id, account(1).id]);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fresh.mock.invocationCallOrder[0]!,
    );
    expect(mocks.fresh.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0]!,
    );
    for (const index of [0, 1]) {
      expect(mocks.update).toHaveBeenNthCalledWith(index + 1, {
        where: {
          id: account(index).id,
          email: emails[index],
          status: "ACTIVO",
          deletedAt: null,
          canReviewFeedback: false,
        },
        data: { canReviewFeedback: true },
      });
      expect(mocks.audit).toHaveBeenNthCalledWith(index + 1, {
        data: {
          actorId: null,
          action: "FEEDBACK_REVIEW_PERMISSION_GRANTED",
          entity: "User",
          entityId: account(index).id,
          metadata: { source: "operator-request", permission: "feedback-review" },
        },
      });
    }
    const writes = JSON.stringify([mocks.update.mock.calls, mocks.audit.mock.calls]);
    for (const field of ["roles", "passwordHash", "recoveryCode", "license", "session"]) {
      expect(writes).not.toContain(field);
    }
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("@example.test");
  });

  it("es idempotente: permisos existentes no se escriben ni auditan de nuevo", async () => {
    mocks.initial.mockResolvedValue([account(0, true), account(1, true)]);
    mocks.fresh.mockResolvedValue([account(0, true), account(1, true)]);
    const report = await grantFeedbackReviewers(client, emails, { apply: true });
    expect(report.accounts.every((account) => account.canReviewFeedback)).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("actualiza solo el permiso todavía no concedido", async () => {
    mocks.fresh.mockResolvedValue([account(0, true), account(1)]);
    await grantFeedbackReviewers(client, emails, { apply: true });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update.mock.calls[0]![0].where.id).toBe(account(1).id);
    expect(mocks.audit).toHaveBeenCalledOnce();
  });

  it("una cuenta que desaparece durante el lock cancela todo", async () => {
    mocks.lock.mockResolvedValue([{ id: account(0).id }]);
    await expect(grantFeedbackReviewers(client, emails, { apply: true })).rejects.toBeInstanceOf(
      FeedbackReviewerGrantError,
    );
    expect(mocks.fresh).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    ["suspensión", [account(0), { ...account(1), status: "SUSPENDIDO" }]],
    ["eliminación", [account(0), { ...account(1), deletedAt: now }]],
    ["cambio de correo", [account(0), { ...account(1), email: "changed@example.test" }]],
    ["reemplazo de identidad", [account(0), { ...account(1), id: "new-id" }]],
    ["ambigüedad nueva", [account(0), account(1), { ...account(1), id: "duplicate-id" }]],
  ] as const)("revalida %s después del lock y antes de cualquier escritura", async (_, rows) => {
    mocks.fresh.mockResolvedValue(rows);
    await expect(grantFeedbackReviewers(client, emails, { apply: true })).rejects.toBeInstanceOf(
      FeedbackReviewerGrantError,
    );
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("la vigencia se vuelve a evaluar con reloj fresco después de esperar los locks", async () => {
    const soon = new Date(now.getTime() + 1000);
    const rows = [
      account(0),
      { ...account(1), license: { ...account(1).license, expiresAt: soon } },
    ];
    mocks.initial.mockResolvedValue(rows);
    mocks.fresh.mockResolvedValue(rows);
    mocks.lock.mockImplementation(async () => {
      vi.setSystemTime(soon);
      return rows.map(({ id }) => ({ id }));
    });
    await expect(grantFeedbackReviewers(client, emails, { apply: true })).rejects.toBeInstanceOf(
      FeedbackReviewerGrantError,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["update", "audit"] as const)(
    "revierte el primer permiso si falla %s en la misma transacción",
    async (failure) => {
      const state = { granted: [] as string[], audited: [] as string[] };
      mocks.transaction.mockImplementation(async (callback) => {
        const snapshot = structuredClone(state);
        try {
          return await callback(tx);
        } catch (error) {
          Object.assign(state, snapshot);
          throw error;
        }
      });
      mocks.update.mockImplementation(async (input) => {
        if (failure === "update" && state.granted.length === 1) return { count: 0 };
        state.granted.push(input.where.id);
        return { count: 1 };
      });
      mocks.audit.mockImplementation(async (input) => {
        if (failure === "audit") throw new Error("Transaction audit unavailable");
        state.audited.push(input.data.entityId);
        return {};
      });
      await expect(grantFeedbackReviewers(client, emails, { apply: true })).rejects.toBeInstanceOf(
        Error,
      );
      expect(state).toEqual({ granted: [], audited: [] });
    },
  );
});
