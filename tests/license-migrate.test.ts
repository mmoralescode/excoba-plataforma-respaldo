import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

type HistoryEntry = { name: string; finished: boolean; rolledBack: boolean };
type Column = { dataType: string; isNullable: string; default: string | null };
type InspectionClient = { $queryRaw: ReturnType<typeof vi.fn>; $disconnect: ReturnType<typeof vi.fn> };
const { migrateLicenses } = createRequire(import.meta.url)("../scripts/license-migrate.cjs") as {
  migrateLicenses: (deps: {
    createClient: () => InspectionClient;
    runCommand: (args: string[]) => number;
  }) => Promise<{ baselineRecorded: boolean; validityMonths: Column }>;
};
const baseline = { name: "00000000000000_baseline", finished: true, rolledBack: false };

function setup(options: {
  schema?: string; licenseExists?: boolean; history?: HistoryEntry[];
  diffExit?: number; resolveExit?: number; deployExit?: number; column?: Column | null;
} = {}) {
  const column = options.column === undefined
    ? { dataType: "integer", isNullable: "YES", default: null } : options.column;
  const client: InspectionClient = {
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => {
      const query = parts.join("");
      if (query.includes("current_schema() AS name")) return [{ name: options.schema ?? "public" }];
      if (query.includes("information_schema.tables")) return [
        ...(options.licenseExists === false ? [] : [{ name: "License" }]),
        ...(options.history === undefined ? [] : [{ name: "_prisma_migrations" }]),
      ];
      if (query.includes('FROM "_prisma_migrations"')) return options.history ?? [];
      if (query.includes("information_schema.columns")) return column ? [column] : [];
      throw new Error("Unexpected query");
    }),
    $disconnect: vi.fn(async () => undefined),
  };
  const runCommand = vi.fn((args: string[]) => {
    if (args[1] === "diff") return options.diffExit ?? 0;
    if (args[1] === "resolve") return options.resolveExit ?? 0;
    if (args[1] === "deploy") return options.deployExit ?? 0;
    throw new Error("Unexpected CLI command");
  });
  return { client, runCommand, deps: { createClient: () => client, runCommand } };
}
const commands = (runCommand: ReturnType<typeof setup>["runCommand"]) =>
  runCommand.mock.calls.map(([args]) => args.slice(0, 2).join(" "));

describe("Migración controlada de una base existente, sin conexión real", () => {
  it("solo tras igualdad exacta registra baseline y aplica la migración", async () => {
    const test = setup();
    const result = await migrateLicenses(test.deps);
    expect(commands(test.runCommand)).toEqual(["migrate diff", "migrate resolve", "migrate deploy"]);
    expect(test.runCommand.mock.calls[0]![0]).toContain("--exit-code");
    expect(test.runCommand.mock.calls[0]![0]).toContain("--to-schema-datasource");
    expect(test.runCommand.mock.calls[1]![0]).toContain("--applied");
    expect(test.runCommand.mock.calls[1]![0]).toContain(baseline.name);
    expect(result.baselineRecorded).toBe(true);
    expect(result.validityMonths).toEqual({ dataType: "integer", isNullable: "YES", default: null });
  });

  it.each([
    [2, "BASELINE_DRIFT"], [1, "BASELINE_CHECK_FAILED"],
  ])("si diff devuelve %s no ejecuta ningún comando mutante", async (exit, error) => {
    const test = setup({ diffExit: Number(exit) });
    await expect(migrateLicenses(test.deps)).rejects.toThrow(String(error));
    expect(commands(test.runCommand)).toEqual(["migrate diff"]);
  });

  it("una tabla de historial vacía también requiere comprobar baseline", async () => {
    const test = setup({ history: [], diffExit: 2 });
    await expect(migrateLicenses(test.deps)).rejects.toThrow("BASELINE_DRIFT");
    expect(commands(test.runCommand)).toEqual(["migrate diff"]);
  });

  it("no despliega si falla registrar el baseline como aplicado", async () => {
    const test = setup({ resolveExit: 1 });
    await expect(migrateLicenses(test.deps)).rejects.toThrow("BASELINE_RESOLVE_FAILED");
    expect(commands(test.runCommand)).toEqual(["migrate diff", "migrate resolve"]);
  });

  it("un baseline ya aplicado nunca vuelve a ejecutar sus CREATE", async () => {
    const test = setup({ history: [baseline] });
    expect((await migrateLicenses(test.deps)).baselineRecorded).toBe(false);
    expect(commands(test.runCommand)).toEqual(["migrate deploy"]);
  });

  it("no aplica CREATE del baseline si existe un historial distinto", async () => {
    const test = setup({ history: [{ ...baseline, name: "some-other-migration" }] });
    await expect(migrateLicenses(test.deps)).rejects.toThrow("BASELINE_NOT_RECORDED");
    expect(test.runCommand).not.toHaveBeenCalled();
  });

  it("no resuelve automáticamente una migración incompleta", async () => {
    const test = setup({ history: [baseline, { name: "failed", finished: false, rolledBack: false }] });
    await expect(migrateLicenses(test.deps)).rejects.toThrow("UNFINISHED_MIGRATION");
    expect(test.runCommand).not.toHaveBeenCalled();
  });

  it("rechaza una conexión a otro esquema sin mutaciones", async () => {
    const test = setup({ schema: "other" });
    await expect(migrateLicenses(test.deps)).rejects.toThrow("UNEXPECTED_SCHEMA");
    expect(test.runCommand).not.toHaveBeenCalled();
  });

  it("no inicializa por accidente una base vacía", async () => {
    const test = setup({ licenseExists: false });
    await expect(migrateLicenses(test.deps)).rejects.toThrow("EXISTING_LICENSE_TABLE_REQUIRED");
    expect(test.runCommand).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { dataType: "text", isNullable: "YES", default: null },
    { dataType: "integer", isNullable: "NO", default: null },
    { dataType: "integer", isNullable: "YES", default: "6" },
  ])("exige columna integer nullable sin default después del deploy", async (column) => {
    const test = setup({ history: [baseline], column });
    await expect(migrateLicenses(test.deps)).rejects.toThrow("VALIDITY_COLUMN_MISMATCH");
  });

  it("no confirma un deploy fallido", async () => {
    const test = setup({ history: [baseline], deployExit: 1 });
    await expect(migrateLicenses(test.deps)).rejects.toThrow("ADDITIVE_MIGRATION_FAILED");
  });

  it("redacta los errores del driver y cierra la conexión", async () => {
    const test = setup();
    test.client.$queryRaw.mockRejectedValueOnce(new Error("postgresql://user:secret@host/db"));
    await expect(migrateLicenses(test.deps)).rejects.toThrow("DATABASE_INSPECTION_FAILED");
    expect(test.runCommand).not.toHaveBeenCalled();
    expect(test.client.$disconnect).toHaveBeenCalled();
  });
});
