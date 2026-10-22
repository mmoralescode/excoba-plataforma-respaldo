/**
 * Read-only deployment preflight. DATABASE_URL stays inside the execution
 * environment; never print connection details, license rows or user emails.
 * Run only in the approved database environment: tsx scripts/license-db-preflight.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";

type NamedRecord = { id: string; name: string };
type ColumnMetadata = {
  name: string;
  dataType: string;
  isNullable: string;
  default: string | null;
};

async function main() {
  let client: PrismaClient | undefined;
  try {
    client = new PrismaClient({ log: [] });
    const report = await client.$transaction(async (tx) => {
      // PostgreSQL enforces read-only behavior for the entire inspection.
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const schema = await tx.$queryRaw<{ name: string | null }[]>`
        SELECT current_schema() AS name
      `;
      const tableRows = await tx.$queryRaw<{ name: string }[]>`
        SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN ('License', 'Product', 'User', 'Role', 'UserRole', '_prisma_migrations')
        ORDER BY table_name
      `;
      const tables = new Set(tableRows.map((table) => table.name));
      const licenseColumns = await tx.$queryRaw<ColumnMetadata[]>`
        SELECT column_name AS name, data_type AS "dataType",
               is_nullable AS "isNullable", column_default AS "default"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'License'
          AND column_name = 'validityMonths'
      `;

      // No generated-client License query is used: the new column may not exist.
      const applied = tables.has("_prisma_migrations")
        ? await tx.$queryRaw<{ name: string }[]>`
            SELECT migration_name AS name
            FROM "_prisma_migrations"
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
            ORDER BY started_at, migration_name
          `
        : [];
      const unfinished = tables.has("_prisma_migrations")
        ? await tx.$queryRaw<{ name: string }[]>`
            SELECT migration_name AS name
            FROM "_prisma_migrations"
            WHERE finished_at IS NULL AND rolled_back_at IS NULL
            ORDER BY started_at, migration_name
          `
        : [];
      const activeProducts = tables.has("Product")
        ? await tx.$queryRaw<NamedRecord[]>`
            SELECT id, name FROM "Product"
            WHERE "isActive" = TRUE
            ORDER BY name, id
          `
        : null;
      const administrators = ["User", "Role", "UserRole"].every((name) => tables.has(name))
        ? await tx.$queryRaw<NamedRecord[]>`
            SELECT DISTINCT u.id, u.name
            FROM "User" AS u
            JOIN "UserRole" AS ur ON ur."userId" = u.id
            JOIN "Role" AS r ON r.id = ur."roleId"
            WHERE u.status = 'ACTIVO' AND u."deletedAt" IS NULL
              AND r.name IN ('SUPER_ADMIN', 'SOPORTE')
            ORDER BY u.name, u.id
          `
        : null;

      return {
        event: "license-db-preflight",
        ok: true,
        schema: schema[0]?.name ?? null,
        license: {
          exists: tables.has("License"),
          validityMonths: licenseColumns[0] ?? null,
        },
        migrations: {
          tableExists: tables.has("_prisma_migrations"),
          applied: applied.map((migration) => migration.name),
          unfinished: unfinished.map((migration) => migration.name),
        },
        activeProducts,
        administrators,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 });
    console.log(JSON.stringify(report));
  } catch {
    // Deliberately exclude exception objects: driver errors can contain secrets.
    console.error(JSON.stringify({
      event: "license-db-preflight", ok: false,
      error: "No fue posible completar la inspección de solo lectura de la base de datos.",
    }));
    process.exitCode = 1;
  } finally {
    if (client) {
      try {
        await client.$disconnect();
      } catch {
        console.error(JSON.stringify({
          event: "license-db-preflight", ok: false,
          error: "No fue posible cerrar la conexión de inspección.",
        }));
        process.exitCode = 1;
      }
    }
  }
}

void main();
