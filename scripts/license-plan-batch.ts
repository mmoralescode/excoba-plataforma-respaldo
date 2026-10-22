/** Explicit operator tool: secrets stay outside the repository; DB stores hashes only. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Prisma, PrismaClient } from "@prisma/client";
import { generateLicenseFolio, hashToken } from "../src/lib/security/tokens";
import { addCalendarMonths } from "../src/lib/license-validity";

export const planRecordSchema = z.object({
  id: z.string().uuid(),
  codeHash: z.string().regex(/^[a-f0-9]{64}$/),
  codeLastFour: z.string().regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/),
  validityMonths: z.union([z.literal(2), z.literal(4)]),
  careerScope: z.enum(["ALL_CAREERS", "SINGLE_CAREER"]),
}).strict().refine(record => record.careerScope === (record.validityMonths === 2 ? "SINGLE_CAREER" : "ALL_CAREERS"), "INVALID_PLAN_PAIR");

export const planManifestSchema = z.object({
  version: z.literal(2),
  batchId: z.string().uuid(),
  productId: z.string().min(1),
  adminId: z.string().uuid(),
  expectedRetiredCount: z.literal(70),
  expectedActivatedRetiredCount: z.literal(2),
  records: z.array(planRecordSchema).length(20),
}).strict().superRefine((manifest, context) => {
  if (new Set(manifest.records.map(record => record.id)).size !== 20 ||
      new Set(manifest.records.map(record => record.codeHash)).size !== 20 ||
      manifest.records.filter(record => record.validityMonths === 2).length !== 10 ||
      manifest.records.filter(record => record.validityMonths === 4).length !== 10) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "EXACTLY_TEN_UNIQUE_RECORDS_PER_PLAN_REQUIRED" });
  }
});
type Manifest = z.infer<typeof planManifestSchema>;
type RetiredLicense = { id: string; status: string; userId: string | null; validityMonths: number | null; validityDays: number | null };
type IssuedLicense = {
  id: string; productId: string; codeHash: string; codeLastFour: string; validityMonths: number | null;
  careerScope: string; selectedCareerId: string | null; careerSelectedAt: Date | null;
  createdByAdminId: string | null; maxActivations: number; status: string; activatedAt: Date | null;
  startsAt: Date | null; expiresAt: Date | null; userId: string | null;
};

export function validateIssuedBatch(manifest: Manifest, existing: IssuedLicense[]) {
  if (existing.length !== 20) throw new Error("ISSUED_BATCH_COUNT_MISMATCH");
  for (const license of existing) {
    const record = manifest.records.find(item => item.id === license.id);
    const validDates = license.activatedAt
      ? license.status === "ACTIVADA" && license.startsAt?.getTime() === license.activatedAt.getTime() &&
        license.expiresAt?.getTime() === addCalendarMonths(license.activatedAt, license.validityMonths!).getTime() && !!license.userId
      : license.startsAt === null && license.expiresAt === null && license.userId === null && license.status === "CREADA";
    if (!record || !validDates || record.codeHash !== license.codeHash || record.codeLastFour !== license.codeLastFour ||
        record.validityMonths !== license.validityMonths || record.careerScope !== license.careerScope ||
        license.productId !== manifest.productId || license.createdByAdminId !== manifest.adminId || license.maxActivations !== 1 ||
        (!license.activatedAt && (license.selectedCareerId !== null || license.careerSelectedAt !== null)) ||
        ((license.selectedCareerId === null) !== (license.careerSelectedAt === null))) throw new Error("ISSUED_BATCH_MISMATCH");
  }
}

export async function applyOrVerifyBatch(db: PrismaClient, manifest: Manifest, command: "apply" | "verify") {
  const reference = `career-plan-batch:${manifest.batchId}`;
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${reference}))::text`;
    // Blocks competing issuers/claims for the short maintenance transaction.
    await tx.$executeRaw`LOCK TABLE "License" IN SHARE ROW EXCLUSIVE MODE`;
    const retired = await tx.$queryRaw<RetiredLicense[]>`
      SELECT id, status::text, "userId", "validityMonths", "validityDays" FROM "License"
      WHERE "validityMonths" = 6 OR ("validityMonths" IS NULL AND "validityDays" = 180)
      ORDER BY id
    `;
    if (retired.length !== manifest.expectedRetiredCount || retired.filter(row => row.userId !== null).length !== manifest.expectedActivatedRetiredCount) {
      throw new Error("RETIREMENT_TARGETS_CHANGED_RUN_PREFLIGHT_AGAIN");
    }
    const existing = await tx.license.findMany({ where: { purchaseReference: reference } });
    const audit = await tx.auditLog.findFirst({ where: { action: "LICENSE_PLANS_REPLACED", entity: "LicenseBatch", entityId: manifest.batchId } });
    if (existing.length) {
      validateIssuedBatch(manifest, existing);
      if (!audit || retired.some(license => license.status !== "REVOCADA")) throw new Error("RETIREMENT_NOT_COMPLETE");
      return { created: 0, verified: 20, retired: retired.length, activatedAccountsRetired: 2, pendingActivation: existing.filter(row => !row.activatedAt).length };
    }
    if (command === "verify") throw new Error("BATCH_NOT_ISSUED");
    if (audit) throw new Error("AUDIT_EXISTS_WITHOUT_BATCH");
    const product = await tx.product.findUnique({ where: { id: manifest.productId } });
    const administrator = await tx.user.findFirst({
      where: { id: manifest.adminId, status: "ACTIVO", deletedAt: null, roles: { some: { role: { name: { in: ["SUPER_ADMIN", "SOPORTE"] } } } } },
      select: { id: true },
    });
    if (!product?.isActive || !administrator) throw new Error("INVALID_PRODUCT_OR_ADMIN");
    const preservedBefore = { users: await tx.user.count(), attempts: await tx.attempt.count(), progress: await tx.progress.count(), questions: await tx.question.count() };
    const beforeSnapshot = retired.map(license => ({ ...license }));
    const now = new Date();
    const targetIds = retired.map(license => license.id);
    const targetUserIds = retired.flatMap(license => license.userId ? [license.userId] : []);
    const revokedSessions = await tx.session.updateMany({ where: { userId: { in: targetUserIds }, revokedAt: null }, data: { revokedAt: now } });
    await tx.license.updateMany({ where: { id: { in: targetIds } }, data: { status: "REVOCADA" } });
    await tx.licenseEvent.createMany({ data: retired.filter(license => license.status !== "REVOCADA").map(license => ({
      licenseId: license.id, adminId: manifest.adminId, type: "REVOCACION" as const,
      reason: "Retiro de todos los folios de seis meses/180 días solicitado por el propietario. Cuenta y progreso conservados.",
    })) });
    await tx.license.createMany({ data: manifest.records.map(record => ({
      ...record, productId: manifest.productId, createdByAdminId: manifest.adminId, purchaseReference: reference,
      maxActivations: 1, status: "CREADA" as const, userId: null, startsAt: null, activatedAt: null, expiresAt: null,
      selectedCareerId: null, careerSelectedAt: null,
    })) });
    await tx.licenseEvent.createMany({ data: manifest.records.map(record => ({
      licenseId: record.id, type: "CREACION" as const, adminId: manifest.adminId,
      reason: record.validityMonths === 2 ? "Dos meses naturales desde activación. Solo la primera carrera confirmada." : "Cuatro meses naturales desde activación. Todas las carreras.",
    })) });
    const issued = await tx.license.findMany({ where: { purchaseReference: reference } });
    validateIssuedBatch(manifest, issued);
    const remaining = await tx.license.count({ where: { id: { in: targetIds }, status: { not: "REVOCADA" } } });
    if (remaining) throw new Error("RETIREMENT_VERIFICATION_FAILED");
    await tx.auditLog.create({ data: {
      actorId: manifest.adminId, action: "LICENSE_PLANS_REPLACED", entity: "LicenseBatch", entityId: manifest.batchId,
      metadata: { issuedCount: 20, fourMonthAllCareers: 10, twoMonthSingleCareer: 10, retiredCount: retired.length,
        revokedSessions: revokedSessions.count, previousLicenses: beforeSnapshot, preservedCounts: preservedBefore },
    } });
    return { created: 20, verified: 20, retired: retired.length, activatedAccountsRetired: 2, pendingActivation: 20, revokedSessions: revokedSessions.count, preservedCounts: preservedBefore };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

function option(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error("MISSING_OPTION");
  return process.argv[index + 1]!;
}

async function main() {
  const command = process.argv[2];
  const file = path.resolve(option("--file"));
  if (command === "prepare") {
    const parent = await realpath(path.dirname(file));
    const repository = await realpath(path.resolve(__dirname, ".."));
    const relative = path.relative(repository.toLowerCase(), parent.toLowerCase());
    if (!relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("PRIVATE_FILE_MUST_BE_OUTSIDE_REPOSITORY");
    const privateRecords = [4, 2].flatMap(months => Array.from({ length: 10 }, () => {
      const folio = generateLicenseFolio();
      return { id: randomUUID(), folio, codeHash: hashToken(folio), codeLastFour: folio.slice(-4), validityMonths: months, careerScope: months === 2 ? "SINGLE_CAREER" : "ALL_CAREERS" };
    }));
    const manifest = planManifestSchema.parse({ version: 2, batchId: randomUUID(), productId: option("--product"), adminId: option("--admin"), expectedRetiredCount: 70, expectedActivatedRetiredCount: 2, records: privateRecords.map(({ folio: _folio, ...record }) => record) });
    await writeFile(file, JSON.stringify({ ...manifest, records: privateRecords }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await writeFile(file + ".hashes.json", JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    const lines = ["EXCOBA — CÓDIGOS PRIVADOS DE ACTIVACIÓN", "", "Activar en https://excoba-plataforma.vercel.app/activar", "La vigencia comienza al completar la activación, no al emitir el código.", "Cada código permite una sola cuenta. No publiques este archivo ni lo compartas completo con alumnos.", ""];
    for (const months of [4, 2]) {
      lines.push(months === 4 ? "4 MESES NATURALES — TODAS LAS CARRERAS" : "2 MESES NATURALES — SOLO LA PRIMERA CARRERA CONFIRMADA");
      if (months === 2) lines.push("La carrera se confirma una sola vez y no se puede cambiar durante esta licencia.");
      privateRecords.filter(record => record.validityMonths === months).forEach((record, index) => lines.push(`${String(index + 1).padStart(2, "0")}. ${record.folio}`));
      lines.push("");
    }
    await writeFile(file + ".txt", lines.join("\r\n"), { flag: "wx", mode: 0o600 });
    console.info(JSON.stringify({ operation: "prepared_not_issued", batchId: manifest.batchId, count: 20, privateFile: file }));
    return;
  }
  if (command !== "apply" && command !== "verify") throw new Error("INVALID_COMMAND");
  const manifest = planManifestSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const db = new PrismaClient({ log: [] });
  try { console.info(JSON.stringify({ operation: command, batchId: manifest.batchId, ...await applyOrVerifyBatch(db, manifest, command) })); }
  finally { await db.$disconnect(); }
}

if (require.main === module) main().catch(error => {
  // Only our fixed diagnostic identifiers may be printed, never Prisma detail.
  const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "OPERATION_FAILED";
  console.error(`[license-plan-batch] ${code}. No credentials or folios logged; retry the SAME manifest only.`);
  process.exitCode = 1;
});
