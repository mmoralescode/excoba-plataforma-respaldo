/** Read-only production inspection. Never logs credentials, folios or personal data. */
import { PrismaClient } from "@prisma/client";

async function main() {
  const db = new PrismaClient({ log: [] });
  try {
    const report = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const products = await tx.product.findMany({ where: { isActive: true }, select: { id: true, name: true } });
      const administrators = await tx.user.findMany({
        where: { status: "ACTIVO", deletedAt: null, roles: { some: { role: { name: { in: ["SUPER_ADMIN", "SOPORTE"] } } } } },
        select: { id: true },
      });
      const licenseGroups = await tx.$queryRaw`
        SELECT "validityMonths", "validityDays", status::text, count(*)::int AS count,
          count("userId")::int AS activated_accounts
        FROM "License" GROUP BY "validityMonths", "validityDays", status ORDER BY "validityMonths", status
      `;
      const legacyDateTerms = await tx.$queryRaw`
        SELECT id, status::text, "validityDays", "startsAt", "expiresAt", "activatedAt",
          ("userId" IS NOT NULL) AS has_account
        FROM "License" WHERE "validityMonths" IS NULL AND ("startsAt" IS NOT NULL OR "expiresAt" IS NOT NULL)
      `;
      const sixMonthTargets = await tx.$queryRaw`
        SELECT "validityMonths", "validityDays", status::text, count(*)::int AS count,
          count("userId")::int AS accounts
        FROM "License" WHERE "validityMonths" = 6 OR ("validityMonths" IS NULL AND "validityDays" = 180)
        GROUP BY "validityMonths", "validityDays", status
      `;
      const columns = await tx.$queryRaw`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'License'
        AND column_name IN ('careerScope', 'selectedCareerId', 'careerSelectedAt')
      `;
      const migrations = await tx.$queryRaw`
        SELECT migration_name, finished_at IS NOT NULL AS finished
        FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY migration_name
      `;
      return {
        operation: "license-plans-readonly-preflight", products, administrators, licenseGroups,
        legacyDateTerms, sixMonthTargets, columns, migrations,
        preservedCounts: { users: await tx.user.count(), attempts: await tx.attempt.count(), progress: await tx.progress.count(), questions: await tx.question.count() },
      };
    }, { timeout: 30000 });
    for (const [section, value] of Object.entries(report)) {
      console.info(JSON.stringify({ inspection: "license-plans", section, value }));
    }
  } finally { await db.$disconnect(); }
}

main().catch(() => {
  console.error("[license-plans-preflight] Read-only inspection failed; connection details omitted.");
  process.exitCode = 1;
});
