"use strict";

// DATABASE_URL is inherited only through the environment, never CLI arguments.
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const ROOT = path.resolve(__dirname, "..");
const SCHEMA = path.join(ROOT, "prisma", "schema.prisma");
const BASELINE_SCHEMA = path.join(ROOT, "prisma", "baseline-schema.prisma");
const BASELINE = "00000000000000_baseline";

class MigrationCheckError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function assertRuntime() {
  if (![20, 22].includes(Number(process.versions.node.split(".")[0]))) {
    throw new MigrationCheckError("SUPPORTED_NODE_RUNTIME_REQUIRED");
  }
  const prismaVersion = require("prisma/package.json").version;
  if (Number(prismaVersion.split(".")[0]) !== 5) {
    throw new MigrationCheckError("PRISMA_5_REQUIRED");
  }
}

function runPrismaCli(args) {
  const cli = require.resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: ROOT,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Prisma CLI output may contain connection details: never emit it.
  if (result.error || result.signal || result.status === null) {
    throw new MigrationCheckError("PRISMA_COMMAND_FAILED");
  }
  return result.status;
}

/** Dependencies are injectable for offline tests; the CLI uses real defaults. */
async function migrateLicenses({
  createClient = () => new PrismaClient({ log: [] }),
  runCommand = runPrismaCli,
} = {}) {
  let client;
  try {
    client = createClient();
    const schemas = await client.$queryRaw`
      SELECT current_schema() AS name
    `;
    if (schemas[0]?.name !== "public") throw new MigrationCheckError("UNEXPECTED_SCHEMA");
    const tableRows = await client.$queryRaw`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('License', '_prisma_migrations')
    `;
    const tables = new Set(tableRows.map((table) => table.name));
    if (!tables.has("License")) throw new MigrationCheckError("EXISTING_LICENSE_TABLE_REQUIRED");
    const history = tables.has("_prisma_migrations")
      ? await client.$queryRaw`
          SELECT migration_name AS name,
                 finished_at IS NOT NULL AS finished,
                 rolled_back_at IS NOT NULL AS "rolledBack"
          FROM "_prisma_migrations"
          ORDER BY started_at, migration_name
        `
      : [];
    await client.$disconnect();
    client = undefined;

    if (history.some((migration) => !migration.finished && !migration.rolledBack)) {
      throw new MigrationCheckError("UNFINISHED_MIGRATION");
    }
    let baselineRecorded = false;
    if (history.length === 0) {
      // Exit 0 means exact schema equality; exit 2 means drift. A diff error
      // must never be interpreted as permission to mark or apply a baseline.
      const comparison = runCommand([
        "migrate", "diff",
        "--from-schema-datamodel", BASELINE_SCHEMA,
        "--to-schema-datasource", SCHEMA,
        "--exit-code",
      ]);
      if (comparison !== 0) {
        throw new MigrationCheckError(comparison === 2 ? "BASELINE_DRIFT" : "BASELINE_CHECK_FAILED");
      }
      const resolved = runCommand([
        "migrate", "resolve", "--applied", BASELINE, "--schema", SCHEMA,
      ]);
      if (resolved !== 0) throw new MigrationCheckError("BASELINE_RESOLVE_FAILED");
      baselineRecorded = true;
    } else if (!history.some((migration) =>
      migration.name === BASELINE && migration.finished && !migration.rolledBack
    )) {
      // Never run the baseline CREATE statements against an existing database.
      throw new MigrationCheckError("BASELINE_NOT_RECORDED");
    }

    const deployed = runCommand(["migrate", "deploy", "--schema", SCHEMA]);
    if (deployed !== 0) throw new MigrationCheckError("ADDITIVE_MIGRATION_FAILED");

    client = createClient();
    const columns = await client.$queryRaw`
      SELECT data_type AS "dataType", is_nullable AS "isNullable",
             column_default AS "default"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'License' AND column_name = 'validityMonths'
    `;
    const column = columns[0];
    if (
      columns.length !== 1 || column.dataType !== "integer" ||
      column.isNullable !== "YES" || column.default !== null
    ) {
      throw new MigrationCheckError("VALIDITY_COLUMN_MISMATCH");
    }
    return { baselineRecorded, schema: "public", validityMonths: column };
  } catch (error) {
    if (error instanceof MigrationCheckError) throw error;
    // Database/driver exceptions can embed connection details.
    throw new MigrationCheckError("DATABASE_INSPECTION_FAILED");
  } finally {
    if (client) {
      try {
        await client.$disconnect();
      } catch {
        throw new MigrationCheckError("DATABASE_DISCONNECT_FAILED");
      }
    }
  }
}

async function main() {
  try {
    assertRuntime();
    const result = await migrateLicenses();
    console.log(JSON.stringify({ event: "license-db-migration", ok: true, ...result }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "license-db-migration",
      ok: false,
      error: error instanceof MigrationCheckError ? error.code : "MIGRATION_FAILED",
    }));
    process.exitCode = 1;
  }
}

module.exports = { migrateLicenses };
if (require.main === module) void main();
